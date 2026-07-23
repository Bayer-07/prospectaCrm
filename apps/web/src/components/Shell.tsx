import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Blocks, Bot, Building2, CheckCheck, CheckSquare, ChevronDown, ContactRound, Gauge,
  Inbox, KanbanSquare, LogOut, Mail, Menu, MessageSquareText, Moon, Plus, Search,
  Settings, Sun, UserRound, Users, X,
} from 'lucide-react';
import { api, dateTime, initials, type Envelope } from '../lib/api';
import { Button, Field, Modal } from './ui';
import { useTheme } from '../lib/theme';
import { mergeLatestHistory, RealtimeContext, type RealtimeHistoryData, type RealtimeHistoryPage } from '../lib/realtime';
import { useAuth } from '../App';
import {
  createNotificationAudioContext,
  playIncomingMessageSound,
  shouldPlayIncomingMessageSound,
  type InboxRealtimePayload,
} from '../lib/incoming-notification';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  actionUrl?: string;
  createdAt: string;
  readAt?: string | null;
};

const nav: Array<{ section: string; items: Array<{ to: string; label: string; icon: typeof Gauge; resource?: string }> }> = [
  { section: 'Trabalho', items: [
    { to: '/', label: 'Visão geral', icon: Gauge }, { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare, resource: 'opportunities' },
    { to: '/empresas', label: 'Empresas', icon: Building2, resource: 'companies' }, { to: '/contatos', label: 'Contatos', icon: ContactRound, resource: 'contacts' },
    { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, resource: 'tasks' },
  ] },
  { section: 'Conversas', items: [
    { to: '/inbox', label: 'Inbox', icon: Inbox, resource: 'conversations' }, { to: '/chatbots', label: 'Chatbots', icon: Bot, resource: 'workflows' }, { to: '/campanhas', label: 'Campanhas', icon: MessageSquareText, resource: 'campaigns' },
    { to: '/automacoes', label: 'Automações', icon: Bot, resource: 'workflows' }, { to: '/email', label: 'E-mail', icon: Mail, resource: 'campaigns' },
  ] },
  { section: 'Gestão', items: [
    { to: '/relatorios', label: 'Relatórios', icon: Blocks, resource: 'reports' }, { to: '/configuracoes', label: 'Configurações', icon: Settings, resource: 'users' },
  ] },
];

const pageInfo: Record<string, { title: string; description: string }> = {
  '/': { title: 'Visão geral', description: 'Acompanhe a operação comercial em tempo real.' },
  '/pipeline': { title: 'Pipeline', description: 'Oportunidades organizadas por etapa.' },
  '/empresas': { title: 'Empresas', description: 'Contas e organizações do seu CRM.' },
  '/contatos': { title: 'Contatos', description: 'Pessoas, consentimentos e carteiras.' },
  '/tarefas': { title: 'Tarefas', description: 'Próximas ações da equipe.' },
  '/inbox': { title: 'Inbox', description: 'Conversas compartilhadas do WhatsApp.' },
  '/campanhas': { title: 'Campanhas', description: 'Disparos com cadência e proteção de consentimento.' },
  '/chatbots': { title: 'Chatbots', description: 'Atendimento automático por regras em um mapa visual.' },
  '/automacoes': { title: 'Automações', description: 'Jornadas visuais de WhatsApp e CRM.' },
  '/relatorios': { title: 'Relatórios', description: 'Indicadores comerciais e operacionais.' },
  '/email': { title: 'E-mail', description: 'Modelos e campanhas preparados para ativação futura.' },
  '/configuracoes': { title: 'Configurações', description: 'Equipe, números e segurança.' },
};

