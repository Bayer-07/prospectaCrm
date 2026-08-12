import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Blocks, BookOpen, Bot, Building2, Cable, Camera, CheckCheck, CheckSquare, ChevronDown, ContactRound, Eye, Gauge,
  Inbox, KanbanSquare, KeyRound, LogOut, Mail, Menu, MessageSquareReply, MessageSquareText, Moon, Network, Plug, Plus,
  Settings, Sun, Trash2, UserRound, Users, Webhook, X,
} from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
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
import { GlobalSearch } from './GlobalSearch';
import { toast } from '../lib/toast';
import { UserAvatar, userProfilePhotoUrl } from './UserAvatar';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  actionUrl?: string;
  createdAt: string;
  readAt?: string | null;
};

type NavItem = {
  to: string;
  label: string;
  icon: typeof Gauge;
  resource?: string;
  children?: Array<{ to: string; label: string; icon: typeof Gauge; resource?: string }>;
};

const nav: Array<{ section: string; items: NavItem[] }> = [
  { section: 'Trabalho', items: [
    { to: '/', label: 'Visão geral', icon: Gauge }, { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare, resource: 'opportunities' },
    { to: '/empresas', label: 'Empresas', icon: Building2, resource: 'companies' }, { to: '/contatos', label: 'Contatos', icon: ContactRound, resource: 'contacts' },
    { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, resource: 'tasks' },
  ] },
  { section: 'Conversas', items: [
    { to: '/inbox', label: 'Inbox', icon: Inbox, resource: 'conversations' }, { to: '/respostas-rapidas', label: 'Respostas rápidas', icon: MessageSquareReply, resource: 'conversations' }, { to: '/chatbots', label: 'Chatbots', icon: Bot, resource: 'workflows' }, { to: '/campanhas', label: 'Campanhas', icon: MessageSquareText, resource: 'campaigns' },
    { to: '/automacoes', label: 'Automações', icon: Bot, resource: 'workflows' }, { to: '/email', label: 'E-mail', icon: Mail, resource: 'campaigns' },
  ] },
  { section: 'Gestão', items: [
    { to: '/relatorios', label: 'Relatórios', icon: Blocks, resource: 'reports' },
    { to: '/conexoes', label: 'Conexões', icon: Cable, resource: 'integrations' },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, resource: 'users' },
    {
      to: '/integracoes',
      label: 'Integrações',
      icon: Plug,
      children: [
        { to: '/integracoes/api', label: 'API', icon: KeyRound, resource: 'api_keys' },
        { to: '/integracoes/mcp', label: 'Servidor MCP', icon: Network, resource: 'api_keys' },
        { to: '/integracoes/webhooks', label: 'Webhooks', icon: Webhook, resource: 'webhooks' },
        { to: '/integracoes/swagger', label: 'Swagger', icon: BookOpen, resource: 'integrations' },
      ],
    },
  ] },
];

const pageInfo: Record<string, { title: string; description: string }> = {
  '/': { title: 'Visão geral', description: 'Acompanhe a operação comercial em tempo real.' },
  '/pipeline': { title: 'Pipeline', description: 'Oportunidades organizadas por etapa.' },
  '/empresas': { title: 'Empresas', description: 'Contas e organizações do seu CRM.' },
  '/contatos': { title: 'Contatos', description: 'Pessoas, consentimentos e carteiras.' },
  '/tarefas': { title: 'Tarefas', description: 'Próximas ações da equipe.' },
  '/inbox': { title: 'Inbox', description: 'Conversas compartilhadas do WhatsApp.' },
  '/respostas-rapidas': { title: 'Respostas rápidas', description: 'Textos e anexos reutilizáveis no atendimento.' },
  '/campanhas': { title: 'Campanhas', description: 'Disparos com cadência e validação de números no WhatsApp.' },
  '/chatbots': { title: 'Chatbots', description: 'Atendimento automático por regras em um mapa visual.' },
  '/automacoes': { title: 'Automações', description: 'Jornadas visuais de WhatsApp e CRM.' },
  '/relatorios': { title: 'Relatórios', description: 'Indicadores comerciais e operacionais.' },
  '/email': { title: 'E-mail', description: 'Modelos, campanhas e acompanhamento dos envios de e-mail.' },
  '/conexoes': { title: 'Conexões', description: 'Números e sessões conectadas ao WhatsApp.' },
  '/configuracoes': { title: 'Configurações', description: 'Equipe, papéis e permissões.' },
  '/integracoes': { title: 'Integrações', description: 'API, webhooks e documentação técnica.' },
};