export function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const historyRefreshes = useRef(new Map<string, { running: boolean; rerun: boolean }>());
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locationPathRef = useRef(location.pathname);
  const currentUserRef = useRef(user);
  const notificationAudioRef = useRef<AudioContext | null>(null);
  const soundedMessageIdsRef = useRef(new Set<string>());
  locationPathRef.current = location.pathname;
  currentUserRef.current = user;
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api<Envelope<NotificationItem[]>>('/notifications'), refetchInterval: realtimeConnected ? false : 30_000 });
  const unreadNotifications = useMemo(() => notifications.data?.data.filter((item) => !item.readAt) || [], [notifications.data?.data]);
  const unread = unreadNotifications.length;
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: (_response, id) => queryClient.setQueryData<Envelope<NotificationItem[]>>(['notifications'], (current) => current
      ? { ...current, data: current.data.filter((item) => item.id !== id) }
      : current),
  });
  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => queryClient.setQueryData<Envelope<NotificationItem[]>>(['notifications'], (current) => current
      ? { ...current, data: current.data.filter((item) => item.readAt) }
      : current),
  });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => window.location.replace('/login'),
  });
  const rootPath = `/${location.pathname.split('/')[1]}`.replace(/^\/$/, '/');
  const info = pageInfo[rootPath] || pageInfo['/'];
  const isInbox = rootPath === '/inbox';
  const canRead = (resource?: string) => !resource || user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === resource) && (permission.action === '*' || permission.action === 'read'));
  const openNotification = (notification: NotificationItem) => {
    markRead.mutate(notification.id);
    if (notification.actionUrl) navigate(notification.actionUrl);
    setNotificationsOpen(false);
  };

  useEffect(() => {
    const unlockNotificationAudio = () => {
      const context = notificationAudioRef.current || createNotificationAudioContext();
      if (!context) return;
      notificationAudioRef.current = context;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlockNotificationAudio, { capture: true, once: true });
    window.addEventListener('keydown', unlockNotificationAudio, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockNotificationAudio, { capture: true });
      window.removeEventListener('keydown', unlockNotificationAudio, { capture: true });
      const context = notificationAudioRef.current;
      notificationAudioRef.current = null;
      if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const socketBaseUrl = String(import.meta.env.VITE_SOCKET_URL || '').replace(/\/+$/, '');
    const socket = io(`${socketBaseUrl}/realtime`, { withCredentials: true });
    const refreshLatestHistory = async (conversationId: string) => {
      const queryKey = ['conversation-messages', conversationId] as const;
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!query?.getObserversCount()) {
        void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
        return;
      }
      const existingRefresh = historyRefreshes.current.get(conversationId);
      if (existingRefresh?.running) {
        existingRefresh.rerun = true;
        return;
      }
      const state = { running: true, rerun: false };
      historyRefreshes.current.set(conversationId, state);
      try {
        do {
          state.rerun = false;
          const latest = await api<Envelope<RealtimeHistoryPage>>(`/conversations/${conversationId}/messages?limit=30`);
          queryClient.setQueryData<RealtimeHistoryData>(queryKey, (current) => mergeLatestHistory(current, latest));
        } while (state.rerun);
      } catch {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      } finally {
        historyRefreshes.current.delete(conversationId);
      }
    };
    const refreshInbox = (payload?: InboxRealtimePayload, fullHistory = false) => {
      const messageId = payload?.newMessage?.id;
      if (messageId && !soundedMessageIdsRef.current.has(messageId)
        && shouldPlayIncomingMessageSound(
          payload,
          locationPathRef.current,
          currentUserRef.current,
          document.visibilityState === 'visible' && document.hasFocus(),
        )) {
        soundedMessageIdsRef.current.add(messageId);
        if (soundedMessageIdsRef.current.size > 500) soundedMessageIdsRef.current.delete(soundedMessageIdsRef.current.values().next().value!);
        const context = notificationAudioRef.current || createNotificationAudioContext();
        if (context) {
          notificationAudioRef.current = context;
          void playIncomingMessageSound(context).catch(() => undefined);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-counts'] });
      void queryClient.invalidateQueries({ queryKey: payload?.conversationId ? ['conversation', payload.conversationId] : ['conversation'] });
      if (fullHistory) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
      } else if (payload?.conversationId) {
        void refreshLatestHistory(payload.conversationId);
      } else {
        const activeHistories = queryClient.getQueryCache().findAll({ queryKey: ['conversation-messages'] })
          .filter((query) => query.getObserversCount() > 0)
          .map((query) => String(query.queryKey[1] || ''))
          .filter(Boolean);
        for (const conversationId of activeHistories) void refreshLatestHistory(conversationId);
      }
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    const refreshWhatsapp = () => {
      void queryClient.invalidateQueries({ queryKey: ['instances'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation'] });
    };
    const refreshAll = () => {
      refreshInbox(undefined, true);
      refreshWhatsapp();
    };
    socket.on('connect', () => {
      setRealtimeConnected(true);
      // Reconcile after joining the room so an event cannot be lost between
      // the initial HTTP fetch and the asynchronous Socket.IO handshake.
      refreshAll();
    });
    socket.on('disconnect', () => setRealtimeConnected(false));
    socket.on('connect_error', () => setRealtimeConnected(false));
    socket.on('inbox.updated', refreshInbox);
    socket.on('whatsapp.updated', refreshWhatsapp);
    socket.on('notification.created', () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); });
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [queryClient]);

  const sidebar = <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
    <div className="brand"><img className="brand-logo" src="/brand-logo.png" alt="Logo" /><div><strong>CRM Interno</strong><span>Comercial</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
    <nav>{nav.map((group) => <div className="nav-group" key={group.section}><span className="nav-section">{group.section}</span>{group.items.filter((item) => canRead(item.resource)).map((item) => <NavLink end={item.to === '/'} key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><item.icon size={17} strokeWidth={1.9} /><span>{item.label}</span></NavLink>)}</div>)}</nav>
    <div className="sidebar-footer"><img className="workspace-avatar" src="/brand-logo.png" alt="Logo BZS" /><div><strong>BZS Tecnologia</strong><span>Workspace interno</span></div><ChevronDown size={15} /></div>
  </aside>;

  return <div className="app-shell">
    {sidebar}{mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />}
    <main className={`main-column ${isInbox ? 'inbox-shell' : ''}`}>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
        <div className="global-search"><Search size={16} /><input placeholder="Buscar empresas, contatos ou oportunidades…" /><kbd>⌘ K</kbd></div>
        <div className="topbar-actions">
          <button className="quick-add" onClick={() => navigate('/contatos')}><Plus size={16} /><span>Novo</span></button>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <div className="popover-wrap"><button className="icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notificações"><Bell size={18} />{unread > 0 && <i>{unread}</i>}</button>{notificationsOpen && <div className="popover notifications-popover"><div className="popover-header notification-popover-header"><strong>Notificações</strong><div><span>{unread} novas</span>{unread > 0 && <button type="button" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} title="Marcar todas como lidas"><CheckCheck size={14} />Marcar todas como lidas</button>}</div></div><div className="notification-list">{unreadNotifications.length ? unreadNotifications.slice(0, 8).map((item) => <div key={item.id} className="notification-item unread"><button type="button" className="notification-main" onClick={() => openNotification(item)}><span className="notification-icon"><Bell size={14} /></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{dateTime(item.createdAt)}</small></div></button><button type="button" className="notification-read" onClick={() => markRead.mutate(item.id)} disabled={markRead.isPending && markRead.variables === item.id} aria-label={`Marcar ${item.title} como lida`} title="Marcar como lida"><CheckCheck size={16} /></button></div>) : <p className="popover-empty">Tudo lido por aqui.</p>}</div>{(markRead.isError || markAllRead.isError) && <p className="notification-error">Não foi possível marcar a notificação como lida.</p>}</div>}</div>
          <div className="popover-wrap"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><span>{initials(user?.name)}</span><div><strong>{user?.name}</strong><small>{user?.roleKey === 'admin' ? 'Administrador' : user?.roleKey}</small></div><ChevronDown size={14} /></button>{profileOpen && <div className="popover profile-popover"><button type="button" onClick={() => { setProfileOpen(false); setProfileModalOpen(true); }}><UserRound size={16} />Meu perfil</button><button type="button" disabled={!canRead('users')} title={!canRead('users') ? 'Você não possui acesso à gestão da equipe' : undefined} onClick={() => { setProfileOpen(false); navigate('/configuracoes?tab=users'); }}><Users size={16} />Minha equipe</button><button type="button" className="profile-logout" disabled={signOut.isPending} onClick={() => signOut.mutate()}><LogOut size={16} />{signOut.isPending ? 'Saindo…' : 'Sair'}</button>{signOut.isError && <small className="profile-menu-error">Não foi possível sair. Tente novamente.</small>}</div>}</div>
        </div>
      </header>
      <div className="page-heading"><div><h1>{info.title}</h1><p>{info.description}</p></div></div>
      <div className={`page-content ${isInbox ? 'page-content-inbox' : ''}`}><RealtimeContext.Provider value={realtimeConnected}><Outlet /></RealtimeContext.Provider></div>
    </main>
    {profileModalOpen && <ProfileModal onClose={() => setProfileModalOpen(false)} />}
  </div>;
}

function ProfileModal({ onClose }: { onClose(): void }) {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const update = useMutation({
    mutationFn: () => api('/users/me', { method: 'PATCH', body: JSON.stringify(form) }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  if (!user) return null;
  const role = user.roleKey === 'admin' ? 'Administrador' : user.roleKey || 'Usuário';
  return <Modal title="Meu perfil" onClose={() => { if (!update.isPending) onClose(); }} width={500}>
    <form className="modal-form profile-modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); update.mutate(); }}>
      <div className="profile-modal-summary"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{role}</small></div></div>
      <Field label="Nome" value={form.name} minLength={2} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <Field label="E-mail de acesso" type="email" value={form.email} maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      {update.isError && <div className="form-error">{update.error instanceof Error ? update.error.message : 'Não foi possível atualizar o perfil'}</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={update.isPending}>Cancelar</Button><Button type="submit" loading={update.isPending}>Salvar alterações</Button></div>
    </form>
  </Modal>;
}