export function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(() => window.location.pathname.startsWith('/integracoes'));
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
  });
  const rootPath = `/${location.pathname.split('/')[1]}`.replace(/^\/$/, '/');
  const info = pageInfo[rootPath] || pageInfo['/'];
  const isInbox = rootPath === '/inbox';
  const canRead = (resource?: string) => !resource || user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === resource) && (permission.action === '*' || permission.action === 'read'));
  const canWrite = (resource: string) => user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === resource) && (permission.action === '*' || permission.action === 'write'));
  const quickAddItems = [
    { label: 'Contato', description: 'Cadastrar uma nova pessoa', icon: ContactRound, resource: 'contacts', target: '/contatos?new=1' },
    { label: 'Empresa', description: 'Cadastrar uma nova organização', icon: Building2, resource: 'companies', target: '/empresas?new=1' },
    { label: 'Oportunidade', description: 'Adicionar uma negociação ao funil', icon: KanbanSquare, resource: 'opportunities', target: '/pipeline?new=1' },
  ].filter((item) => canWrite(item.resource));
  const openQuickAdd = (target: string) => {
    setQuickAddOpen(false);
    navigate(target);
  };
  const openNotification = (notification: NotificationItem) => {
    markRead.mutate(notification.id);
    if (notification.actionUrl) navigate(notification.actionUrl);
    setNotificationsOpen(false);
  };

  useEffect(() => {
    if (location.pathname.startsWith('/integracoes')) setIntegrationsOpen(true);
  }, [location.pathname]);

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
    let socketBaseUrl = String(import.meta.env.VITE_SOCKET_URL || '');
    while (socketBaseUrl.endsWith('/')) socketBaseUrl = socketBaseUrl.slice(0, -1);
    const socket = io(`${socketBaseUrl}/realtime`, { withCredentials: true });
    const invalidationTimers = new Map<string, number>();
    const scheduleInvalidation = (queryKey: readonly unknown[], delayMs = 100) => {
      const cacheKey = JSON.stringify(queryKey);
      if (invalidationTimers.has(cacheKey)) return;
      const timer = window.setTimeout(() => {
        invalidationTimers.delete(cacheKey);
        void queryClient.invalidateQueries({ queryKey });
      }, delayMs);
      invalidationTimers.set(cacheKey, timer);
    };
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
      scheduleInvalidation(['conversations']);
      scheduleInvalidation(['conversation-counts']);
      scheduleInvalidation(payload?.conversationId ? ['conversation', payload.conversationId] : ['conversation']);
      if (fullHistory) {
        scheduleInvalidation(['conversation-messages']);
      } else if (payload?.conversationId) {
        void refreshLatestHistory(payload.conversationId);
      } else {
        const activeHistories = queryClient.getQueryCache().findAll({ queryKey: ['conversation-messages'] })
          .filter((query) => query.getObserversCount() > 0)
          .map((query) => String(query.queryKey[1] || ''))
          .filter(Boolean);
        for (const conversationId of activeHistories) void refreshLatestHistory(conversationId);
      }
      scheduleInvalidation(['notifications']);
    };
    const refreshWhatsapp = () => {
      scheduleInvalidation(['instances']);
      scheduleInvalidation(['conversations']);
      scheduleInvalidation(['conversation']);
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
    socket.on('notification.created', () => scheduleInvalidation(['notifications']));
    return () => {
      for (const timer of invalidationTimers.values()) window.clearTimeout(timer);
      invalidationTimers.clear();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [queryClient]);

  const sidebar = <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
    <div className="brand"><img className="brand-logo" src="/brand-logo.png" alt="Logo BZS One" /><div><strong>BZS One</strong></div><button type="button" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
    <nav>{nav.map((group) => <div className="nav-group" key={group.section}>
      <span className="nav-section">{group.section}</span>
      {group.items.map((item) => {
        const visibleChildren = item.children?.filter((child) => canRead(child.resource));
        if (item.children) {
          if (!visibleChildren?.length) return null;
          const active = location.pathname.startsWith(item.to);
          return <div className="nav-submenu-wrap" key={item.to}>
            <button
              type="button"
              className={`nav-item nav-parent ${active ? 'active' : ''}`}
              onClick={() => setIntegrationsOpen((open) => !open)}
              aria-expanded={integrationsOpen}
            >
              <item.icon size={17} strokeWidth={1.9} />
              <span>{item.label}</span>
              <ChevronDown className="nav-parent-chevron" size={14} />
            </button>
            {integrationsOpen && <div className="nav-submenu">
              {visibleChildren.map((child) => <NavLink
                key={child.to}
                to={child.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}
              >
                <child.icon size={14} strokeWidth={1.9} />
                <span>{child.label}</span>
              </NavLink>)}
            </div>}
          </div>;
        }
        if (!canRead(item.resource)) return null;
        return <NavLink end={item.to === '/'} key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><item.icon size={17} strokeWidth={1.9} /><span>{item.label}</span></NavLink>;
      })}
    </div>)}</nav>
    <div className="sidebar-footer"><img className="workspace-avatar" src="/brand-logo.png" alt="Logo BZS" /><div><strong>BZS Tecnologia</strong><span>Ambiente corporativo</span></div><ChevronDown size={15} /></div>
  </aside>;

  return <div className="app-shell">
    {sidebar}{mobileOpen && <button type="button" className="mobile-overlay" onClick={() => setMobileOpen(false)} aria-label="Fechar menu lateral" />}
    <main className={`main-column ${isInbox ? 'inbox-shell' : ''}`}>
      <header className="topbar">
        <button type="button" className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
        <GlobalSearch />
        <div className="topbar-actions">
          <div className="popover-wrap quick-add-wrap">
            <button
              type="button"
              className="quick-add"
              onClick={() => {
                setQuickAddOpen((open) => !open);
                setNotificationsOpen(false);
                setProfileOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={quickAddOpen}
              disabled={!quickAddItems.length}
            >
              <Plus size={16} /><span>Novo</span><ChevronDown size={13} />
            </button>
            {quickAddOpen && <>
              <button className="quick-add-backdrop" type="button" onClick={() => setQuickAddOpen(false)} aria-label="Fechar menu de criação" />
              <div className="popover quick-add-popover" role="menu" aria-label="Adicionar novo">
                <header><strong>O que você deseja adicionar?</strong><small>Escolha um tipo de registro</small></header>
                {quickAddItems.map((item) => <button type="button" role="menuitem" key={item.resource} onClick={() => openQuickAdd(item.target)}>
                  <span><item.icon size={17} /></span>
                  <div><strong>{item.label}</strong><small>{item.description}</small></div>
                </button>)}
              </div>
            </>}
          </div>
          <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <div className="popover-wrap"><button type="button" className="icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notificações"><Bell size={18} />{unread > 0 && <i>{unread}</i>}</button>{notificationsOpen && <div className="popover notifications-popover"><div className="popover-header notification-popover-header"><strong>Notificações</strong><div><span>{unread} novas</span>{unread > 0 && <button type="button" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} title="Marcar todas como lidas"><CheckCheck size={14} />Marcar todas como lidas</button>}</div></div><div className="notification-list">{unreadNotifications.length ? unreadNotifications.slice(0, 8).map((item) => <div key={item.id} className="notification-item unread"><button type="button" className="notification-main" onClick={() => openNotification(item)}><span className="notification-icon"><Bell size={14} /></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{dateTime(item.createdAt)}</small></div></button><button type="button" className="notification-read" onClick={() => markRead.mutate(item.id)} disabled={markRead.isPending && markRead.variables === item.id} aria-label={`Marcar ${item.title} como lida`} title="Marcar como lida"><CheckCheck size={16} /></button></div>) : <p className="popover-empty">Tudo lido por aqui.</p>}</div></div>}</div>
          <div className="popover-wrap"><button type="button" className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><UserAvatar user={user} /><div><strong>{user?.name}</strong><small>{user?.roleKey === 'admin' ? 'Administrador' : user?.roleKey}</small></div><ChevronDown size={14} /></button>{profileOpen && <div className="popover profile-popover"><button type="button" onClick={() => { setProfileOpen(false); setProfileModalOpen(true); }}><UserRound size={16} />Meu perfil</button><button type="button" disabled={!canRead('users')} title={!canRead('users') ? 'Você não possui acesso à gestão da equipe' : undefined} onClick={() => { setProfileOpen(false); navigate('/configuracoes?tab=users'); }}><Users size={16} />Minha equipe</button><button type="button" className="profile-logout" disabled={signOut.isPending} onClick={() => signOut.mutate()}><LogOut size={16} />{signOut.isPending ? 'Saindo…' : 'Sair'}</button></div>}</div>
        </div>
      </header>
      {!isInbox && <div className="page-heading"><div><h1>{info.title}</h1><p>{info.description}</p></div></div>}
      <div className={`page-content ${isInbox ? 'page-content-inbox' : ''}`}><RealtimeContext.Provider value={realtimeConnected}><Outlet /></RealtimeContext.Provider></div>
    </main>
    {profileModalOpen && <ProfileModal onClose={() => setProfileModalOpen(false)} />}
  </div>;
}

function ProfileModal({ onClose }: Readonly<{ onClose(): void }>) {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const update = useMutation({
    mutationFn: () => api('/users/me', { method: 'PATCH', body: JSON.stringify(form) }),
    onSuccess: async () => {
      await refresh();
      toast.success('Perfil atualizado.');
      onClose();
    },
  });
  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const created = await api<Envelope<{ id: string; uploadUrl: string }>>('/media/uploads', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const uploaded = await fetch(created.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploaded.ok) {
        toast.error('Não foi possível enviar a foto para o armazenamento.');
        throw new Error('Falha no envio da foto');
      }
      return api('/users/me/profile-photo', {
        method: 'PATCH',
        body: JSON.stringify({ mediaAssetId: created.data.id }),
      });
    },
    onSuccess: async () => {
      await refresh();
      setPhotoMenuOpen(false);
      toast.success('Foto de perfil atualizada.');
    },
  });
  const removePhoto = useMutation({
    mutationFn: () => api('/users/me/profile-photo', { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      setPhotoMenuOpen(false);
      setPhotoViewerOpen(false);
      toast.success('Foto de perfil removida.');
    },
  });
  if (!user) return null;
  const role = user.roleKey === 'admin' ? 'Administrador' : user.roleKey || 'Usuário';
  const busy = update.isPending || uploadPhoto.isPending || removePhoto.isPending;
  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Selecione uma foto JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A foto deve ter no máximo 5 MB.');
      return;
    }
    uploadPhoto.mutate(file);
  };
  return <>
    <Modal title="Meu perfil" onClose={() => { if (!busy) onClose(); }} width={500}>
      <form className="modal-form profile-modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); update.mutate(); }}>
        <div className="profile-modal-summary">
          <div className="profile-photo-control">
            <button
              className="profile-photo-button"
              type="button"
              onClick={() => setPhotoMenuOpen((open) => !open)}
              aria-label="Opções da foto de perfil"
              aria-expanded={photoMenuOpen}
              disabled={busy}
            >
              <UserAvatar user={user} className="profile-modal-avatar" />
              <span className="profile-photo-edit"><Camera size={13} /></span>
            </button>
            {photoMenuOpen && <div className="profile-photo-menu">
              <button type="button" disabled={!user.profilePhotoId} onClick={() => { setPhotoMenuOpen(false); setPhotoViewerOpen(true); }}><Eye size={16} />Visualizar foto</button>
              <button type="button" className="profile-photo-remove" disabled={!user.profilePhotoId || removePhoto.isPending} onClick={() => removePhoto.mutate()}><Trash2 size={16} />Remover foto</button>
              <button type="button" disabled={uploadPhoto.isPending} onClick={() => photoInputRef.current?.click()}><Camera size={16} />Editar foto</button>
            </div>}
            <input
              ref={photoInputRef}
              className="profile-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                choosePhoto(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </div>
          <div><strong>{user.name}</strong><small>{role}</small></div>
        </div>
        <Field label="Nome" value={form.name} minLength={2} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <Field label="E-mail de acesso" type="email" value={form.email} maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" loading={update.isPending} disabled={uploadPhoto.isPending || removePhoto.isPending}>Salvar alterações</Button></div>
      </form>
    </Modal>
    {photoViewerOpen && <Modal title="Foto de perfil" onClose={() => setPhotoViewerOpen(false)} width={620}>
      <div className="profile-photo-viewer">
        <img src={userProfilePhotoUrl(user)} alt={`Foto de ${user.name}`} />
      </div>
    </Modal>}
  </>;
}
