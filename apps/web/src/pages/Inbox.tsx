import { lazy, memo, Suspense, type FormEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { extractSharedWhatsappContacts, type SharedWhatsappContact } from '@prospecta/contracts/whatsapp-contact';
import { AlertCircle, Archive, ArrowRightLeft, BriefcaseBusiness, Building2, Cable, Check, CheckCheck, ChevronDown, Copy, Clock, Download, ExternalLink, Eye, FileText, Filter, History, Inbox, Link2, LoaderCircle, Mail, MapPin, MessageCircle, MessageCirclePlus, MessageSquareReply, Mic, MoreHorizontal, Pause, Pencil, Phone, Pin, PinOff, Play, Plus, Reply, RotateCcw, Search, Send, ShieldCheck, Smile, SmilePlus, Sparkles, Tags, Trash2, Upload, UserCheck, UserPlus, UserRound, UsersRound, Workflow, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api, apiErrorMessage, apiFetch, apiUrl, dateTime, formatPhone, initials, type Envelope } from '../lib/api';
import { canChangeConversationInstance } from '../lib/conversation-instance';
import { aiSuggestionDisposition } from '../lib/ai-suggestion';
import { describeMessageFailure, type MessageFailure } from '../lib/message-error';
import type { Company, Contact, Conversation, ConversationEvent, Message, Opportunity, Pipeline } from '../lib/types';
import { Button, Empty, Field, Modal, PageLoading, SelectField } from '../components/ui';
import { ContactModal } from '../components/ContactModal';
import { FollowUpModal } from '../components/FollowUpModal';
import { firstWhatsappLink, WhatsappComposer, WhatsappText, type WhatsappComposerHandle } from '../components/WhatsappText';
import { useAuth } from '../App';
import { useRealtimeConnected } from '../lib/realtime';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { isMessageEdited, messageEditedAt, messageEditHistory } from '../lib/message-edit-history';
import { toast } from '../lib/toast';
import { inboxFilterForStatus, shouldSyncInboxFilter, type InboxFilter } from '../lib/inbox-navigation';
import { extractWhatsappLocation, type WhatsappLocation } from '../lib/whatsapp-location';
import { composerCommandSearch, detectComposerCommand } from '../lib/composer-command';

type WhatsappInstance = { id: string; name: string; phone?: string; status: string };
type ConversationHistoryPage = { messages: Message[]; events: ConversationEvent[]; nextCursor: string | null };
type ConversationAssignee = { id: string; name: string; email: string; team?: { id: string; name: string; color: string } };
type WorkflowShortcut = { id: string; name: string; description?: string; status: string; publishedVersion?: number };
type WorkflowEnrollmentResult = { requested: number; enrolled: number; skipped: number };
type QuickReplyShortcut = {
  id: string;
  title: string;
  shortcut: string;
  text?: string | null;
  mediaAsset?: { id: string; filename: string; contentType: string; sizeBytes: number } | null;
};
type ContactInlineField = 'phone' | 'email' | 'companyId';
type TicketContextMenuState = { conversation: Conversation; top: number; left: number };
type ConversationListFilters = { lastInteractionFrom: string; lastInteractionTo: string; instanceId: string; assigneeId: string };
type ConversationFilterOptions = {
  instances: WhatsappInstance[];
  users: Array<{ id: string; name: string; email: string }>;
};
type MessageLinkPreviewData = {
  url: string;
  hostname: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
};
type AiGeneration = {
  id: string;
  type: 'SUMMARY' | 'REPLY_SUGGESTION' | 'CHATBOT_REPLY' | 'CONFIG_TEST';
  status: 'PENDING' | 'WAITING_INPUT' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'STALE';
  scope?: 'CURRENT_ATTENDANCE' | 'FULL_CONVERSATION' | null;
  result?: { reply?: string; overview?: string; need?: string; commitments?: string[]; nextSteps?: string[]; pending?: string[] } | null;
  error?: string | null;
  progress: number;
  model?: string | null;
  completedAt?: string | null;
  sourceLastMessageId?: string | null;
};
type AiProposal = {
  id: string;
  status: 'PENDING' | 'PARTIALLY_APPLIED' | 'APPLIED' | 'DISMISSED';
  changes: { name?: string; email?: string; jobTitle?: string; companyName?: string; qualificationNote?: string };
  appliedFields: string[];
};
const AI_TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'STALE'];

function completedSuggestion(generation: AiGeneration, requestedGenerationId?: string) {
  if (generation.status !== 'COMPLETED' || generation.type !== 'REPLY_SUGGESTION' || requestedGenerationId !== generation.id) return '';
  return generation.result?.reply?.trim() || '';
}

const EMPTY_CONVERSATION_FILTERS: ConversationListFilters = {
  lastInteractionFrom: '',
  lastInteractionTo: '',
  instanceId: '',
  assigneeId: '',
};

function conversationFiltersQuery(filters: ConversationListFilters) {
  const params = new URLSearchParams();
  if (filters.instanceId) params.set('instanceId', filters.instanceId);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.lastInteractionFrom) {
    params.set('lastInteractionFrom', new Date(`${filters.lastInteractionFrom}T00:00:00`).toISOString());
  }
  if (filters.lastInteractionTo) {
    const nextDay = new Date(`${filters.lastInteractionTo}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    params.set('lastInteractionTo', nextDay.toISOString());
  }
  return params.toString();
}

function normalizeEditablePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return trimmed;
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const unique = new Map<string, T>();
  for (const item of items) unique.set(item.id, item);
  return [...unique.values()];
}

function awaitsRecoveredCaption(message: Message) {
  if (message.text || !message.media?.length || !['image', 'video', 'document'].includes(message.type)) return false;
  if (message.payload?.captionCompanionProviderMessageId || message.payload?.recoveredCaption) return false;
  const age = Date.now() - new Date(message.createdAt).getTime();
  return age >= 0 && age < 2 * 60_000;
}

function canWriteResource(user: ReturnType<typeof useAuth>['user'], resource: string) {
  return Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === resource)
    && (permission.action === '*' || permission.action === 'write')));
}

function followUpDisabledReason(conversation: Conversation, allowed: boolean) {
  if (!allowed) return 'Você não possui permissão para agendar follow-ups';
  if (!conversation.assignee) return 'Assuma a conversa antes de agendar um follow-up';
  return undefined;
}

function conversationListUrl(filter: InboxFilter, view: string, filters: string) {
  const suffix = filters ? `&${filters}` : '';
  return `/conversations?status=${filter}&view=${view}${suffix}`;
}

function conversationHistoryUrl(conversationId: string, cursor: string) {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return `/conversations/${conversationId}/messages?limit=30${cursorQuery}`;
}

function optimisticConversationStatus(requestedStatus: 'OPEN' | 'CLOSED', conversation: Conversation) {
  if (requestedStatus === 'CLOSED') return 'CLOSED';
  if (conversation.assignee) return 'OPEN';
  return 'WAITING';
}

function inboxEmptyText(filter: InboxFilter): [string, string] {
  if (filter === 'waiting') return ['Nenhum ticket aguardando atendimento', 'Novas mensagens sem atendente aparecerão nesta fila.'];
  if (filter === 'open') return ['Nenhum ticket em atendimento', 'As conversas aparecem aqui depois que um atendente assumir.'];
  return ['Nenhum ticket encerrado', 'Atendimentos finalizados ficarão guardados aqui.'];
}

function inlineContactValue(field: ContactInlineField, contact: Contact, companyId?: string) {
  if (field === 'phone') return contact.phone || '';
  if (field === 'email') return contact.email || '';
  return companyId || '';
}

function opportunityStatusLabel(status: string) {
  if (status === 'OPEN') return 'Em andamento';
  if (status === 'WON') return 'Ganha';
  return 'Perdida';
}

type ShortcutMenuKeyOptions<T> = {
  itemCount: number;
  selectedIndex: number;
  setSelectedIndex(updater: (current: number) => number): void;
  close(): void;
  select(item: T): void;
  items: T[];
};

function handleShortcutMenuKey<T>(event: React.KeyboardEvent<HTMLDivElement>, options: ShortcutMenuKeyOptions<T>) {
  if (event.key === 'Escape') {
    options.close();
    return true;
  }
  if (event.key === 'ArrowDown') {
    options.setSelectedIndex((current) => options.itemCount ? (current + 1) % options.itemCount : 0);
    return true;
  }
  if (event.key === 'ArrowUp') {
    options.setSelectedIndex((current) => options.itemCount ? (current - 1 + options.itemCount) % options.itemCount : 0);
    return true;
  }
  if (event.key !== 'Enter' || event.shiftKey) return false;
  const item = options.items[options.selectedIndex];
  if (item) options.select(item);
  return true;
}

function conversationListPreview(conversation: Conversation) {
  const latestMessage = conversation.messages[0];
  if (latestMessage?.text) return latestMessage.text;
  if (latestMessage?.type === 'location') return 'Localização compartilhada';
  return 'Mídia ou nova conversa';
}

type InboxFilterPanelProps = Readonly<{
  draft: ConversationListFilters;
  activeCount: number;
  invalidDateRange: boolean;
  options?: ConversationFilterOptions;
  optionsLoading: boolean;
  optionsError: boolean;
  onChange(field: keyof ConversationListFilters, value: string): void;
  onClose(): void;
  onClear(): void;
  onApply(): void;
}>;

function InboxFilterPanel(props: InboxFilterPanelProps) {
  const { draft, activeCount, invalidDateRange, options, optionsLoading, optionsError } = props;
  const hasDraftFilters = Object.values(draft).some(Boolean);
  return <div className="conversation-filter-panel">
    <header><div><strong>Filtrar conversas</strong><span>Refine os tickets desta aba</span></div><button type="button" onClick={props.onClose} aria-label="Fechar filtros"><X size={16} /></button></header>
    <div className="conversation-filter-section">
      <span>Última interação</span>
      <div className="conversation-filter-dates">
        <span><small>De</small><input type="date" value={draft.lastInteractionFrom} max={draft.lastInteractionTo || undefined} onChange={(event) => props.onChange('lastInteractionFrom', event.target.value)} /></span>
        <span><small>Até</small><input type="date" value={draft.lastInteractionTo} min={draft.lastInteractionFrom || undefined} onChange={(event) => props.onChange('lastInteractionTo', event.target.value)} /></span>
      </div>
      {invalidDateRange && <p>A data final deve ser igual ou posterior à inicial.</p>}
    </div>
    <label className="conversation-filter-field"><span>Conexão Evolution</span><select value={draft.instanceId} onChange={(event) => props.onChange('instanceId', event.target.value)}><option value="">Todas as conexões</option>{optionsLoading && <option disabled>Carregando conexões…</option>}{(options?.instances || []).map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${formatPhone(instance.phone)}` : ''} · {instance.status === 'CONNECTED' ? 'Conectada' : 'Desconectada'}</option>)}</select></label>
    <label className="conversation-filter-field"><span>Usuário responsável</span><select value={draft.assigneeId} onChange={(event) => props.onChange('assigneeId', event.target.value)}><option value="">Todos os usuários</option><option value="unassigned">Sem atendente</option>{optionsLoading && <option disabled>Carregando usuários…</option>}{(options?.users || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
    {optionsError && <div className="conversation-filter-error">Não foi possível carregar as opções de filtro.</div>}
    <footer><button type="button" className="conversation-filter-clear" onClick={props.onClear} disabled={!activeCount && !hasDraftFilters}>Limpar</button><Button type="button" onClick={props.onApply} disabled={invalidDateRange}>Aplicar filtros</Button></footer>
  </div>;
}

type InboxConversationListProps = Readonly<{
  conversations: Conversation[];
  loading: boolean;
  selectedId: string;
  activeFilterCount: number;
  onSelect(id: string): void;
  onContextMenu(event: React.MouseEvent<HTMLButtonElement>, conversation: Conversation): void;
  onClearFilters(): void;
}>;

function InboxConversationList(props: InboxConversationListProps) {
  if (props.loading) {
    return <div className="conversation-list-loading" role="status"><LoaderCircle className="spin" size={20} /><span>Carregando tickets…</span></div>;
  }
  if (!props.conversations.length) {
    const description = props.activeFilterCount ? 'Ajuste ou limpe os filtros aplicados.' : 'Tente buscar por outro contato.';
    return <div className="conversation-list-empty"><Filter size={20} /><strong>Nenhuma conversa encontrada</strong><span>{description}</span>{props.activeFilterCount > 0 && <button type="button" onClick={props.onClearFilters}>Limpar filtros</button>}</div>;
  }
  return <>{props.conversations.map((item) => <button
    type="button"
    key={item.id}
    className={`${item.id === props.selectedId ? 'active ' : ''}${item.isPinned ? 'pinned' : ''}`.trim()}
    onClick={() => props.onSelect(item.id)}
    onContextMenu={(event) => props.onContextMenu(event, item)}
  ><WhatsappAvatar conversationId={item.id} name={item.contact.name} /><div><div><strong>{item.contact.name}</strong><span className="conversation-ticket-meta">{item.isPinned && <Pin size={12} aria-label="Conversa fixada" />}<time>{item.lastMessageAt ? dateTime(item.lastMessageAt).split(' ')[1] : ''}</time></span></div><p>{conversationListPreview(item)}</p><small>{item.instance.name}{item.assignee ? ` · ${item.assignee.name}` : ' · Aguardando atendente'}</small></div>{item.unreadCount > 0 && <b>{item.unreadCount}</b>}</button>)}</>;
}

type InboxSidebarProps = Readonly<{
  isAdmin: boolean;
  showAll: boolean;
  filter: InboxFilter;
  counts?: { waiting: number; open: number; closed: number };
  search: string;
  activeFilterCount: number;
  filterPanelOpen: boolean;
  draftFilters: ConversationListFilters;
  invalidDateRange: boolean;
  filterOptions?: ConversationFilterOptions;
  filterOptionsLoading: boolean;
  filterOptionsError: boolean;
  conversationsLoading: boolean;
  conversations: Conversation[];
  selectedId: string;
  onToggleAll(): void;
  onNewConversation(): void;
  onFilterChange(filter: InboxFilter): void;
  onSearch(value: string): void;
  onToggleFilterPanel(): void;
  onCloseFilterPanel(): void;
  onDraftFilterChange(field: keyof ConversationListFilters, value: string): void;
  onClearFilters(): void;
  onApplyFilters(): void;
  onSelectConversation(id: string): void;
  onContextMenu(event: React.MouseEvent<HTMLButtonElement>, conversation: Conversation): void;
}>;

function InboxSidebar(props: InboxSidebarProps) {
  const allLabel = props.showAll ? 'Mostrar somente meus atendimentos' : 'Visualizar todos os atendimentos';
  return <aside className="conversation-sidebar">
    <div className="conversation-sidebar-heading"><strong>Conversas</strong><div className="conversation-sidebar-actions">{props.isAdmin && <button type="button" className={`icon-button conversation-view-all${props.showAll ? ' active' : ''}`} onClick={props.onToggleAll} aria-label={allLabel} title={allLabel}><Eye size={16} /></button>}<button type="button" className="icon-button conversation-new-button" onClick={props.onNewConversation} aria-label="Nova conversa" title="Nova conversa"><MessageCirclePlus size={18} /></button></div></div>
    <div className="inbox-tabs">
      <button type="button" className={props.filter === 'waiting' ? 'active' : ''} onClick={() => props.onFilterChange('waiting')}>Aguardando <span>{props.counts?.waiting || 0}</span></button>
      <button type="button" className={props.filter === 'open' ? 'active' : ''} onClick={() => props.onFilterChange('open')}>Abertas <span>{props.counts?.open || 0}</span></button>
      <button type="button" className={props.filter === 'closed' ? 'active' : ''} onClick={() => props.onFilterChange('closed')}>Encerradas <span>{props.counts?.closed || 0}</span></button>
    </div>
    <div className="conversation-search">
      <Search size={15} />
      <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Buscar conversa…" />
      <button type="button" className={props.activeFilterCount ? 'active' : ''} onClick={props.onToggleFilterPanel} aria-label="Filtrar conversas" aria-expanded={props.filterPanelOpen} title={props.activeFilterCount ? `${props.activeFilterCount} filtro(s) ativo(s)` : 'Filtrar conversas'}><Filter size={14} />{props.activeFilterCount > 0 && <b>{props.activeFilterCount}</b>}</button>
      {props.filterPanelOpen && <InboxFilterPanel draft={props.draftFilters} activeCount={props.activeFilterCount} invalidDateRange={props.invalidDateRange} options={props.filterOptions} optionsLoading={props.filterOptionsLoading} optionsError={props.filterOptionsError} onChange={props.onDraftFilterChange} onClose={props.onCloseFilterPanel} onClear={props.onClearFilters} onApply={props.onApplyFilters} />}
    </div>
    <div className="conversation-list" aria-busy={props.conversationsLoading}><InboxConversationList conversations={props.conversations} loading={props.conversationsLoading} selectedId={props.selectedId} activeFilterCount={props.activeFilterCount} onSelect={props.onSelectConversation} onContextMenu={props.onContextMenu} onClearFilters={props.onClearFilters} /></div>
  </aside>;
}

export function InboxPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const realtimeConnected = useRealtimeConnected();
  const isAdmin = user?.roleKey === 'admin';
  const [filter, setFilter] = useState<InboxFilter>('waiting');
  const [search, setSearch] = useState('');
  const [startingConversation, setStartingConversation] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [ticketMenu, setTicketMenu] = useState<TicketContextMenuState | null>(null);
  const [followUpConversation, setFollowUpConversation] = useState<Conversation | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [draftListFilters, setDraftListFilters] = useState<ConversationListFilters>({ ...EMPTY_CONVERSATION_FILTERS });
  const [appliedListFilters, setAppliedListFilters] = useState<ConversationListFilters>({ ...EMPTY_CONVERSATION_FILTERS });
  const closingWithoutFilterChangeRef = useRef<string | null>(null);
  const view = isAdmin && showAll ? 'all' : 'mine';
  const listFilterQuery = useMemo(() => conversationFiltersQuery(appliedListFilters), [appliedListFilters]);
  const activeListFilterCount = useMemo(() => Object.values(appliedListFilters).filter(Boolean).length, [appliedListFilters]);
  const conversations = useQuery({
    queryKey: ['conversations', filter, view, listFilterQuery],
    queryFn: () => api<Envelope<Conversation[]>>(conversationListUrl(filter, view, listFilterQuery)),
    refetchInterval: realtimeConnected ? false : 15_000,
  });
  const counts = useQuery({ queryKey: ['conversation-counts', view], queryFn: () => api<Envelope<{ waiting: number; open: number; closed: number }>>(`/conversations/counts?view=${view}`), refetchInterval: realtimeConnected ? false : 15_000 });
  const filterOptions = useQuery({
    queryKey: ['conversation-filter-options', view],
    queryFn: () => api<Envelope<ConversationFilterOptions>>(`/conversations/filter-options?view=${view}`),
    enabled: filterPanelOpen,
    staleTime: 60_000,
  });
  const selectedId = conversationId || '';
  const conversation = useQuery({ queryKey: ['conversation', selectedId], queryFn: () => api<Envelope<Conversation>>(`/conversations/${selectedId}`), enabled: Boolean(selectedId), refetchInterval: realtimeConnected ? false : 10_000 });
  const history = useInfiniteQuery({
    queryKey: ['conversation-messages', selectedId],
    queryFn: ({ pageParam }) => api<Envelope<ConversationHistoryPage>>(conversationHistoryUrl(selectedId, pageParam)),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.data.nextCursor || undefined,
    enabled: Boolean(selectedId),
  });
  const captionRefreshPending = Boolean(history.data?.pages.some((page) => page.data.messages.some(awaitsRecoveredCaption)));
  const captionRefresh = useQuery({
    queryKey: ['conversation-caption-refresh', selectedId],
    queryFn: () => api<Envelope<ConversationHistoryPage>>(`/conversations/${selectedId}/messages?limit=30`),
    enabled: Boolean(selectedId) && captionRefreshPending && !realtimeConnected,
    refetchInterval: 2_000,
  });
  useEffect(() => {
    if (!selectedId || !captionRefresh.data) return;
    client.setQueryData<{ pages: Array<Envelope<ConversationHistoryPage>>; pageParams: unknown[] }>(['conversation-messages', selectedId], (current) => {
      if (!current?.pages.length) return current;
      return { ...current, pages: [captionRefresh.data!, ...current.pages.slice(1)] };
    });
  }, [captionRefresh.data, client, selectedId]);
  const markRead = useMutation({
    mutationFn: (id: string) => api<Envelope<Conversation>>(`/conversations/${id}/read`, { method: 'POST' }),
    onMutate: (id) => {
      client.setQueriesData<Envelope<Conversation[]>>({ queryKey: ['conversations'] }, (current) => current ? { ...current, data: current.data.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item) } : current);
      client.setQueryData<Envelope<Conversation>>(['conversation', id], (current) => current ? { ...current, data: { ...current.data, unreadCount: 0 } } : current);
    },
    onError: (_error, id) => {
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });
  useEffect(() => {
    if (selectedId && (conversation.data?.data.unreadCount || 0) > 0 && !markRead.isPending) markRead.mutate(selectedId);
  }, [selectedId, conversation.data?.data.unreadCount, markRead.isPending]);
  useEffect(() => {
    const currentStatus = conversation.data?.data.status;
    if (!shouldSyncInboxFilter(conversationId, currentStatus, closingWithoutFilterChangeRef.current)) return;
    setFilter(inboxFilterForStatus(currentStatus!));
  }, [conversationId, conversation.data?.data.status]);
  useEffect(() => {
    if (!conversationId) closingWithoutFilterChangeRef.current = null;
  }, [conversationId]);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const shown = useMemo(() => conversations.data?.data.filter((item) => !normalizedSearch || item.contact.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)) || [], [conversations.data?.data, normalizedSearch]);
  const historyMessages = useMemo(() => uniqueById(history.data?.pages.flatMap((page) => page.data.messages) || []), [history.data]);
  const historyEvents = useMemo(() => uniqueById(history.data?.pages.flatMap((page) => page.data.events) || []), [history.data]);
  const selectedConversation = useMemo(() => conversation.data?.data
    ? { ...conversation.data.data, messages: historyMessages, events: historyEvents }
    : undefined, [conversation.data?.data, historyMessages, historyEvents]);
  const invalidate = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['conversations'] });
    void client.invalidateQueries({ queryKey: ['conversation-counts'] });
    void client.invalidateQueries({ queryKey: ['conversation', selectedId] });
    void client.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
  }, [client, selectedId]);
  const moveToConversationStatus = useCallback((updated: Conversation) => {
    const nextFilter = inboxFilterForStatus(updated.status);
    setFilter(nextFilter);
    navigate(`/inbox/${updated.id}`, { replace: true });
    invalidate();
  }, [invalidate, navigate]);
  const assign = useMutation({
    mutationFn: (assigneeId: string | null) => api<Envelope<Conversation>>(`/conversations/${selectedId}/assign`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) }),
    onSuccess: (response) => moveToConversationStatus(response.data),
  });
  const status = useMutation({
    mutationFn: ({ conversationId: statusConversationId, value }: { conversationId: string; value: 'OPEN' | 'CLOSED' }) =>
      api<Envelope<Conversation>>(`/conversations/${statusConversationId}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) }),
    onMutate: async ({ conversationId: statusConversationId, value }) => {
      const current = client.getQueryData<Envelope<Conversation>>(['conversation', statusConversationId])?.data
        || (selectedId === statusConversationId ? conversation.data?.data : undefined);
      if (!current) return;
      await Promise.all([
        client.cancelQueries({ queryKey: ['conversation', statusConversationId] }),
        client.cancelQueries({ queryKey: ['conversations'] }),
        client.cancelQueries({ queryKey: ['conversation-counts'] }),
      ]);
      const previousFilter = filter;
      const targetStatus = optimisticConversationStatus(value, current);
      const targetFilter = inboxFilterForStatus(targetStatus);
      const sourceKey = ['conversations', previousFilter, view, listFilterQuery] as const;
      const targetKey = ['conversations', targetFilter, view, listFilterQuery] as const;
      const conversationKey = ['conversation', statusConversationId] as const;
      const countsKey = ['conversation-counts', view] as const;
      const previousConversation = client.getQueryData<Envelope<Conversation>>(conversationKey);
      const previousSource = client.getQueryData<Envelope<Conversation[]>>(sourceKey);
      const previousTarget = client.getQueryData<Envelope<Conversation[]>>(targetKey);
      const previousCounts = client.getQueryData<Envelope<{ waiting: number; open: number; closed: number }>>(countsKey);
      const optimistic = { ...current, status: targetStatus };

      if (value === 'CLOSED') closingWithoutFilterChangeRef.current = statusConversationId;
      client.setQueryData<Envelope<Conversation>>(conversationKey, (cached) => cached ? { ...cached, data: { ...cached.data, status: targetStatus } } : { data: optimistic });
      client.setQueryData<Envelope<Conversation[]>>(sourceKey, (cached) => cached ? { ...cached, data: cached.data.filter((item) => item.id !== statusConversationId) } : { data: [] });
      client.setQueryData<Envelope<Conversation[]>>(targetKey, (cached) => ({
        ...(cached || { data: [] }),
        data: uniqueById([optimistic, ...(cached?.data || []).filter((item) => item.id !== statusConversationId)]),
      }));
      client.setQueryData<Envelope<{ waiting: number; open: number; closed: number }>>(countsKey, (cached) => {
        if (!cached || previousFilter === targetFilter) return cached;
        return { ...cached, data: {
          ...cached.data,
          [previousFilter]: Math.max(0, cached.data[previousFilter] - 1),
          [targetFilter]: cached.data[targetFilter] + 1,
        } };
      });
      const clearedSelection = value === 'CLOSED';
      if (clearedSelection) navigate('/inbox', { replace: true });
      else setFilter(targetFilter);
      return {
        previousFilter,
        previousSelectedId: statusConversationId,
        clearedSelection,
        sourceKey,
        targetKey,
        conversationKey,
        countsKey,
        previousConversation,
        previousSource,
        previousTarget,
        previousCounts,
      };
    },
    onSuccess: (response) => {
      toast.success(response.data.status === 'CLOSED' ? 'Atendimento finalizado.' : 'Atendimento reaberto.');
      const targetFilter = inboxFilterForStatus(response.data.status);
      const cachedConversation = client.getQueryData<Envelope<Conversation>>(['conversation', response.data.id]);
      const reconciled = cachedConversation ? { ...cachedConversation.data, ...response.data } : response.data;
      client.setQueryData<Envelope<Conversation>>(['conversation', response.data.id], (cached) => cached ? { ...cached, data: reconciled } : { data: reconciled });
      client.setQueryData<Envelope<Conversation[]>>(['conversations', targetFilter, view, listFilterQuery], (cached) => ({
        ...(cached || { data: [] }),
        data: uniqueById([reconciled, ...(cached?.data || []).filter((item) => item.id !== response.data.id)]),
      }));
    },
    onError: (_error, _value, context) => {
      if (context) {
        const snapshots = [
          [context.conversationKey, context.previousConversation],
          [context.sourceKey, context.previousSource],
          [context.targetKey, context.previousTarget],
          [context.countsKey, context.previousCounts],
        ] as const;
        for (const [queryKey, snapshot] of snapshots) {
          if (snapshot) client.setQueryData(queryKey, snapshot);
          else client.removeQueries({ queryKey, exact: true });
        }
        if (closingWithoutFilterChangeRef.current === context.previousSelectedId) closingWithoutFilterChangeRef.current = null;
        setFilter(context.previousFilter);
        if (context.clearedSelection) navigate(`/inbox/${context.previousSelectedId}`, { replace: true });
      }
    },
    onSettled: (_data, _error, variables) => {
      void client.invalidateQueries({ queryKey: ['conversations'], refetchType: 'active' });
      void client.invalidateQueries({ queryKey: ['conversation-counts'], refetchType: 'active' });
      void client.invalidateQueries({ queryKey: ['conversation', variables.conversationId], refetchType: 'active' });
      void client.invalidateQueries({ queryKey: ['conversation-messages', variables.conversationId], refetchType: 'active' });
    },
  });
  const changeFilter = (next: InboxFilter) => {
    setFilter(next);
    navigate('/inbox', { replace: true });
  };
  const toggleAll = () => {
    const nextShowAll = !showAll;
    setShowAll(nextShowAll);
    if (!nextShowAll && appliedListFilters.assigneeId && !['unassigned', user?.userId].includes(appliedListFilters.assigneeId)) {
      setAppliedListFilters((current) => ({ ...current, assigneeId: '' }));
      setDraftListFilters((current) => ({ ...current, assigneeId: '' }));
    }
    navigate('/inbox', { replace: true });
  };
  const toggleFilterPanel = () => {
    setFilterPanelOpen((open) => {
      if (!open) setDraftListFilters({ ...appliedListFilters });
      return !open;
    });
  };
  const clearListFilters = () => {
    setDraftListFilters({ ...EMPTY_CONVERSATION_FILTERS });
    setAppliedListFilters({ ...EMPTY_CONVERSATION_FILTERS });
    setFilterPanelOpen(false);
  };
  const applyListFilters = () => {
    if (isAdmin && draftListFilters.assigneeId && !['unassigned', user?.userId].includes(draftListFilters.assigneeId)) {
      setShowAll(true);
    }
    setAppliedListFilters({ ...draftListFilters });
    setFilterPanelOpen(false);
  };
  const invalidFilterDateRange = Boolean(
    draftListFilters.lastInteractionFrom
    && draftListFilters.lastInteractionTo
    && draftListFilters.lastInteractionFrom > draftListFilters.lastInteractionTo,
  );
  const openTicketMenu = (event: React.MouseEvent<HTMLButtonElement>, item: Conversation) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 252;
    const height = 294;
    const pointerX = event.clientX || rect.left + Math.min(rect.width - 12, 90);
    const pointerY = event.clientY || rect.top + 18;
    setTicketMenu({
      conversation: item,
      top: Math.max(8, Math.min(pointerY, window.innerHeight - height - 8)),
      left: Math.max(8, Math.min(pointerX, window.innerWidth - width - 8)),
    });
  };
  const emptyText = inboxEmptyText(filter);
  const loadOlderMessages = async () => {
    const result = await history.fetchNextPage();
    if (result.isError) throw result.error;
  };
  const transferConversation = async (assigneeId: string) => {
    if (!selectedConversation) return;
    const response = await api<Envelope<Conversation>>(`/conversations/${selectedConversation.id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) });
    if (!isAdmin && assigneeId !== user?.userId) {
      setFilter('open');
      navigate('/inbox', { replace: true });
      invalidate();
      return;
    }
    moveToConversationStatus(response.data);
  };
  const toggleConversationStatus = () => {
    if (status.isPending || !selectedConversation) return;
    status.mutate({
      conversationId: selectedConversation.id,
      value: selectedConversation.status === 'CLOSED' ? 'OPEN' : 'CLOSED',
    });
  };
  let conversationContent: ReactNode;
  if (!selectedId) {
    conversationContent = <div className="conversation-empty"><Empty icon={<Inbox />} title="Nenhum atendimento selecionado" description="Selecione uma conversa para conseguir enviar mensagens." /></div>;
  } else if (conversation.isLoading || history.isLoading) {
    conversationContent = <PageLoading />;
  } else if (selectedConversation) {
    conversationContent = <ConversationView
      key={selectedConversation.id}
      conversation={selectedConversation}
      hasOlderMessages={Boolean(history.hasNextPage)}
      loadingOlderMessages={history.isFetchingNextPage}
      onLoadOlderMessages={loadOlderMessages}
      onSend={invalidate}
      onAssign={() => assign.mutate(selectedConversation.assignee?.id ? null : 'self')}
      onTransfer={transferConversation}
      statusChanging={status.isPending}
      onClose={toggleConversationStatus}
    />;
  } else {
    conversationContent = <div className="conversation-empty"><Empty icon={<Inbox />} title={emptyText[0]} description={emptyText[1]} /></div>;
  }
  return <div className="inbox-layout">
    <InboxSidebar
      isAdmin={isAdmin}
      showAll={showAll}
      filter={filter}
      counts={counts.data?.data}
      search={search}
      activeFilterCount={activeListFilterCount}
      filterPanelOpen={filterPanelOpen}
      draftFilters={draftListFilters}
      invalidDateRange={invalidFilterDateRange}
      filterOptions={filterOptions.data?.data}
      filterOptionsLoading={filterOptions.isLoading}
      filterOptionsError={filterOptions.isError}
      conversationsLoading={conversations.isLoading}
      conversations={shown}
      selectedId={selectedId}
      onToggleAll={toggleAll}
      onNewConversation={() => setStartingConversation(true)}
      onFilterChange={changeFilter}
      onSearch={setSearch}
      onToggleFilterPanel={toggleFilterPanel}
      onCloseFilterPanel={() => setFilterPanelOpen(false)}
      onDraftFilterChange={(field, value) => setDraftListFilters((current) => ({ ...current, [field]: value }))}
      onClearFilters={clearListFilters}
      onApplyFilters={applyListFilters}
      onSelectConversation={(id) => { setTicketMenu(null); navigate(`/inbox/${id}`); }}
      onContextMenu={openTicketMenu}
    />
    {conversationContent}
    <TicketContextActions
      menu={ticketMenu}
      onClose={() => setTicketMenu(null)}
      onUpdated={invalidate}
      onFollowUp={setFollowUpConversation}
      onFinalized={(conversationId) => {
        if (conversationId === selectedId) {
          closingWithoutFilterChangeRef.current = conversationId;
          navigate('/inbox', { replace: true });
        }
        invalidate();
      }}
    />
    {followUpConversation && <FollowUpModal
      conversationId={followUpConversation.id}
      contactName={followUpConversation.contact.name}
      followUpId={followUpConversation.followUps?.[0]?.id}
      onClose={() => setFollowUpConversation(null)}
      onSaved={invalidate}
    />}
    {startingConversation && <NewConversationModal onClose={() => setStartingConversation(false)} onStarted={(id) => {
      setStartingConversation(false);
      setFilter('open');
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: ['conversation-counts'] });
      navigate(`/inbox/${id}`);
    }} />}
  </div>;
}

function TicketContextActions({ menu, onClose, onUpdated, onFinalized, onFollowUp }: Readonly<{
  menu: TicketContextMenuState | null;
  onClose(): void;
  onUpdated(): void;
  onFinalized(conversationId: string): void;
  onFollowUp(conversation: Conversation): void;
}>) {
  const { user } = useAuth();
  const [opportunityContact, setOpportunityContact] = useState<Contact | null>(null);
  const [transferConversation, setTransferConversation] = useState<Conversation | null>(null);
  const [transferTarget, setTransferTarget] = useState('');
  const canCreateOpportunity = Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === 'opportunities') && (permission.action === '*' || permission.action === 'write')));
  const canScheduleFollowUp = canWriteResource(user, 'conversations') && canWriteResource(user, 'tasks');
  const assignees = useQuery({
    queryKey: ['conversation-assignees'],
    queryFn: () => api<Envelope<ConversationAssignee[]>>('/conversations/assignees'),
    enabled: Boolean(transferConversation),
    staleTime: 60_000,
  });
  const transferTargets = useMemo(
    () => (assignees.data?.data || []).filter((assignee) => assignee.id !== transferConversation?.assignee?.id),
    [assignees.data?.data, transferConversation?.assignee?.id],
  );
  const pin = useMutation({
    mutationFn: (conversation: Conversation) => api<Envelope<{ id: string; isPinned: boolean }>>(`/conversations/${conversation.id}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: !conversation.isPinned }),
    }),
    onSuccess: (response) => {
      toast.success(response.data.isPinned ? 'Conversa fixada.' : 'Conversa desafixada.');
      onUpdated();
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível alterar a fixação')),
  });
  const finalize = useMutation({
    mutationFn: (conversation: Conversation) => api<Envelope<Conversation>>(`/conversations/${conversation.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CLOSED' }),
    }),
    onSuccess: (_response, conversation) => {
      toast.success('Atendimento finalizado.');
      onFinalized(conversation.id);
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível finalizar o atendimento')),
  });
  const transfer = useMutation({
    mutationFn: ({ conversationId, assigneeId }: { conversationId: string; assigneeId: string }) => api<Envelope<Conversation>>(`/conversations/${conversationId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
    }),
    onSuccess: () => {
      setTransferConversation(null);
      setTransferTarget('');
      toast.success('Atendimento transferido.');
      onUpdated();
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível transferir o atendimento')),
  });
  const exportPdf = useMutation({
    mutationFn: async (conversation: Conversation) => {
      const response = await apiFetch(`/conversations/${conversation.id}/export/pdf`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || 'Não foi possível exportar a conversa');
      }
      return { blob: await response.blob(), conversation };
    },
    onSuccess: ({ blob, conversation }) => {
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = conversation.contact.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'contato';
      link.href = href;
      link.download = `conversa-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      toast.success('Atendimento exportado em PDF.');
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível exportar o atendimento')),
  });
  let transferTargetContent: ReactNode = <div className="conversation-transfer-empty"><UsersRound size={22} /><strong>Nenhum outro atendente disponível</strong><span>Não há outro usuário ativo na equipe para receber esta conversa.</span></div>;
  if (assignees.isLoading) transferTargetContent = <PageLoading />;
  else if (!assignees.isError && transferTargets.length) {
    transferTargetContent = <div className="conversation-assignee-list">{transferTargets.map((assignee) => <button type="button" key={assignee.id} className={transferTarget === assignee.id ? 'selected' : ''} onClick={() => { setTransferTarget(assignee.id); transfer.reset(); }}><span className="contact-avatar">{initials(assignee.name)}</span><div><strong>{assignee.name}</strong><small>{assignee.team?.name || assignee.email}</small></div>{transferTarget === assignee.id && <Check size={18} />}</button>)}</div>;
  }

  return <>
    {menu && createPortal(<>
      <button type="button" className="message-menu-scrim" onClick={onClose} aria-label="Fechar ações do ticket" />
      <div className="conversation-action-menu ticket-context-menu" role="menu" style={{ top: menu.top, left: menu.left }}>
        {menu.conversation.status === 'OPEN' && <button type="button" role="menuitem" disabled={pin.isPending} onClick={() => { const item = menu.conversation; onClose(); pin.mutate(item); }}>{menu.conversation.isPinned ? <PinOff size={17} /> : <Pin size={17} />}<span>{menu.conversation.isPinned ? 'Desafixar' : 'Fixar'}</span></button>}
        <button type="button" role="menuitem" disabled={!menu.conversation.assignee || !canScheduleFollowUp} title={followUpDisabledReason(menu.conversation, canScheduleFollowUp)} onClick={() => { const item = menu.conversation; onClose(); onFollowUp(item); }}><Clock size={17} /><span>{menu.conversation.followUps?.length ? 'Ver/editar follow-up' : 'Agendar follow-up automático'}</span></button>
        <button type="button" role="menuitem" className="danger" disabled={menu.conversation.status === 'CLOSED' || finalize.isPending} title={menu.conversation.status === 'CLOSED' ? 'Este atendimento já está finalizado' : undefined} onClick={() => { const item = menu.conversation; onClose(); finalize.mutate(item); }}><Archive size={17} /><span>Finalizar</span></button>
        {menu.conversation.contact.phone
          ? <a role="menuitem" href={`tel:${menu.conversation.contact.phone}`} onClick={onClose}><Phone size={17} /><span>Ligar</span></a>
          : <button type="button" role="menuitem" disabled title="O contato não possui telefone cadastrado"><Phone size={17} /><span>Ligar</span></button>}
        <button type="button" role="menuitem" disabled={!canCreateOpportunity} title={!canCreateOpportunity ? 'Você não possui permissão para criar oportunidades' : undefined} onClick={() => { const contact = menu.conversation.contact; onClose(); setOpportunityContact(contact); }}><BriefcaseBusiness size={17} /><span>Criar oportunidade</span></button>
        <button type="button" role="menuitem" disabled={menu.conversation.status === 'CLOSED'} title={menu.conversation.status === 'CLOSED' ? 'Reabra a conversa antes de transferir' : undefined} onClick={() => { const item = menu.conversation; onClose(); setTransferTarget(''); setTransferConversation(item); }}><ArrowRightLeft size={17} /><span>Transferir</span></button>
        <button type="button" role="menuitem" disabled={exportPdf.isPending} onClick={() => { const item = menu.conversation; onClose(); exportPdf.mutate(item); }}><Download size={17} /><span>{exportPdf.isPending ? 'Exportando PDF…' : 'Exportar para PDF'}</span></button>
      </div>
    </>, document.body)}
    {opportunityContact && <ContactOpportunityModal
      contact={opportunityContact}
      onClose={() => setOpportunityContact(null)}
      onCreated={() => {
        setOpportunityContact(null);
        toast.success('Oportunidade criada.');
        onUpdated();
      }}
    />}
    {transferConversation && <Modal title="Transferir atendimento" onClose={() => { if (!transfer.isPending) { setTransferConversation(null); setTransferTarget(''); } }} width={540}>
      <div className="conversation-transfer">
        <div className="conversation-transfer-intro"><ArrowRightLeft size={20} /><div><strong>Escolha o novo atendente</strong><p>A conversa será removida da sua fila e o novo responsável receberá uma notificação.</p></div></div>
        {transferTargetContent}
      </div>
      <div className="modal-actions"><Button variant="secondary" onClick={() => { setTransferConversation(null); setTransferTarget(''); }} disabled={transfer.isPending}>Cancelar</Button><Button onClick={() => transferTarget && transfer.mutate({ conversationId: transferConversation.id, assigneeId: transferTarget })} loading={transfer.isPending} disabled={!transferTarget}><ArrowRightLeft size={16} />Transferir</Button></div>
    </Modal>}
  </>;
}

function NewConversationModal({ onClose, onStarted }: Readonly<{ onClose(): void; onStarted(id: string): void }>) {
  const [search, setSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const contacts = useQuery({
    queryKey: ['conversation-contact-picker', debouncedSearch],
    queryFn: () => api<Envelope<Contact[]>>(`/contacts?limit=50&search=${encodeURIComponent(debouncedSearch)}`),
  });
  const instances = useQuery({ queryKey: ['conversation-instances'], queryFn: () => api<Envelope<WhatsappInstance[]>>('/conversations/instances') });
  useEffect(() => {
    if (!instanceId && instances.data?.data[0]) setInstanceId(instances.data.data[0].id);
  }, [instanceId, instances.data]);
  const start = useMutation({
    mutationFn: () => api<Envelope<{ id: string }>>('/conversations/start', { method: 'POST', body: JSON.stringify({ contactId, instanceId }) }),
    onSuccess: (result) => {
      toast.success('Conversa iniciada.');
      onStarted(result.data.id);
    },
  });
  const selectedContact = contacts.data?.data.find((contact) => contact.id === contactId);
  let contactListContent: ReactNode = <div className="conversation-contact-empty"><strong>Nenhum contato encontrado</strong><span>Tente buscar usando outro nome, telefone ou e-mail.</span></div>;
  if (contacts.isLoading) contactListContent = <PageLoading />;
  else if (!contacts.error && contacts.data?.data.length) {
    contactListContent = contacts.data.data.map((contact) => <button type="button" key={contact.id} className={contact.id === contactId ? 'selected' : ''} disabled={!contact.phone} onClick={() => setContactId(contact.id)}>
      <span className="contact-avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong><small>{formatPhone(contact.phone) || 'Sem telefone'}{contact.email ? ` · ${contact.email}` : ''}</small></div>{contact.id === contactId && <Check size={17} />}
    </button>);
  }
  let instancePicker: ReactNode = <div className="form-hint">Nenhuma conexão do WhatsApp está ativa.</div>;
  if (instances.isLoading) instancePicker = <PageLoading />;
  else if (instances.data?.data.length) {
    instancePicker = <SelectField label="Número do WhatsApp" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>{instances.data.data.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${instance.phone}` : ''}</option>)}</SelectField>;
  }
  return <Modal title="Nova conversa" onClose={onClose} width={620}>
    <form className="new-conversation-form" onSubmit={(event) => { event.preventDefault(); if (contactId && instanceId) start.mutate(); }}>
      <label className="conversation-contact-search"><span>Selecionar contato</span><div><Search size={16} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail…" /></div></label>
      <div className="conversation-contact-list">{contactListContent}</div>
      {selectedContact && <div className="conversation-selected-contact"><Check size={15} /><span><strong>{selectedContact.name}</strong> será aberto em um novo ticket.</span></div>}
      {instancePicker}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={start.isPending} disabled={!contactId || !instanceId}><MessageCircle size={16} />Abrir ticket</Button></div>
    </form>
  </Modal>;
}

function SharedContactConversationModal({ contact, preferredInstanceId, onClose, onStarted }: Readonly<{
  contact: SharedWhatsappContact;
  preferredInstanceId?: string;
  onClose(): void;
  onStarted(id: string): void;
}>) {
  const client = useQueryClient();
  const [instanceId, setInstanceId] = useState('');
  const instances = useQuery({
    queryKey: ['conversation-instances'],
    queryFn: () => api<Envelope<WhatsappInstance[]>>('/conversations/instances'),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (instanceId || !instances.data?.data.length) return;
    const preferred = instances.data.data.find((instance) => instance.id === preferredInstanceId);
    setInstanceId(preferred?.id || instances.data.data[0].id);
  }, [instanceId, instances.data, preferredInstanceId]);
  const start = useMutation({
    mutationFn: async () => {
      const saved = await api<Envelope<Contact>>('/contacts/shared', {
        method: 'POST',
        body: JSON.stringify({ name: contact.name, phone: contact.phone }),
      });
      return api<Envelope<{ id: string }>>('/conversations/start', {
        method: 'POST',
        body: JSON.stringify({ contactId: saved.data.id, instanceId }),
      });
    },
    onSuccess: (response) => {
      void client.invalidateQueries({ queryKey: ['contacts'] });
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: ['conversation-counts'] });
      toast.success('Contato salvo e conversa iniciada.');
      onStarted(response.data.id);
    },
  });
  let instancePicker: ReactNode = <div className="form-hint">Nenhuma conexão do WhatsApp está ativa para iniciar a conversa.</div>;
  if (instances.isLoading) instancePicker = <PageLoading />;
  else if (instances.data?.data.length) {
    instancePicker = <SelectField label="Enviar pelo número" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>
      {instances.data.data.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${formatPhone(instance.phone)}` : ''}</option>)}
    </SelectField>;
  }
  return <Modal title="Iniciar conversa" onClose={() => { if (!start.isPending) onClose(); }} width={520}>
    <form className="shared-contact-start-form" onSubmit={(event) => { event.preventDefault(); if (instanceId) start.mutate(); }}>
      <div className="shared-contact-start-person">
        <span>{initials(contact.name)}</span>
        <div><strong>{contact.name}</strong><small>{formatPhone(contact.phone)}</small></div>
      </div>
      <p>O contato será salvo automaticamente na agenda e o atendimento ficará atribuído a você.</p>
      {instancePicker}
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={start.isPending}>Cancelar</Button>
        <Button type="submit" loading={start.isPending} disabled={!instanceId}><MessageCircle size={16} />Salvar e iniciar</Button>
      </div>
    </form>
  </Modal>;
}

function ContactOpportunityModal({ contact, onClose, onCreated }: Readonly<{ contact: Contact; onClose(): void; onCreated(): void }>) {
  const client = useQueryClient();
  const [value, setValue] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const pipelines = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api<Envelope<Pipeline[]>>('/pipelines'),
  });
  const activePipelineId = pipelineId || pipelines.data?.data[0]?.id || '';
  const activePipeline = pipelines.data?.data.find((pipeline) => pipeline.id === activePipelineId);
  const activeStageId = activePipeline?.stages.some((stage) => stage.id === stageId) ? stageId : activePipeline?.stages[0]?.id || '';
  const company = contact.companies?.find((item) => item.isPrimary)?.company || contact.companies?.[0]?.company;
  const opportunityTitle = company?.name || contact.name;
  const create = useMutation({
    mutationFn: () => api<Envelope<Opportunity>>('/opportunities', {
      method: 'POST',
      body: JSON.stringify({
        title: opportunityTitle,
        pipelineId: activePipelineId,
        stageId: activeStageId,
        contactId: contact.id,
        companyId: company?.id,
        valueCents: Math.round(Number(value || 0) * 100),
        source: 'Atendimento WhatsApp',
      }),
    }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['kanban'] });
      void client.invalidateQueries({ queryKey: ['opportunities'] });
      void client.invalidateQueries({ queryKey: ['contacts'] });
      onCreated();
    },
  });
  if (pipelines.isLoading) return <Modal title="Nova oportunidade" onClose={onClose}><PageLoading /></Modal>;
  return <Modal title="Nova oportunidade" onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (activePipelineId && activeStageId) create.mutate(); }}>
      <div className="conversation-selected-contact"><UserRound size={16} /><span>Contato vinculado: <strong>{contact.name}</strong></span></div>
      <div className="form-grid">
        <SelectField label="Funil" value={activePipelineId} onChange={(event) => { setPipelineId(event.target.value); setStageId(''); }} disabled={pipelines.isError || !pipelines.data?.data.length}>
          {(pipelines.data?.data || []).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </SelectField>
        <SelectField label="Etapa inicial" value={activeStageId} onChange={(event) => setStageId(event.target.value)} disabled={!activePipeline?.stages.length}>
          {(activePipeline?.stages || []).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </SelectField>
      </div>
      <Field label="Valor estimado (R$)" type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" />
      {!pipelines.isError && !pipelines.data?.data.length && <div className="form-hint">Nenhum funil está configurado.</div>}
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
        <Button type="submit" loading={create.isPending} disabled={!activePipelineId || !activeStageId}><BriefcaseBusiness size={16} />Criar oportunidade</Button>
      </div>
    </form>
  </Modal>;
}

type MessageMenuState = { message: Message; top: number; left: number; mode: 'menu' | 'reactions' };
type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'finishing';
type OutgoingDraft = { text: string; file: File | null; replyToMessageId?: string; signatureEnabled: boolean };

const VOICE_BAR_COUNT = 32;
const VOICE_BAR_IDS = Array.from({ length: VOICE_BAR_COUNT }, (_, index) => `voice-bar-${index + 1}`);
const EMPTY_VOICE_LEVELS = Array.from({ length: VOICE_BAR_COUNT }, () => .16);

function recordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function voiceFileExtension(contentType: string) {
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('mp4')) return 'm4a';
  return 'webm';
}

function voiceDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

const EmojiPickerPopover = lazy(() => import('../components/EmojiPickerPopover'));

function ConversationView({ conversation, hasOlderMessages, loadingOlderMessages, statusChanging, onLoadOlderMessages, onSend, onAssign, onTransfer, onClose }: Readonly<{
  conversation: Conversation;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  statusChanging: boolean;
  onLoadOlderMessages(): Promise<void>;
  onSend(): void;
  onAssign(): void;
  onTransfer(assigneeId: string): Promise<void>;
  onClose(): void;
}>) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editHistoryMessage, setEditHistoryMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [conversationMenu, setConversationMenu] = useState<{ top: number; left: number } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [instanceChangeOpen, setInstanceChangeOpen] = useState(false);
  const [instanceTarget, setInstanceTarget] = useState('');
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [activeAiGenerationId, setActiveAiGenerationId] = useState<string | null>(null);
  const [readyAiSuggestion, setReadyAiSuggestion] = useState('');
  const [sharedContactToStart, setSharedContactToStart] = useState<SharedWhatsappContact | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [downloadingMediaId, setDownloadingMediaId] = useState<string | null>(null);
  const [signatureEnabled, setSignatureEnabled] = useState(Boolean(user?.messageSignatureEnabled));
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [automationMenuOpen, setAutomationMenuOpen] = useState(false);
  const [automationIndex, setAutomationIndex] = useState(0);
  const [quickReplyMenuOpen, setQuickReplyMenuOpen] = useState(false);
  const [quickReplyIndex, setQuickReplyIndex] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [draggingAttachment, setDraggingAttachment] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceLevels, setVoiceLevels] = useState(EMPTY_VOICE_LEVELS);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState<number>(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<WhatsappComposerHandle>(null);
  const composerRevisionRef = useRef(0);
  const aiSuggestionRequestRef = useRef<{ generationId: string; revision: number } | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDialogElement>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const nearBottomRef = useRef(true);
  const activeConversationRef = useRef<string | null>(null);
  const historyAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const historyLoadPendingRef = useRef(false);
  const attachmentDragDepthRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingAccumulatedMsRef = useRef(0);
  const recordingLastVisualAtRef = useRef(0);
  const recordingRequestIdRef = useRef(0);
  const sendRecordingRef = useRef(false);
  const recordingDraftRef = useRef<{ replyToMessageId?: string; signatureEnabled: boolean }>({ signatureEnabled: false });
  const messagesById = useMemo(() => new Map(conversation.messages.map((message) => [message.id, message])), [conversation.messages]);
  const messagesByProviderId = useMemo(() => new Map(conversation.messages.map((message) => [message.providerMessageId, message])), [conversation.messages]);
  const newestMessageId = conversation.messages.at(-1)?.id;
  const newestEventId = conversation.events?.at(-1)?.id;
  const connectionUnavailable = canChangeConversationInstance(conversation.instance);
  const canReply = conversation.status === 'OPEN' && Boolean(conversation.assignee) && !connectionUnavailable;
  const canStartAutomations = Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === 'workflows') && (permission.action === '*' || permission.action === 'write')));
  const canCreateOpportunity = Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === 'opportunities') && (permission.action === '*' || permission.action === 'write')));
  const canScheduleFollowUp = canWriteResource(user, 'conversations') && canWriteResource(user, 'tasks');
  const workflows = useQuery({
    queryKey: ['workflow-shortcuts'],
    queryFn: () => api<Envelope<WorkflowShortcut[]>>('/workflows'),
    enabled: automationMenuOpen && canStartAutomations,
    staleTime: 60_000,
  });
  const quickReplies = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => api<Envelope<QuickReplyShortcut[]>>('/quick-replies'),
    enabled: quickReplyMenuOpen,
    staleTime: 60_000,
  });
  const activeAiGeneration = useQuery({
    queryKey: ['ai-generation', conversation.id, activeAiGenerationId],
    queryFn: () => api<Envelope<AiGeneration>>(`/conversations/${conversation.id}/ai/generations/${activeAiGenerationId}`),
    enabled: Boolean(activeAiGenerationId),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      if (!status || ['COMPLETED', 'FAILED', 'CANCELLED', 'STALE'].includes(status)) return false;
      return 2_000;
    },
  });
  const latestAiSummary = useQuery({
    queryKey: ['ai-summary', conversation.id],
    queryFn: () => api<Envelope<AiGeneration | null>>(`/conversations/${conversation.id}/ai/summaries/latest`),
    enabled: aiSummaryOpen,
  });
  const createAiGeneration = useMutation({
    mutationFn: (input: { type: 'SUMMARY' | 'REPLY_SUGGESTION'; scope?: 'CURRENT_ATTENDANCE' | 'FULL_CONVERSATION' }) => api<Envelope<AiGeneration>>(`/conversations/${conversation.id}/ai/generations`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (response, input) => {
      const generation = response.data;
      setActiveAiGenerationId(generation.id);
      setAiMenuOpen(false);
      if (input.type === 'REPLY_SUGGESTION') {
        aiSuggestionRequestRef.current = { generationId: generation.id, revision: composerRevisionRef.current };
        setReadyAiSuggestion('');
      } else {
        setAiSummaryOpen(true);
      }
    },
  });
  useEffect(() => {
    const generation = activeAiGeneration.data?.data;
    if (!generation || !activeAiGenerationId) return;
    const request = aiSuggestionRequestRef.current;
    const reply = completedSuggestion(generation, request?.generationId);
    if (reply && request) {
        if (aiSuggestionDisposition({
          composerText: text,
          hasAttachment: Boolean(file),
          requestedRevision: request.revision,
          currentRevision: composerRevisionRef.current,
        }) === 'insert') {
          setText(reply);
          window.setTimeout(() => textRef.current?.moveCaretToEnd(), 0);
        } else {
          setReadyAiSuggestion(reply);
        }
        aiSuggestionRequestRef.current = null;
    }
    if (generation.status === 'COMPLETED' && generation.type === 'SUMMARY') {
      void latestAiSummary.refetch();
    }
    const failedSuggestion = generation.status !== 'COMPLETED' && AI_TERMINAL_STATUSES.includes(generation.status)
      && aiSuggestionRequestRef.current?.generationId === generation.id;
    if (failedSuggestion) {
      aiSuggestionRequestRef.current = null;
      if (generation.status === 'FAILED') toast.error(generation.error || 'A IA não conseguiu gerar a resposta.');
    }
    if (AI_TERMINAL_STATUSES.includes(generation.status)) setActiveAiGenerationId(null);
  }, [activeAiGeneration.data, activeAiGenerationId, file, latestAiSummary, text]);
  const automationSearch = composerCommandSearch(text, '@');
  const workflowOptions = useMemo(() => (workflows.data?.data || []).filter((workflow) => {
    if (workflow.status !== 'PUBLISHED' || !workflow.publishedVersion) return false;
    if (!automationSearch) return true;
    return `${workflow.name} ${workflow.description || ''}`.toLocaleLowerCase('pt-BR').includes(automationSearch);
  }), [workflows.data, automationSearch]);
  const quickReplySearch = composerCommandSearch(text, '/');
  const quickReplyOptions = useMemo(() => (quickReplies.data?.data || []).filter((reply) => {
    if (!quickReplySearch) return true;
    return `${reply.shortcut} ${reply.title} ${reply.text || ''}`.toLocaleLowerCase('pt-BR').includes(quickReplySearch);
  }), [quickReplies.data, quickReplySearch]);
  const startWorkflow = useMutation({
    mutationFn: (workflow: WorkflowShortcut) => api<Envelope<WorkflowEnrollmentResult>>(`/workflows/${workflow.id}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ contactIds: [conversation.contact.id], conversationId: conversation.id }),
    }),
    onSuccess: (response, workflow) => {
      setAutomationMenuOpen(false);
      setText('');
      setActionNotice(response.data.enrolled > 0
        ? `Automação “${workflow.name}” iniciada`
        : `Este contato já está na versão publicada de “${workflow.name}”`);
      onSend();
    },
  });
  const insertQuickReply = useMutation({
    mutationFn: async (reply: QuickReplyShortcut) => {
      if (!reply.mediaAsset) return { reply, attachment: null as File | null };
      const response = await api<Envelope<{ url: string; filename: string; contentType: string }>>(`/media/${reply.mediaAsset.id}/url`);
      const downloaded = await fetch(response.data.url);
      if (!downloaded.ok) throw new Error('Não foi possível carregar o anexo da resposta rápida');
      const blob = await downloaded.blob();
      const attachment = new File([blob], response.data.filename || reply.mediaAsset.filename, {
        type: response.data.contentType || reply.mediaAsset.contentType,
        lastModified: Date.now(),
      });
      return { reply, attachment };
    },
    onSuccess: ({ reply, attachment }) => {
      setText(reply.text || '');
      setFile(attachment);
      setAttachmentError('');
      setQuickReplyMenuOpen(false);
      setAutomationMenuOpen(false);
      window.setTimeout(() => textRef.current?.moveCaretToEnd(), 0);
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível inserir a resposta rápida')),
  });
  const send = useMutation({
    mutationFn: async (draft: OutgoingDraft) => {
      if (!draft.file) return api(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ type: 'text', text: draft.text, replyToMessageId: draft.replyToMessageId, signatureEnabled: draft.signatureEnabled }) });
      const uploadContentType = draft.file.type.toLowerCase().split(';', 1)[0].trim();
      const created = await api<Envelope<{ key: string; uploadUrl: string }>>('/media/uploads', { method: 'POST', body: JSON.stringify({ filename: draft.file.name, contentType: uploadContentType, sizeBytes: draft.file.size }) });
      const uploaded = await fetch(created.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': uploadContentType }, body: draft.file });
      if (!uploaded.ok) throw new Error('Não foi possível enviar o arquivo');
      const type = outgoingMessageType(draft.file);
      return api(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ type, text: draft.text || undefined, mediaKey: created.data.key, replyToMessageId: draft.replyToMessageId, signatureEnabled: draft.signatureEnabled }) });
    },
    onSuccess: () => { setText(''); setFile(null); setAttachmentError(''); setReplyingTo(null); onSend(); },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível enviar a mensagem')),
  });
  const releaseRecordingResources = useCallback(() => {
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    if (recordingAnimationRef.current !== null) window.cancelAnimationFrame(recordingAnimationRef.current);
    recordingTimerRef.current = null;
    recordingAnimationRef.current = null;
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    const audioContext = recordingAudioContextRef.current;
    recordingAudioContextRef.current = null;
    recordingAnalyserRef.current = null;
    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => undefined);
    mediaRecorderRef.current = null;
  }, []);
  const resetRecordingUi = useCallback(() => {
    setRecordingStatus('idle');
    setRecordingSeconds(0);
    setVoiceLevels(EMPTY_VOICE_LEVELS);
    recordingAccumulatedMsRef.current = 0;
    recordingStartedAtRef.current = 0;
    recordingChunksRef.current = [];
    sendRecordingRef.current = false;
  }, []);
  const startRecordingClock = useCallback(() => {
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    recordingStartedAtRef.current = performance.now();
    const update = () => {
      const elapsed = recordingAccumulatedMsRef.current + performance.now() - recordingStartedAtRef.current;
      setRecordingSeconds(Math.floor(elapsed / 1000));
    };
    update();
    recordingTimerRef.current = window.setInterval(update, 250);
  }, []);
  const startVoiceVisualization = useCallback(() => {
    const analyser = recordingAnalyserRef.current;
    if (!analyser) return;
    if (recordingAnimationRef.current !== null) window.cancelAnimationFrame(recordingAnimationRef.current);
    const frequencies = new Uint8Array(analyser.frequencyBinCount);
    const draw = (now: number) => {
      analyser.getByteFrequencyData(frequencies);
      if (now - recordingLastVisualAtRef.current >= 70) {
        recordingLastVisualAtRef.current = now;
        const usefulBins = Math.max(VOICE_BAR_COUNT, Math.floor(frequencies.length * .72));
        setVoiceLevels(Array.from({ length: VOICE_BAR_COUNT }, (_, index) => {
          const start = Math.floor((index / VOICE_BAR_COUNT) * usefulBins);
          const end = Math.max(start + 1, Math.floor(((index + 1) / VOICE_BAR_COUNT) * usefulBins));
          let peak = 0;
          for (let offset = start; offset < end; offset += 1) peak = Math.max(peak, frequencies[offset] || 0);
          return Math.max(.14, Math.min(1, peak / 185));
        }));
      }
      recordingAnimationRef.current = window.requestAnimationFrame(draw);
    };
    recordingAnimationRef.current = window.requestAnimationFrame(draw);
  }, []);
  const discardActiveRecording = useCallback(() => {
    recordingRequestIdRef.current += 1;
    sendRecordingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    releaseRecordingResources();
    resetRecordingUi();
  }, [releaseRecordingResources, resetRecordingUi]);
  const edit = useMutation({
    mutationFn: ({ messageId, text: updatedText }: { messageId: string; text: string }) => api(`/conversations/${conversation.id}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ text: updatedText }) }),
    onSuccess: () => { setText(''); setEditingMessage(null); onSend(); },
  });
  const remove = useMutation({
    mutationFn: (messageId: string) => api(`/conversations/${conversation.id}/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (editingMessage?.id === deletingMessage?.id) { setEditingMessage(null); setText(''); }
      setDeletingMessage(null);
      setMessageMenu(null);
      onSend();
    },
  });
  const retry = useMutation({
    mutationFn: (messageId: string) => api(`/conversations/${conversation.id}/messages/${messageId}/retry`, { method: 'POST' }),
    onSuccess: onSend,
  });
  const react = useMutation({
    mutationFn: ({ messageId, reaction }: { messageId: string; reaction: string }) => api(`/conversations/${conversation.id}/messages/${messageId}/reaction`, { method: 'POST', body: JSON.stringify({ reaction }) }),
    onSuccess: () => { setMessageMenu(null); onSend(); },
  });
  const signaturePreference = useMutation({
    mutationFn: (enabled: boolean) => api('/users/me/preferences', { method: 'PATCH', body: JSON.stringify({ messageSignatureEnabled: enabled }) }),
    onMutate: (enabled) => {
      const previous = signatureEnabled;
      setSignatureEnabled(enabled);
      return { previous };
    },
    onError: (_error, _enabled, context) => setSignatureEnabled(context?.previous ?? false),
    onSuccess: () => { void refresh(); },
  });
  const assignees = useQuery({
    queryKey: ['conversation-assignees'],
    queryFn: () => api<Envelope<ConversationAssignee[]>>('/conversations/assignees'),
    enabled: transferOpen,
    staleTime: 60_000,
  });
  const transfer = useMutation({
    mutationFn: (assigneeId: string) => onTransfer(assigneeId),
    onSuccess: () => {
      setTransferOpen(false);
      setTransferTarget('');
      setActionNotice('Atendimento transferido');
      onSend();
    },
  });
  const availableInstances = useQuery({
    queryKey: ['conversation-instances'],
    queryFn: () => api<Envelope<WhatsappInstance[]>>('/conversations/instances'),
    enabled: instanceChangeOpen,
    staleTime: 30_000,
  });
  const instanceOptions = useMemo(
    () => (availableInstances.data?.data || []).filter((instance) => instance.id !== conversation.instance.id),
    [availableInstances.data?.data, conversation.instance.id],
  );
  const selectedInstanceTarget = instanceOptions.find((instance) => instance.id === instanceTarget);
  const changeInstance = useMutation({
    mutationFn: (nextInstanceId: string) => api<Envelope<Conversation>>(`/conversations/${conversation.id}/instance`, {
      method: 'PATCH',
      body: JSON.stringify({ instanceId: nextInstanceId }),
    }),
    onSuccess: (_response, nextInstanceId) => {
      const selected = instanceOptions.find((instance) => instance.id === nextInstanceId);
      setInstanceChangeOpen(false);
      setInstanceTarget('');
      toast.success(selected ? `Conexão alterada para ${selected.name}.` : 'Conexão da conversa alterada.');
      onSend();
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível trocar a conexão')),
  });
  const exportPdf = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/conversations/${conversation.id}/export/pdf`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || 'Não foi possível exportar a conversa');
      }
      return response.blob();
    },
    onSuccess: (blob) => {
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = conversation.contact.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'contato';
      link.href = href;
      link.download = `conversa-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      setActionNotice('Atendimento exportado em PDF');
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Não foi possível exportar o atendimento'),
  });
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const changedConversation = activeConversationRef.current !== conversation.id;
    activeConversationRef.current = conversation.id;
    if (historyAnchorRef.current && !changedConversation) {
      const anchor = historyAnchorRef.current;
      historyAnchorRef.current = null;
      body.scrollTop = anchor.scrollTop + body.scrollHeight - anchor.scrollHeight;
      nearBottomRef.current = false;
      setShowScrollToLatest(true);
      return;
    }
    if (changedConversation || nearBottomRef.current) {
      body.scrollTop = body.scrollHeight;
      nearBottomRef.current = true;
      setShowScrollToLatest(false);
      if (changedConversation) {
        window.requestAnimationFrame(() => {
          if (activeConversationRef.current !== conversation.id || !bodyRef.current) return;
          bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        });
      }
      return;
    }
    setShowScrollToLatest(body.scrollHeight - body.scrollTop - body.clientHeight > 96);
  }, [conversation.id, conversation.messages.length, conversation.events?.length, newestMessageId, newestEventId]);
  useEffect(() => {
    if (!file?.type.startsWith('image/')) { setFilePreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => setSignatureEnabled(Boolean(user?.messageSignatureEnabled)), [user?.messageSignatureEnabled]);
  useEffect(() => setAutomationIndex(0), [automationSearch, automationMenuOpen]);
  useEffect(() => setQuickReplyIndex(0), [quickReplySearch, quickReplyMenuOpen]);
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      const target = event.target as Node;
      if (emojiButtonRef.current?.contains(target) || emojiPickerRef.current?.contains(target)) return;
      setEmojiPickerOpen(false);
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, [emojiPickerOpen]);
  useEffect(() => () => {
    recordingRequestIdRef.current += 1;
    sendRecordingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    releaseRecordingResources();
  }, [releaseRecordingResources]);
  useEffect(() => {
    discardActiveRecording();
    historyAnchorRef.current = null;
    historyLoadPendingRef.current = false;
    setContactOpen(false);
    setMessageMenu(null);
    setConversationMenu(null);
    setTransferOpen(false);
    setTransferTarget('');
    setReplyingTo(null);
    setEditingMessage(null);
    setDeletingMessage(null);
    setText('');
    setFile(null);
    setAttachmentError('');
    setActionError('');
    setAutomationMenuOpen(false);
    setAutomationIndex(0);
    setQuickReplyMenuOpen(false);
    setQuickReplyIndex(0);
    setEmojiPickerOpen(false);
    setDraggingAttachment(false);
    attachmentDragDepthRef.current = 0;
  }, [conversation.id, discardActiveRecording]);
  useEffect(() => {
    if (!canReply) return;
    const frame = window.requestAnimationFrame(() => textRef.current?.moveCaretToEnd());
    return () => window.cancelAnimationFrame(frame);
  }, [conversation.id, canReply]);
  useEffect(() => {
    if (!attachmentError) return;
    toast.warning(attachmentError);
    setAttachmentError('');
  }, [attachmentError]);
  useEffect(() => {
    if (!actionNotice) return;
    toast.success(actionNotice);
    setActionNotice('');
  }, [actionNotice]);
  useEffect(() => {
    if (!actionError) return;
    toast.error(actionError);
    setActionError('');
  }, [actionError]);
  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const startVoiceRecording = async () => {
    if (!canReply || editingMessage || file || text.trim() || send.isPending || recordingStatus !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAttachmentError('Este navegador não oferece suporte à gravação de áudio.');
      return;
    }
    setAttachmentError('');
    if (send.isError) send.reset();
    setEmojiPickerOpen(false);
    setAutomationMenuOpen(false);
    setQuickReplyMenuOpen(false);
    setRecordingStatus('requesting');
    const conversationAtStart = conversation.id;
    const requestId = ++recordingRequestIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (recordingRequestIdRef.current !== requestId || activeConversationRef.current !== conversationAtStart) {
        stream.getTracks().forEach((track) => track.stop());
        resetRecordingUi();
        return;
      }
      recordingStreamRef.current = stream;
      const mimeType = recordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 });
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingAccumulatedMsRef.current = 0;
      recordingDraftRef.current = { replyToMessageId: replyingTo?.id, signatureEnabled };
      sendRecordingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        sendRecordingRef.current = false;
        setAttachmentError('A gravação foi interrompida pelo navegador.');
        releaseRecordingResources();
        resetRecordingUi();
      };
      recorder.onstop = () => {
        const shouldSend = sendRecordingRef.current;
        const contentType = recorder.mimeType || mimeType || recordingChunksRef.current[0]?.type || 'audio/webm';
        const audio = new Blob(recordingChunksRef.current, { type: contentType });
        const draftContext = recordingDraftRef.current;
        releaseRecordingResources();
        if (!shouldSend) {
          resetRecordingUi();
          return;
        }
        if (!audio.size) {
          setAttachmentError('Nenhum áudio foi capturado. Verifique o microfone e tente novamente.');
          resetRecordingUi();
          return;
        }
        if (audio.size > 25 * 1024 * 1024) {
          setAttachmentError('O áudio gravado ultrapassou o limite de 25 MB.');
          resetRecordingUi();
          return;
        }
        const recordedFile = new File(
          [audio],
          `audio-${Date.now()}.${voiceFileExtension(contentType)}`,
          { type: contentType, lastModified: Date.now() },
        );
        send.mutate(
          { text: '', file: recordedFile, ...draftContext },
          { onSettled: resetRecordingUi },
        );
      };

      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = .72;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        recordingAudioContextRef.current = audioContext;
        recordingAnalyserRef.current = analyser;
      } catch {
        recordingAudioContextRef.current = null;
        recordingAnalyserRef.current = null;
      }

      recorder.start(250);
      setRecordingStatus('recording');
      setRecordingSeconds(0);
      setVoiceLevels(EMPTY_VOICE_LEVELS);
      startRecordingClock();
      startVoiceVisualization();
    } catch (error) {
      releaseRecordingResources();
      resetRecordingUi();
      const name = error instanceof DOMException ? error.name : '';
      setAttachmentError(recordingErrorMessage(name));
    }
  };
  const toggleRecordingPause = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recordingStatus === 'requesting' || recordingStatus === 'finishing') return;
    if (recorder.state === 'recording') {
      recorder.pause();
      recordingAccumulatedMsRef.current += performance.now() - recordingStartedAtRef.current;
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      if (recordingAnimationRef.current !== null) window.cancelAnimationFrame(recordingAnimationRef.current);
      recordingTimerRef.current = null;
      recordingAnimationRef.current = null;
      setRecordingSeconds(Math.floor(recordingAccumulatedMsRef.current / 1000));
      setRecordingStatus('paused');
      return;
    }
    if (recorder.state === 'paused') {
      recorder.resume();
      setRecordingStatus('recording');
      startRecordingClock();
      startVoiceVisualization();
    }
  };
  const finishVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive' || recordingStatus === 'requesting' || recordingStatus === 'finishing') return;
    if (recorder.state === 'recording') recordingAccumulatedMsRef.current += performance.now() - recordingStartedAtRef.current;
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    if (recordingAnimationRef.current !== null) window.cancelAnimationFrame(recordingAnimationRef.current);
    recordingTimerRef.current = null;
    recordingAnimationRef.current = null;
    sendRecordingRef.current = true;
    setRecordingStatus('finishing');
    recorder.stop();
  };
  const selectWorkflow = (workflow: WorkflowShortcut) => {
    if (startWorkflow.isPending) return;
    startWorkflow.mutate(workflow);
  };
  const selectQuickReply = (reply: QuickReplyShortcut) => {
    if (insertQuickReply.isPending) return;
    insertQuickReply.mutate(reply);
  };
  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (emojiPickerOpen && event.key === 'Escape') {
      setEmojiPickerOpen(false);
      return true;
    }
    if (quickReplyMenuOpen) {
      return handleShortcutMenuKey(event, {
        itemCount: quickReplyOptions.length,
        selectedIndex: quickReplyIndex,
        setSelectedIndex: setQuickReplyIndex,
        close: () => setQuickReplyMenuOpen(false),
        select: selectQuickReply,
        items: quickReplyOptions,
      });
    }
    if (!automationMenuOpen) return false;
    return handleShortcutMenuKey(event, {
      itemCount: workflowOptions.length,
      selectedIndex: automationIndex,
      setSelectedIndex: setAutomationIndex,
      close: () => setAutomationMenuOpen(false),
      select: selectWorkflow,
      items: workflowOptions,
    });
  };
  const submitCurrentMessage = () => {
    if (!canReply) return;
    if (quickReplyMenuOpen) {
      const reply = quickReplyOptions[quickReplyIndex];
      if (reply) selectQuickReply(reply);
      return;
    }
    if (automationMenuOpen) {
      const workflow = workflowOptions[automationIndex];
      if (workflow) selectWorkflow(workflow);
      return;
    }
    if (editingMessage && text.trim()) edit.mutate({ messageId: editingMessage.id, text: text.trim() });
    else if (!editingMessage && (text.trim() || file)) send.mutate({ text, file, replyToMessageId: replyingTo?.id, signatureEnabled });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    submitCurrentMessage();
  };
  const openMessageMenu = useCallback((message: Message, clientX: number, clientY: number, mode: MessageMenuState['mode'] = 'menu') => {
    const width = 220;
    const height = messageMenuHeight(mode, message.direction);
    setMessageMenu({
      message,
      left: Math.max(8, Math.min(clientX, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(clientY, window.innerHeight - height - 8)),
      mode,
    });
  }, []);
  const openReactionMenu = useCallback((message: Message, clientX: number, clientY: number) => openMessageMenu(message, clientX, clientY, 'reactions'), [openMessageMenu]);
  const startReply = useCallback((message: Message) => {
    setEditingMessage(null);
    setReplyingTo(message);
    setMessageMenu(null);
    window.setTimeout(() => textRef.current?.focus(), 0);
  }, []);
  const startEdit = (message: Message) => {
    setAutomationMenuOpen(false);
    setQuickReplyMenuOpen(false);
    setEmojiPickerOpen(false);
    setReplyingTo(null);
    setFile(null);
    setEditingMessage(message);
    setText(message.text || '');
    setMessageMenu(null);
    edit.reset();
    window.setTimeout(() => textRef.current?.moveCaretToEnd(), 0);
  };
  const cancelEdit = () => {
    setAutomationMenuOpen(false);
    setQuickReplyMenuOpen(false);
    setEmojiPickerOpen(false);
    setEditingMessage(null);
    setText('');
    edit.reset();
  };
  const attachFile = (candidate: File | null) => {
    if (!candidate) return false;
    if (!canReply) { setAttachmentError('Assuma e abra a conversa antes de anexar um arquivo.'); return false; }
    if (editingMessage) { setAttachmentError('Conclua ou cancele a edição antes de anexar um arquivo.'); return false; }
    if (!candidate.size) { setAttachmentError('O arquivo selecionado está vazio.'); return false; }
    if (candidate.size > 25 * 1024 * 1024) { setAttachmentError('O arquivo deve ter no máximo 25 MB.'); return false; }
    const normalized = candidate.type
      ? candidate
      : new File([candidate], candidate.name || `arquivo-${Date.now()}`, { type: 'application/octet-stream', lastModified: candidate.lastModified });
    setAutomationMenuOpen(false);
    setQuickReplyMenuOpen(false);
    setEmojiPickerOpen(false);
    setFile(normalized);
    setAttachmentError('');
    if (send.isError) send.reset();
    window.setTimeout(() => textRef.current?.focus(), 0);
    return true;
  };
  const pasteImage = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageItem = [...event.clipboardData.items].find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) return;
    event.preventDefault();
    if (editingMessage) { setAttachmentError('Conclua ou cancele a edição antes de anexar uma imagem.'); return; }
    const pasted = imageItem.getAsFile();
    if (!pasted) { setAttachmentError('Não foi possível ler a imagem copiada.'); return; }
    const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
    const extension = extensions[pasted.type];
    if (!extension) { setAttachmentError('Cole uma imagem nos formatos PNG, JPG ou WebP.'); return; }
    if (pasted.size > 25 * 1024 * 1024) { setAttachmentError('A imagem deve ter no máximo 25 MB.'); return; }
    const name = pasted.name && pasted.name !== 'image.png' ? pasted.name : `imagem-colada-${Date.now()}.${extension}`;
    attachFile(new File([pasted], name, { type: pasted.type, lastModified: Date.now() }));
  };
  const isFileDrag = (event: React.DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes('Files');
  const handleAttachmentDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current += 1;
    setDraggingAttachment(true);
  };
  const handleAttachmentDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = canReply && !editingMessage ? 'copy' : 'none';
  };
  const handleAttachmentDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);
    if (attachmentDragDepthRef.current === 0) setDraggingAttachment(false);
  };
  const handleAttachmentDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = 0;
    setDraggingAttachment(false);
    const dropped = event.dataTransfer.files?.[0] || null;
    const attached = attachFile(dropped);
    if (attached && event.dataTransfer.files.length > 1) setActionNotice('O primeiro arquivo foi anexado. Envie um arquivo por mensagem.');
  };
  const jumpToMessage = useCallback((messageId: string) => {
    const body = bodyRef.current;
    const target = body?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!body || !target) return;
    const bodyRect = body.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = body.scrollTop + targetRect.top - bodyRect.top - (body.clientHeight - targetRect.height) / 2;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    target.classList.remove('message-highlight');
    target.getBoundingClientRect();
    target.classList.add('message-highlight');
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => target.classList.remove('message-highlight'), 1800);
  }, []);
  const requestOlderMessages = async () => {
    const body = bodyRef.current;
    if (!body || !hasOlderMessages || loadingOlderMessages || historyLoadPendingRef.current) return;
    historyLoadPendingRef.current = true;
    historyAnchorRef.current = { scrollHeight: body.scrollHeight, scrollTop: body.scrollTop };
    try {
      await onLoadOlderMessages();
    } catch {
      historyAnchorRef.current = null;
    } finally {
      historyLoadPendingRef.current = false;
    }
  };
  const updateScrollPosition = () => {
    const body = bodyRef.current;
    if (!body) return;
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= 96;
    nearBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom);
    if (!nearBottom && body.scrollTop <= 80) void requestOlderMessages();
  };
  const scrollToLatest = () => {
    const body = bodyRef.current;
    if (!body) return;
    nearBottomRef.current = true;
    setShowScrollToLatest(false);
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
  };
  const keepLatestVisible = useCallback(() => {
    const body = bodyRef.current;
    if (!body || !nearBottomRef.current) return;
    body.scrollTop = body.scrollHeight;
    setShowScrollToLatest(false);
  }, []);
  const cycleAudioPlaybackRate = useCallback(() => {
    setAudioPlaybackRate((current) => {
      const currentIndex = AUDIO_PLAYBACK_RATES.indexOf(current as (typeof AUDIO_PLAYBACK_RATES)[number]);
      return AUDIO_PLAYBACK_RATES[(currentIndex + 1) % AUDIO_PLAYBACK_RATES.length];
    });
  }, []);
  const copyMessage = async (message: Message) => {
    const value = messageCopyText(message);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error('Não foi possível copiar a mensagem neste navegador.');
      return;
    }
    setMessageMenu(null);
    setActionNotice('Mensagem copiada');
  };
  const downloadAudio = async (message: Message) => {
    const media = messageAudioMedia(message);
    if (!media || downloadingMediaId) return;
    setMessageMenu(null);
    setActionError('');
    setDownloadingMediaId(media.id);
    try {
      const response = await api<Envelope<{ url: string; filename: string }>>(`/media/${media.id}/url?download=true`);
      const link = document.createElement('a');
      link.href = response.data.url;
      link.download = response.data.filename || media.filename || 'audio';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setActionNotice('Download do áudio iniciado');
    } catch (error) {
      setActionError(apiErrorMessage(error, 'Não foi possível baixar o áudio'));
    } finally {
      setDownloadingMediaId(null);
    }
  };
  const toggleReaction = (message: Message, emoji: string) => {
    const currentReaction = messageReactions(message).find((item) => item.source === 'me' || (!item.source && Boolean(item.userId)))?.emoji;
    react.mutate({ messageId: message.id, reaction: currentReaction === emoji ? '' : emoji });
  };
  const openConversationMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 230;
    const height = 190;
    setConversationMenu({
      top: Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - height - 8)),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  };
  const grouped = useMemo(() => groupTimeline(conversation.messages, conversation.events || []), [conversation.messages, conversation.events]);
  const transferTargets = useMemo(() => (assignees.data?.data || []).filter((assignee) => assignee.id !== conversation.assignee?.id), [assignees.data?.data, conversation.assignee?.id]);
  const retryMessage = useCallback((messageId: string) => retry.mutate(messageId), [retry.mutate]);
  let transferTargetContent: ReactNode = <div className="conversation-transfer-empty"><UsersRound size={22} /><strong>Nenhum outro atendente disponível</strong><span>Não há outro usuário ativo na equipe para receber esta conversa.</span></div>;
  if (assignees.isLoading) transferTargetContent = <PageLoading />;
  else if (!assignees.isError && transferTargets.length) {
    transferTargetContent = <div className="conversation-assignee-list">{transferTargets.map((assignee) => <button type="button" key={assignee.id} className={transferTarget === assignee.id ? 'selected' : ''} onClick={() => { setTransferTarget(assignee.id); transfer.reset(); }}><span className="contact-avatar">{initials(assignee.name)}</span><div><strong>{assignee.name}</strong><small>{assignee.team?.name || assignee.email}</small></div>{transferTarget === assignee.id && <Check size={18} />}</button>)}</div>;
  }
  let instanceOptionContent: ReactNode = <div className="conversation-transfer-empty"><Cable size={22} /><strong>Nenhuma conexão ativa disponível</strong><span>Conecte outro número para conseguir continuar esta conversa.</span></div>;
  if (availableInstances.isLoading) instanceOptionContent = <PageLoading />;
  else if (availableInstances.isError) instanceOptionContent = <div className="conversation-transfer-empty"><Cable size={22} /><strong>Não foi possível carregar as conexões</strong><span>Tente fechar esta janela e abrir novamente.</span></div>;
  else if (instanceOptions.length) {
    instanceOptionContent = <SelectField label="Nova conexão" value={instanceTarget} onChange={(event) => {
      setInstanceTarget(event.target.value);
      changeInstance.reset();
    }}>
      <option value="">Selecione uma conexão ativa</option>
      {instanceOptions.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${formatPhone(instance.phone)}` : ''}</option>)}
    </SelectField>;
  }
  const composerPlaceholder = conversationComposerPlaceholder(
    connectionUnavailable,
    conversation.status,
    canReply,
    Boolean(editingMessage),
    Boolean(file),
  );
  const currentStatusAction = statusAction(statusChanging, conversation.status);
  const currentSendAction = sendAction(Boolean(editingMessage), quickReplyMenuOpen, automationMenuOpen);
  const canAcceptDrop = canReply && !editingMessage;
  const dropCopy = attachmentDropCopy(canReply, Boolean(editingMessage));
  const handleComposerChange = (value: string) => {
    const command = detectComposerCommand(value, { canReply, editing: Boolean(editingMessage), hasFile: Boolean(file) });
    setText(value);
    composerRevisionRef.current += 1;
    setQuickReplyMenuOpen(command === 'quick-reply');
    setAutomationMenuOpen(command === 'automation');
    setAttachmentError('');
    if (send.isError) send.reset();
    if (edit.isError) edit.reset();
  };
  const handleComposerSubmit = () => {
    if (!send.isPending && !edit.isPending && !startWorkflow.isPending && !insertQuickReply.isPending) submitCurrentMessage();
  };

  const renderHeader = () => <header className="conversation-header">
    <button type="button" className="conversation-person conversation-person-button" onClick={() => setContactOpen(true)} aria-label={`Ver informações de ${conversation.contact.name}`}>
      <WhatsappAvatar conversationId={conversation.id} name={conversation.contact.name} large />
      <div><strong>{conversation.contact.name}</strong><span><i /> {formatPhone(conversation.contact.phone) || 'Sem telefone'} · {conversation.instance.name}</span></div>
    </button>
    <div className="conversation-actions">
      {connectionUnavailable && <button type="button" className="button button-secondary conversation-change-instance-button" onClick={() => { setInstanceTarget(''); changeInstance.reset(); setInstanceChangeOpen(true); }} title="Escolher outra conexão para as próximas mensagens"><Cable size={15} /><span>Trocar conexão</span></button>}
      <button type="button" className="button button-secondary" onClick={onAssign} disabled={conversation.status === 'CLOSED'} title={conversation.status === 'CLOSED' ? 'Reabra a conversa para alterar o responsável' : undefined}>{conversation.assignee ? <><UserCheck size={15} />{conversation.assignee.name}</> : <><UserPlus size={15} />Assumir</>}</button>
      <button type="button" className={`conversation-status-button ${currentStatusAction.className}`} onClick={onClose} disabled={statusChanging} aria-busy={statusChanging} title={currentStatusAction.title} aria-label={currentStatusAction.label}>{currentStatusAction.icon}<span>{currentStatusAction.shortLabel}</span></button>
      <button type="button" className="icon-button" onClick={openConversationMenu} aria-label="Mais ações da conversa" aria-expanded={Boolean(conversationMenu)} title="Mais ações"><MoreHorizontal size={18} /></button>
    </div>
  </header>;
  const renderTimeline = () => <>
    <div ref={bodyRef} className="conversation-body" onScroll={updateScrollPosition}>
      <ConversationHistoryLoader loading={loadingOlderMessages} hasOlder={hasOlderMessages} hasMessages={conversation.messages.length > 0} onLoad={requestOlderMessages} />
      {grouped.map((group) => <div className="message-day" key={group.date}><span>{group.label}</span>{group.items.map((item) => item.kind === 'event'
        ? <ConversationEventLog key={`event-${item.event.id}`} event={item.event} />
        : <MessageBubble key={item.message.id} message={item.message} replyTo={messageReplyTarget(item.message, messagesById, messagesByProviderId)} replyFallback={messageQuotedPreview(item.message)} contactName={conversation.contact.name} menuOpen={messageMenu?.message.id === item.message.id} onMenu={openMessageMenu} onReactionMenu={openReactionMenu} onJumpToReply={jumpToMessage} onReply={startReply} onRetry={retryMessage} retrying={retry.isPending && retry.variables === item.message.id} canRetry={canReply} onStartSharedContact={setSharedContactToStart} onMediaReady={keepLatestVisible} audioPlaybackRate={audioPlaybackRate} onCycleAudioPlaybackRate={cycleAudioPlaybackRate} />)}</div>)}
    </div>
    {showScrollToLatest && <button type="button" className="scroll-to-latest" onClick={scrollToLatest} aria-label="Ir para a mensagem mais recente" title="Ir para a mensagem mais recente"><ChevronDown size={21} /></button>}
  </>;
  const renderEmojiPicker = () => emojiPickerOpen && <dialog open ref={emojiPickerRef} className="composer-emoji-picker" aria-label="Selecionar emoji">
    <header><strong>Emojis</strong><button type="button" onClick={() => setEmojiPickerOpen(false)} aria-label="Fechar emojis"><X size={16} /></button></header>
    <Suspense fallback={<div className="composer-emoji-loading"><i />Carregando emojis…</div>}><EmojiPickerPopover onEmojiSelect={(emoji) => { textRef.current?.insertText(emoji); setAttachmentError(''); }} /></Suspense>
  </dialog>;
  const renderComposerInput = () => <div className="composer-input">
    {quickReplyMenuOpen && <QuickReplyCommandMenu loading={quickReplies.isLoading} failed={quickReplies.isError} options={quickReplyOptions} selectedIndex={quickReplyIndex} search={quickReplySearch} pending={insertQuickReply.isPending} pendingId={insertQuickReply.variables?.id} onHover={setQuickReplyIndex} onSelect={selectQuickReply} />}
    {automationMenuOpen && <WorkflowCommandMenu allowed={canStartAutomations} loading={workflows.isLoading} failed={workflows.isError} options={workflowOptions} selectedIndex={automationIndex} search={automationSearch} pending={startWorkflow.isPending} pendingId={startWorkflow.variables?.id} onHover={setAutomationIndex} onSelect={selectWorkflow} />}
    {editingMessage && <div className="composer-reply composer-edit"><Pencil size={16} /><div><strong>Editando mensagem</strong><span>{messagePreview(editingMessage)}</span></div><button type="button" onClick={cancelEdit} aria-label="Cancelar edição"><X size={15} /></button></div>}
    {replyingTo && <div className="composer-reply"><Reply size={16} /><div><strong>Respondendo a {replyingTo.direction === 'OUTBOUND' ? 'você' : conversation.contact.name}</strong><span>{messagePreview(replyingTo)}</span></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancelar resposta"><X size={15} /></button></div>}
    {file && <span className={`composer-file${filePreviewUrl ? ' has-preview' : ''}`}>{filePreviewUrl ? <img src={filePreviewUrl} alt="Prévia da imagem colada" /> : <FileText size={14} />}<span>{file.name}</span><button type="button" onClick={() => { setFile(null); setAttachmentError(''); }} aria-label="Remover anexo"><X size={12} /></button></span>}
    {readyAiSuggestion && <div className="composer-ai-suggestion"><Sparkles size={16} /><div><strong>Sugestão pronta</strong><span>{readyAiSuggestion}</span></div><button type="button" onClick={() => { setText(readyAiSuggestion); setReadyAiSuggestion(''); window.setTimeout(() => textRef.current?.moveCaretToEnd(), 0); }}>Inserir</button><button type="button" onClick={() => setReadyAiSuggestion('')} aria-label="Descartar sugestão"><X size={14} /></button></div>}
    <WhatsappComposer ref={textRef} value={text} disabled={!canReply} onPaste={pasteImage} onKeyDown={handleComposerKeyDown} onChange={handleComposerChange} placeholder={composerPlaceholder} onSubmit={handleComposerSubmit} />
  </div>;
  const renderIdleComposer = () => <>
    {renderEmojiPicker()}
    <div className="composer-capsule">
      <div className="composer-tools"><input ref={fileRef} hidden type="file" accept="image/*,audio/*,video/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onChange={(event) => { attachFile(event.target.files?.[0] || null); event.currentTarget.value = ''; }} /><button type="button" disabled={!canReply || Boolean(editingMessage)} onClick={() => fileRef.current?.click()} title="Anexar arquivo" aria-label="Anexar arquivo"><Plus size={22} /></button><button ref={emojiButtonRef} type="button" disabled={!canReply} onMouseDown={(event) => event.preventDefault()} onClick={() => { setEmojiPickerOpen((current) => !current); setAiMenuOpen(false); setAutomationMenuOpen(false); setQuickReplyMenuOpen(false); textRef.current?.focus(); }} title="Emojis" aria-label="Emojis" aria-haspopup="dialog" aria-expanded={emojiPickerOpen}><Smile size={20} /></button><div className="composer-ai-wrap"><button type="button" disabled={!canReply || Boolean(editingMessage)} className={aiMenuOpen ? 'active' : ''} onClick={() => { setAiMenuOpen((current) => !current); setEmojiPickerOpen(false); setAutomationMenuOpen(false); setQuickReplyMenuOpen(false); }} title="Assistente de IA" aria-label="Assistente de IA" aria-haspopup="menu" aria-expanded={aiMenuOpen}><Sparkles size={19} /></button>{aiMenuOpen && <div className="composer-ai-menu" role="menu"><header><Sparkles size={16} /><div><strong>Assistente de IA</strong><span>OpenAI · processamento em nuvem</span></div></header><button type="button" role="menuitem" disabled={createAiGeneration.isPending} onClick={() => createAiGeneration.mutate({ type: 'REPLY_SUGGESTION' })}>Sugerir resposta</button><button type="button" role="menuitem" disabled={createAiGeneration.isPending} onClick={() => createAiGeneration.mutate({ type: 'SUMMARY', scope: 'CURRENT_ATTENDANCE' })}>Resumir atendimento atual</button><button type="button" role="menuitem" disabled={createAiGeneration.isPending} onClick={() => createAiGeneration.mutate({ type: 'SUMMARY', scope: 'FULL_CONVERSATION' })}>Resumir conversa completa</button><button type="button" role="menuitem" onClick={() => { setAiMenuOpen(false); setAiSummaryOpen(true); }}>Ver último resumo</button></div>}</div></div>
      {renderComposerInput()}
      {canReply && (text.trim() || (!editingMessage && file)) && <div className="composer-send"><Button type="submit" loading={send.isPending || edit.isPending || startWorkflow.isPending || insertQuickReply.isPending} aria-label={currentSendAction.label} title={currentSendAction.label}>{currentSendAction.icon}</Button></div>}
      {canReply && !text.trim() && !file && !editingMessage && <div className="composer-send"><button type="button" className="composer-record" onClick={startVoiceRecording} disabled={send.isPending || startWorkflow.isPending || insertQuickReply.isPending} aria-label="Gravar áudio" title="Gravar áudio"><Mic size={20} /></button></div>}
    </div>
  </>;
  const renderComposer = () => <form className={`composer ${canReply ? '' : 'locked'}`} onSubmit={submit}>
    <label className={`composer-signature${signatureEnabled ? ' active' : ''}${signaturePreference.isPending ? ' saving' : ''}`} title="Assinatura"><Pencil size={16} /><input type="checkbox" checked={signatureEnabled} disabled={signaturePreference.isPending || recordingStatus !== 'idle'} onChange={(event) => signaturePreference.mutate(event.target.checked)} aria-label="Ativar assinatura nas mensagens" /></label>
    <div className="composer-shell">{recordingStatus !== 'idle' ? <VoiceRecorder status={recordingStatus} seconds={recordingSeconds} levels={voiceLevels} onDiscard={discardActiveRecording} onTogglePause={toggleRecordingPause} onSend={finishVoiceRecording} /> : renderIdleComposer()}</div>
  </form>;
  const renderMessageMenu = () => messageMenu && createPortal(<MessageActionMenu
      key={`${messageMenu.message.id}:${messageMenu.mode}`}
      menu={messageMenu}
      canInteract={canReply}
      reacting={react.isPending}
      ownReaction={messageReactions(messageMenu.message).find((item) => item.source === 'me' || (!item.source && Boolean(item.userId)))?.emoji}
      onClose={() => setMessageMenu(null)}
      onCopy={() => void copyMessage(messageMenu.message)}
      onDownload={() => void downloadAudio(messageMenu.message)}
      downloading={downloadingMediaId === messageAudioMedia(messageMenu.message)?.id}
      onReply={() => startReply(messageMenu.message)}
      onReact={(emoji) => toggleReaction(messageMenu.message, emoji)}
      onEdit={() => startEdit(messageMenu.message)}
      onEditHistory={() => { setEditHistoryMessage(messageMenu.message); setMessageMenu(null); }}
      onDelete={() => { setDeletingMessage(messageMenu.message); setMessageMenu(null); }}
    />, document.body);
  const renderConversationActions = () => conversationMenu && createPortal(<>
      <button type="button" className="message-menu-scrim" onClick={() => setConversationMenu(null)} aria-label="Fechar ações da conversa" />
      <div className="conversation-action-menu" role="menu" style={{ top: conversationMenu.top, left: conversationMenu.left }}>
        {conversation.contact.phone
          ? <a role="menuitem" href={`tel:${conversation.contact.phone}`} onClick={() => setConversationMenu(null)}><Phone size={17} /><span>Ligar para {formatPhone(conversation.contact.phone)}</span></a>
          : <button type="button" role="menuitem" disabled title="O contato não possui telefone cadastrado"><Phone size={17} /><span>Ligar</span></button>}
        <button type="button" role="menuitem" disabled={!canCreateOpportunity} title={!canCreateOpportunity ? 'Você não possui permissão para criar oportunidades' : undefined} onClick={() => { setConversationMenu(null); setOpportunityOpen(true); }}><BriefcaseBusiness size={17} /><span>Criar oportunidade</span></button>
        <button type="button" role="menuitem" disabled={!conversation.assignee || !canScheduleFollowUp} title={followUpDisabledReason(conversation, canScheduleFollowUp)} onClick={() => { setConversationMenu(null); setFollowUpOpen(true); }}><Clock size={17} /><span>{conversation.followUps?.length ? 'Ver/editar follow-up' : 'Agendar follow-up automático'}</span></button>
        <button type="button" role="menuitem" disabled={conversation.status === 'CLOSED'} title={conversation.status === 'CLOSED' ? 'Reabra a conversa antes de transferir' : undefined} onClick={() => { setConversationMenu(null); setTransferTarget(''); transfer.reset(); setTransferOpen(true); }}><ArrowRightLeft size={17} /><span>Transferir para atendente</span></button>
        <button type="button" role="menuitem" disabled={exportPdf.isPending} onClick={() => { setConversationMenu(null); setActionError(''); exportPdf.mutate(); }}><Download size={17} /><span>{exportPdf.isPending ? 'Exportando PDF…' : 'Exportar para PDF'}</span></button>
      </div>
    </>, document.body);
  const renderConversationModals = () => <>
    {opportunityOpen && <ContactOpportunityModal
      contact={conversation.contact}
      onClose={() => setOpportunityOpen(false)}
      onCreated={() => {
        setOpportunityOpen(false);
        setActionNotice(`Oportunidade criada para ${conversation.contact.name}`);
        onSend();
      }}
    />}
    {sharedContactToStart && <SharedContactConversationModal
      contact={sharedContactToStart}
      preferredInstanceId={conversation.instance.id}
      onClose={() => setSharedContactToStart(null)}
      onStarted={(conversationId) => {
        setSharedContactToStart(null);
        onSend();
        navigate(`/inbox/${conversationId}`);
      }}
    />}
    {contactOpen && <ContactDrawer conversation={conversation} onClose={() => setContactOpen(false)} onUpdated={onSend} />}
    {aiSummaryOpen && <AiSummaryDrawer generation={activeAiGeneration.data?.data.type === 'SUMMARY' ? activeAiGeneration.data.data : latestAiSummary.data?.data || null} loading={activeAiGeneration.isLoading || latestAiSummary.isLoading || createAiGeneration.isPending} onClose={() => setAiSummaryOpen(false)} />}
    {followUpOpen && <FollowUpModal conversationId={conversation.id} contactName={conversation.contact.name} followUpId={conversation.followUps?.[0]?.id} onClose={() => setFollowUpOpen(false)} onSaved={onSend} />}
    {editHistoryMessage && <MessageEditHistoryModal message={editHistoryMessage} onClose={() => setEditHistoryMessage(null)} />}
    {deletingMessage && <Modal title="Apagar mensagem?" onClose={() => { if (!remove.isPending) setDeletingMessage(null); }} width={470}>
      <div className="delete-message-confirmation"><div className="delete-message-icon"><Trash2 size={22} /></div><div><strong>Apagar para todos</strong><p>A mensagem será removida desta conversa e também do WhatsApp do contato.</p><blockquote>{messagePreview(deletingMessage)}</blockquote></div></div>
      <div className="modal-actions"><Button variant="secondary" onClick={() => setDeletingMessage(null)} disabled={remove.isPending}>Cancelar</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(deletingMessage.id)}><Trash2 size={16} />Apagar para todos</Button></div>
    </Modal>}
    {transferOpen && <Modal title="Transferir atendimento" onClose={() => { if (!transfer.isPending) { setTransferOpen(false); setTransferTarget(''); } }} width={540}>
      <div className="conversation-transfer">
        <div className="conversation-transfer-intro"><ArrowRightLeft size={20} /><div><strong>Escolha o novo atendente</strong><p>A conversa será removida da sua fila e o novo responsável receberá uma notificação.</p></div></div>
        {transferTargetContent}
      </div>
      <div className="modal-actions"><Button variant="secondary" onClick={() => { setTransferOpen(false); setTransferTarget(''); }} disabled={transfer.isPending}>Cancelar</Button><Button onClick={() => transferTarget && transfer.mutate(transferTarget)} loading={transfer.isPending} disabled={!transferTarget}><ArrowRightLeft size={16} />Transferir</Button></div>
    </Modal>}
  </>;
  const renderInstanceChangeModal = () => instanceChangeOpen && <Modal title="Trocar conexão da conversa" onClose={() => {
      if (!changeInstance.isPending) {
        setInstanceChangeOpen(false);
        setInstanceTarget('');
      }
    }} width={560}>
      <div className="conversation-instance-change">
        <div className="conversation-instance-warning">
          <AlertCircle size={21} />
          <div>
            <strong>Esta ação mudará o número usado com este cliente</strong>
            <p>O histórico continuará nesta conversa, mas todas as próximas mensagens serão enviadas pela nova conexão.</p>
          </div>
        </div>
        <div className="conversation-instance-current">
          <span>Conexão indisponível</span>
          <strong>{conversation.instance.name}</strong>
          <small>{conversation.instance.phone ? formatPhone(conversation.instance.phone) : 'Número não informado'} · {conversation.instance.archivedAt ? 'Excluída' : 'Desconectada'}</small>
        </div>
        {instanceOptionContent}
        {selectedInstanceTarget && <div className="conversation-instance-confirmation">
          <Cable size={18} />
          <span>As próximas mensagens serão enviadas por <strong>{selectedInstanceTarget.name}</strong>{selectedInstanceTarget.phone ? ` (${formatPhone(selectedInstanceTarget.phone)})` : ''}.</span>
        </div>}
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={() => {
          setInstanceChangeOpen(false);
          setInstanceTarget('');
        }} disabled={changeInstance.isPending}>Cancelar</Button>
        <Button
          onClick={() => instanceTarget && changeInstance.mutate(instanceTarget)}
          loading={changeInstance.isPending}
          disabled={!instanceTarget || availableInstances.isLoading}
        ><ArrowRightLeft size={16} />Confirmar troca</Button>
      </div>
    </Modal>;
  return <section
    className="conversation-view"
    aria-label="Conversa selecionada"
    onDragEnter={handleAttachmentDragEnter}
    onDragOver={handleAttachmentDragOver}
    onDragLeave={handleAttachmentDragLeave}
    onDrop={handleAttachmentDrop}
  >
    {draggingAttachment && <div className={`conversation-file-drop${canAcceptDrop ? '' : ' unavailable'}`} aria-hidden="true"><div><span><Upload size={28} /></span><strong>{dropCopy.title}</strong><small>{dropCopy.description}</small></div></div>}
    {renderHeader()}
    {renderTimeline()}
    {renderComposer()}
    {renderMessageMenu()}
    {renderConversationActions()}
    {renderConversationModals()}
    {renderInstanceChangeModal()}
  </section>;
}

function outgoingMessageType(file: File) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function messageMenuHeight(mode: MessageMenuState['mode'], direction: Message['direction']) {
  if (mode === 'reactions') return 54;
  if (direction === 'OUTBOUND') return 274;
  return 188;
}

function recordingErrorMessage(name: string) {
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permita o acesso ao microfone no navegador para gravar áudio.';
  if (name === 'NotFoundError') return 'Nenhum microfone foi encontrado neste dispositivo.';
  return 'Não foi possível iniciar a gravação de áudio.';
}

function conversationComposerPlaceholder(connectionUnavailable: boolean, status: string, canReply: boolean, editing: boolean, hasFile: boolean) {
  if (connectionUnavailable) return 'Troque a conexão para voltar a enviar mensagens';
  if (status === 'CLOSED') return 'Reabra a conversa para responder';
  if (!canReply) return 'Assuma a conversa para responder';
  if (editing) return 'Edite sua mensagem…';
  if (hasFile) return 'Adicione uma legenda…';
  return 'Escreva uma mensagem ou cole uma imagem…';
}

function attachmentDropCopy(canReply: boolean, editing: boolean) {
  if (canReply && !editing) return {
    title: 'Solte o arquivo para anexar',
    description: 'Imagens, vídeos, áudios e documentos de até 25 MB',
  };
  if (editing) return {
    title: 'Conclua a edição para anexar',
    description: 'O envio de arquivos está indisponível neste momento',
  };
  return {
    title: 'Assuma a conversa para anexar',
    description: 'O envio de arquivos está indisponível neste momento',
  };
}

function statusAction(statusChanging: boolean, status: string) {
  const closed = status === 'CLOSED';
  const label = closed ? 'Reabrir atendimento' : 'Finalizar atendimento';
  const shortLabel = closed ? 'Reabrir' : 'Finalizar';
  let title = label;
  if (statusChanging) title = 'Atualizando atendimento em segundo plano';
  return {
    className: closed ? 'reopen' : 'finish',
    label,
    shortLabel,
    title,
    icon: closed ? <RotateCcw size={16} /> : <Archive size={16} />,
  };
}

function sendAction(editing: boolean, quickReplyOpen: boolean, automationOpen: boolean) {
  if (editing) return { label: 'Salvar edição', icon: <Check size={18} /> };
  if (quickReplyOpen) return { label: 'Inserir resposta rápida', icon: <MessageSquareReply size={18} /> };
  if (automationOpen) return { label: 'Iniciar automação', icon: <Workflow size={18} /> };
  return { label: 'Enviar mensagem', icon: <Send size={19} /> };
}

function ConversationHistoryLoader({ loading, hasOlder, hasMessages, onLoad }: Readonly<{ loading: boolean; hasOlder: boolean; hasMessages: boolean; onLoad(): void }>) {
  let content: ReactNode = null;
  if (loading) content = <span><i />Carregando mensagens anteriores…</span>;
  else if (hasOlder) content = <button type="button" onClick={onLoad}><History size={14} />Carregar mensagens anteriores</button>;
  else if (hasMessages) content = <span>Início da conversa</span>;
  return <div className="conversation-history-loader">{content}</div>;
}

function VoiceRecorder({ status, seconds, levels, onDiscard, onTogglePause, onSend }: Readonly<{
  status: RecordingStatus;
  seconds: number;
  levels: number[];
  onDiscard(): void;
  onTogglePause(): void;
  onSend(): void;
}>) {
  const requesting = status === 'requesting';
  const finishing = status === 'finishing';
  const paused = status === 'paused';
  const duration = voiceDuration(seconds);
  return <fieldset className={`voice-recorder ${status}`} aria-label="Gravador de mensagem de voz" style={{ margin: 0, minWidth: 0, border: 0 }}>
    <button type="button" className="voice-recorder-delete" onClick={onDiscard} disabled={finishing} aria-label="Cancelar gravação" title="Cancelar gravação"><Trash2 size={20} /></button>
    <span className="voice-recorder-time" aria-label={`Duração ${duration}`}><i />{requesting ? 'Microfone…' : duration}</span>
    <div className="voice-recorder-waveform" aria-hidden="true">{VOICE_BAR_IDS.map((id, index) => <i key={id} style={{ height: `${Math.round(5 + levels[index] * 23)}px` }} />)}</div>
    <button type="button" className="voice-recorder-pause" onClick={onTogglePause} disabled={requesting || finishing} aria-label={paused ? 'Retomar gravação' : 'Pausar gravação'} title={paused ? 'Retomar gravação' : 'Pausar gravação'}>{paused ? <Play size={20} /> : <Pause size={20} />}</button>
    <button type="button" className="voice-recorder-send" onClick={onSend} disabled={requesting || finishing} aria-label="Enviar áudio" title="Enviar áudio">{finishing ? <Clock className="spin" size={19} /> : <Send size={19} />}</button>
  </fieldset>;
}

function quickReplyDescription(reply: QuickReplyShortcut) {
  if (!reply.mediaAsset) return reply.text || 'Sem conteúdo';
  const kind = reply.text ? 'Texto e anexo' : 'Anexo';
  return `${kind} · ${reply.mediaAsset.filename}`;
}

function QuickReplyCommandMenu({ loading, failed, options, selectedIndex, search, pending, pendingId, onHover, onSelect }: Readonly<{
  loading: boolean;
  failed: boolean;
  options: QuickReplyShortcut[];
  selectedIndex: number;
  search: string;
  pending: boolean;
  pendingId?: string;
  onHover(index: number): void;
  onSelect(reply: QuickReplyShortcut): void;
}>) {
  let content: ReactNode;
  if (loading) content = <div className="automation-command-empty"><i />Carregando respostas rápidas…</div>;
  else if (failed) content = <div className="automation-command-empty error"><AlertCircle size={17} /><span>Não foi possível carregar as respostas rápidas.</span></div>;
  else if (options.length) {
    content = options.map((reply, index) => {
      const trailing = pending && pendingId === reply.id ? <i /> : <ChevronDown size={15} />;
      return <button
        type="button"
        aria-current={index === selectedIndex ? 'true' : undefined}
        className={index === selectedIndex ? 'selected' : ''}
        key={reply.id}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHover(index)}
        onClick={() => onSelect(reply)}
        disabled={pending}
      ><span><MessageSquareReply size={16} /></span><div><strong>/{reply.shortcut} · {reply.title}</strong><small>{quickReplyDescription(reply)}</small></div>{trailing}</button>;
    });
  } else {
    const emptyText = search ? 'Nenhuma resposta corresponde à busca.' : 'Nenhuma resposta rápida cadastrada.';
    content = <div className="automation-command-empty"><MessageSquareReply size={17} /><span>{emptyText}</span></div>;
  }
  return <section className="automation-command-menu quick-reply-command-menu" aria-label="Respostas rápidas disponíveis">
    <div className="automation-command-heading"><span><MessageSquareReply size={17} /></span><div><strong>Inserir resposta rápida</strong><small>O conteúdo ficará disponível para edição</small></div><kbd>Esc</kbd></div>
    <div className="automation-command-options">{content}</div>
    <div className="automation-command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> inserir</span></div>
  </section>;
}

function WorkflowCommandMenu({ allowed, loading, failed, options, selectedIndex, search, pending, pendingId, onHover, onSelect }: Readonly<{
  allowed: boolean;
  loading: boolean;
  failed: boolean;
  options: WorkflowShortcut[];
  selectedIndex: number;
  search: string;
  pending: boolean;
  pendingId?: string;
  onHover(index: number): void;
  onSelect(workflow: WorkflowShortcut): void;
}>) {
  let content: ReactNode = null;
  if (!allowed) content = <div className="automation-command-empty"><ShieldCheck size={17} /><span>Você não tem permissão para iniciar automações.</span></div>;
  else if (loading) content = <div className="automation-command-empty"><i />Carregando automações…</div>;
  else if (!failed && options.length) {
    content = options.map((workflow, index) => {
      const trailing = pending && pendingId === workflow.id ? <i /> : <ChevronDown size={15} />;
      return <button
        type="button"
        aria-current={index === selectedIndex ? 'true' : undefined}
        className={index === selectedIndex ? 'selected' : ''}
        key={workflow.id}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHover(index)}
        onClick={() => onSelect(workflow)}
        disabled={pending}
      ><span><Workflow size={16} /></span><div><strong>{workflow.name}</strong><small>{workflow.description || `Versão ${workflow.publishedVersion}`}</small></div>{trailing}</button>;
    });
  } else if (!failed) {
    const emptyText = search ? 'Nenhuma automação corresponde à busca.' : 'Nenhuma automação publicada disponível.';
    content = <div className="automation-command-empty"><Workflow size={17} /><span>{emptyText}</span></div>;
  }
  return <section className="automation-command-menu" aria-label="Automações disponíveis">
    <div className="automation-command-heading"><span><Workflow size={17} /></span><div><strong>Iniciar automação</strong><small>Continue digitando para filtrar</small></div><kbd>Esc</kbd></div>
    <div className="automation-command-options">{content}</div>
    <div className="automation-command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> iniciar</span></div>
  </section>;
}

function MessageEditHistoryModal({ message, onClose }: Readonly<{ message: Message; onClose(): void }>) {
  const previousVersions = messageEditHistory(message)
    .map((version, index) => ({ ...version, original: index === 0 }))
    .reverse();
  const editedAt = messageEditedAt(message);
  const currentText = message.text
    || (typeof message.payload?.originalText === 'string' ? message.payload.originalText : '')
    || 'Conteúdo indisponível';

  return <Modal title="Histórico de edições" onClose={onClose} width={620}>
    <div className="message-edit-history">
      <div className="message-edit-history-intro">
        <History size={20} />
        <div>
          <strong>Versões desta mensagem</strong>
          <p>O histórico é interno e não envia nenhuma informação adicional ao contato.</p>
        </div>
      </div>
      <div className="message-edit-history-list">
        <article className="current">
          <header>
            <strong>Versão atual</strong>
            <span>{editedAt ? `Editada em ${dateTime(editedAt)}` : 'Versão atual'}</span>
          </header>
          <div><WhatsappText text={currentText} /></div>
        </article>
        {previousVersions.map((version, index) => <article key={`${version.editedAt || 'version'}-${index}`}>
          <header>
            <strong>{version.original ? 'Mensagem original' : 'Versão anterior'}</strong>
            <span>{version.editedAt ? `Substituída em ${dateTime(version.editedAt)}` : 'Data não informada'}</span>
          </header>
          <div><WhatsappText text={version.text || 'Conteúdo vazio'} /></div>
        </article>)}
      </div>
    </div>
    <div className="modal-actions message-edit-history-actions">
      <Button variant="secondary" onClick={onClose}>Fechar</Button>
    </div>
  </Modal>;
}

function AiSummaryDrawer({ generation, loading, onClose }: Readonly<{ generation: AiGeneration | null; loading: boolean; onClose(): void }>) {
  const result = generation?.result;
  const isRunning = generation && ['PENDING', 'WAITING_INPUT', 'RUNNING'].includes(generation.status);
  const list = (title: string, items?: string[]) => items?.length ? <section><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section> : null;
  return <><button type="button" className="drawer-scrim" onClick={onClose} aria-label="Fechar resumo da IA" /><aside className="opportunity-drawer ai-summary-drawer" aria-label="Resumo do atendimento"><header><div><span className="eyebrow">Assistente de IA</span><h2>Resumo da conversa</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header><div className="drawer-content">{(loading || isRunning) && <div className="ai-summary-progress"><div><Sparkles size={20} /><strong>{generation?.status === 'WAITING_INPUT' ? 'Aguardando transcrição de áudio' : 'Analisando a conversa'}</strong><span>{generation?.progress || 0}% concluído</span></div><i><span style={{ width: `${generation?.progress || 8}%` }} /></i><p>Você pode fechar este painel. O processamento continua em segundo plano.</p></div>}{!loading && !isRunning && !result && <Empty icon={<Sparkles />} title="Nenhum resumo salvo" description="Use o menu de IA na barra de digitação para gerar o primeiro resumo." />}{result && <div className="ai-summary-content"><div className="ai-summary-meta"><span>{generation?.scope === 'FULL_CONVERSATION' ? 'Conversa completa' : 'Atendimento atual'}</span>{generation?.status === 'STALE' && <strong>Desatualizado</strong>}{generation?.completedAt && <time>{dateTime(generation.completedAt)}</time>}</div><section><h3>Visão geral</h3><p>{result.overview || 'Não identificado.'}</p></section><section><h3>Necessidade</h3><p>{result.need || 'Não identificada.'}</p></section>{list('Compromissos', result.commitments)}{list('Próximos passos', result.nextSteps)}{list('Pontos pendentes', result.pending)}</div>}</div></aside></>;
}

function AiProposalSection(props: Readonly<{
  proposal: AiProposal;
  selected: string[];
  companies: Company[];
  companyId: string;
  pending: boolean;
  onSelection(fields: string[]): void;
  onCompany(companyId: string): void;
  onAction(action: 'apply' | 'dismiss'): void;
}>) {
  const fields = Object.entries(props.proposal.changes).filter(([, value]) => typeof value === 'string' && value.trim());
  const labels: Record<string, string> = { name: 'Nome', email: 'E-mail', jobTitle: 'Cargo', companyName: 'Empresa', qualificationNote: 'Nota de qualificação' };
  const apiField = (field: string) => field === 'companyName' ? 'company' : field;
  const toggle = (field: string, checked: boolean) => {
    const normalized = apiField(field);
    props.onSelection(checked ? [...new Set([...props.selected, normalized])] : props.selected.filter((item) => item !== normalized));
  };
  return <section className="ai-proposal-card"><h3><Sparkles size={15} />Sugestões da IA</h3><p>Revise e selecione somente os dados que deseja aplicar.</p><div className="ai-proposal-fields">{fields.map(([field, value]) => <label key={field}><input type="checkbox" checked={props.selected.includes(apiField(field))} onChange={(event) => toggle(field, event.target.checked)} /><span><strong>{labels[field] || field}</strong><small>{value}</small></span></label>)}</div>{props.selected.includes('company') && <label className="field"><span>Confirmar empresa existente</span><select value={props.companyId} onChange={(event) => props.onCompany(event.target.value)}><option value="">Usar correspondência exata pelo nome</option>{props.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className="ai-proposal-actions"><Button variant="ghost" disabled={props.pending} onClick={() => props.onAction('dismiss')}>Descartar</Button><Button disabled={!props.selected.length} loading={props.pending} onClick={() => props.onAction('apply')}><Check size={15} />Aplicar selecionadas</Button></div></section>;
}

function ContactDrawer({ conversation, onClose, onUpdated }: Readonly<{ conversation: Conversation; onClose(): void; onUpdated(): void }>) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inlineField, setInlineField] = useState<ContactInlineField | null>(null);
  const [inlineValue, setInlineValue] = useState('');
  const [proposalSelections, setProposalSelections] = useState<Record<string, string[]>>({});
  const [proposalCompanies, setProposalCompanies] = useState<Record<string, string>>({});
  const contact = conversation.contact;
  const company = contact.companies?.find((item) => item.isPrimary)?.company || contact.companies?.[0]?.company;
  const pipelineOpportunity = contact.opportunities?.find(({ isPrimary, opportunity }) => isPrimary && opportunity.status === 'OPEN')?.opportunity
    || contact.opportunities?.find(({ opportunity }) => opportunity.status === 'OPEN')?.opportunity
    || contact.opportunities?.find(({ isPrimary }) => isPrimary)?.opportunity
    || contact.opportunities?.[0]?.opportunity;
  const crmOwner = pipelineOpportunity ? pipelineOpportunity.owner : contact.owner;
  const crmTeam = pipelineOpportunity ? pipelineOpportunity.team : contact.team;
  const canEdit = Boolean(user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === 'contacts') && (permission.action === '*' || permission.action === 'write')));
  const companies = useQuery({
    queryKey: ['contact-company-options'],
    queryFn: () => api<Envelope<Company[]>>('/companies?limit=100'),
    enabled: inlineField === 'companyId' || Boolean(Object.keys(proposalSelections).length),
  });
  const aiProposals = useQuery({
    queryKey: ['ai-proposals', conversation.id],
    queryFn: () => api<Envelope<AiProposal[]>>(`/conversations/${conversation.id}/ai/proposals`),
  });
  const sortedCompanies = useMemo(() => [...(companies.data?.data || [])].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')), [companies.data?.data]);
  const refresh = () => {
    setEditing(false);
    setInlineField(null);
    void client.invalidateQueries({ queryKey: ['contacts'] });
    void client.invalidateQueries({ queryKey: ['conversation', conversation.id] });
    void client.invalidateQueries({ queryKey: ['conversations'] });
    onUpdated();
  };
  const inlineUpdate = useMutation({
    mutationFn: ({ field, value }: { field: ContactInlineField; value: string }) => {
      const payload = field === 'companyId'
        ? { companyId: value || null }
        : { [field]: field === 'phone' ? normalizeEditablePhone(value) : value.trim() };
      return api<Envelope<Contact>>(`/contacts/${contact.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: refresh,
  });
  const updateProposal = useMutation({
    mutationFn: ({ proposalId, action }: { proposalId: string; action: 'apply' | 'dismiss' }) => api(`/conversations/${conversation.id}/ai/proposals/${proposalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, fields: proposalSelections[proposalId] || [], companyId: proposalCompanies[proposalId] || undefined }),
    }),
    onSuccess: () => {
      toast.success('Sugestão da IA atualizada.');
      void aiProposals.refetch();
      refresh();
    },
  });
  const beginInlineEdit = (field: ContactInlineField) => {
    if (!canEdit || inlineUpdate.isPending) return;
    inlineUpdate.reset();
    setInlineField(field);
    setInlineValue(inlineContactValue(field, contact, company?.id));
  };
  const cancelInlineEdit = () => {
    if (inlineUpdate.isPending) return;
    inlineUpdate.reset();
    setInlineField(null);
  };
  const submitInlineEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!inlineField) return;
    inlineUpdate.mutate({ field: inlineField, value: inlineValue });
  };
  const inlineSaveDisabled = inlineUpdate.isPending
    || (inlineField !== 'companyId' && !inlineValue.trim())
    || (inlineField === 'companyId' && (companies.isLoading || companies.isError));
  const detailRow = (field: ContactInlineField, icon: ReactNode, label: string, value: string) => {
    if (inlineField === field) {
      return <form className="contact-detail-row contact-detail-inline-form" onSubmit={submitInlineEdit}>
        {icon}<span>{label}</span>
        <div className="contact-inline-editor">
          {field === 'companyId'
            ? <select value={inlineValue} onChange={(event) => setInlineValue(event.target.value)} disabled={companies.isLoading || companies.isError} autoFocus aria-label="Empresa do contato">
                <option value="">{companies.isLoading ? 'Carregando empresas…' : 'Sem empresa vinculada'}</option>
                {sortedCompanies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            : <input
                type={field === 'email' ? 'email' : 'tel'}
                value={inlineValue}
                onChange={(event) => setInlineValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') cancelInlineEdit(); }}
                placeholder={field === 'email' ? 'contato@empresa.com.br' : '+5511999999999'}
                aria-label={`${label} do contato`}
                autoFocus
                required
              />}
          <div className="contact-inline-actions">
            <button type="submit" className="icon-button contact-inline-save" disabled={inlineSaveDisabled} aria-label={`Salvar ${label.toLowerCase()}`} title="Salvar"><Check size={15} /></button>
            <button type="button" className="icon-button" onClick={cancelInlineEdit} disabled={inlineUpdate.isPending} aria-label="Cancelar edição" title="Cancelar"><X size={15} /></button>
          </div>
        </div>
      </form>;
    }
    const content = <>{icon}<span>{label}</span><strong>{value}</strong>{canEdit && <Pencil className="contact-detail-pencil" size={14} />}</>;
    return canEdit
      ? <button type="button" className="contact-detail-row contact-detail-edit-trigger" onClick={() => beginInlineEdit(field)} aria-label={`Editar ${label.toLowerCase()}`}>{content}</button>
      : <div className="contact-detail-row">{content}</div>;
  };
  return <>
    <button type="button" className="drawer-scrim" onClick={onClose} aria-label="Fechar informações do contato" />
    <aside className="opportunity-drawer contact-drawer" aria-label={`Informações de ${contact.name}`}>
      <header>
        <div><span className="eyebrow">Contato</span><h2>{contact.name}</h2></div>
        <div className="contact-drawer-actions">{canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Editar contato</Button>}<button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      </header>
      <div className="drawer-content contact-drawer-content">
        <div className="contact-drawer-profile"><WhatsappAvatar conversationId={conversation.id} name={contact.name} large /><div><strong>{contact.name}</strong><span>{contact.jobTitle || company?.name || 'Contato do CRM'}</span></div></div>
        <section>
          <h3><UserRound size={15} />Dados de contato</h3>
          <div className="contact-detail-list">
            {detailRow('phone', <Phone size={16} />, 'Telefone', contact.phone ? formatPhone(contact.phone) : 'Não informado')}
            {detailRow('email', <Mail size={16} />, 'E-mail', contact.email || 'Não informado')}
            {detailRow('companyId', <Building2 size={16} />, 'Empresa', company?.name || 'Sem empresa vinculada')}
          </div>
        </section>
        <section>
          <h3><BriefcaseBusiness size={15} />Informações do CRM</h3>
          <div className="drawer-grid">
            <div><h3><UserRound size={14} />Responsável</h3><p>{crmOwner?.name || 'Sem responsável'}</p></div>
            <div><h3><UsersRound size={14} />Equipe</h3><p>{crmTeam?.name || 'Sem equipe'}</p></div>
          </div>
        </section>
        {aiProposals.data?.data.map((proposal) => <AiProposalSection
          key={proposal.id}
          proposal={proposal}
          selected={proposalSelections[proposal.id] || []}
          companies={sortedCompanies}
          companyId={proposalCompanies[proposal.id] || ''}
          pending={updateProposal.isPending && updateProposal.variables?.proposalId === proposal.id}
          onSelection={(fields) => setProposalSelections((current) => ({ ...current, [proposal.id]: fields }))}
          onCompany={(companyId) => setProposalCompanies((current) => ({ ...current, [proposal.id]: companyId }))}
          onAction={(action) => updateProposal.mutate({ proposalId: proposal.id, action })}
        />)}
        <section>
          <h3><Tags size={15} />Tags</h3>
          {contact.tags?.length ? <div className="drawer-tags">{contact.tags.map(({ tag }) => <span key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span>)}</div> : <p className="drawer-empty-copy">Nenhuma tag adicionada.</p>}
        </section>
        <section>
          <h3><BriefcaseBusiness size={15} />Oportunidades</h3>
          {contact.opportunities?.length ? <div className="contact-opportunity-list">{contact.opportunities.map(({ opportunity }) => <div key={opportunity.id}><div><strong>{opportunity.title}</strong><small>{opportunityStatusLabel(opportunity.status)}</small></div><span><i style={{ background: opportunity.stage.color }} />{opportunity.stage.name}</span></div>)}</div> : <p className="drawer-empty-copy">Nenhuma oportunidade vinculada.</p>}
        </section>
      </div>
    </aside>
    {editing && <ContactModal contact={contact} onClose={() => setEditing(false)} onSaved={refresh} />}
  </>;
}

const WhatsappAvatar = memo(function WhatsappAvatar({ conversationId, name, large = false }: Readonly<{ conversationId: string; name: string; large?: boolean }>) {
  const [failed, setFailed] = useState(false);
  return <span className={`contact-avatar${large ? ' large' : ''}${failed ? '' : ' has-image'}`}>
    {!failed && <img src={apiUrl(`/conversations/${conversationId}/profile-picture?v=1`)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    {failed && initials(name)}
  </span>;
});

const ConversationEventLog = memo(function ConversationEventLog({ event }: Readonly<{ event: ConversationEvent }>) {
  return <div className={`conversation-event conversation-event-${event.type}`}><span><History size={13} /><strong>{event.text}</strong><time>{dateTime(event.createdAt).split(' ')[1]}</time></span></div>;
});

const SharedContactCard = memo(function SharedContactCard({ contact, onStart }: Readonly<{ contact: SharedWhatsappContact; onStart(): void }>) {
  return <div className="shared-contact-card">
    <div className="shared-contact-card-person">
      <span>{initials(contact.name)}</span>
      <div><strong>{contact.name}</strong><small>{formatPhone(contact.phone)}</small></div>
    </div>
    <button type="button" onClick={onStart}><MessageCircle size={16} />Iniciar conversa</button>
  </div>;
});

const LocationCard = memo(function LocationCard({ location }: Readonly<{ location: WhatsappLocation }>) {
  const title = location.name || 'Localização compartilhada';
  return <a
    className="message-location-card"
    href={location.mapsUrl}
    target="_blank"
    rel="noreferrer"
    aria-label={`Abrir ${title} no mapa`}
  >
    <span className={`message-location-map${location.thumbnailUrl ? '' : ' fallback'}`}>
      {location.thumbnailUrl
        ? <img src={location.thumbnailUrl} alt={`Mapa de ${title}`} loading="lazy" decoding="async" />
        : <MapPin size={34} />}
    </span>
    <span className="message-location-info">
      <span><strong>{title}</strong>{location.address && <small>{location.address}</small>}</span>
      <b><ExternalLink size={13} />Abrir no mapa</b>
    </span>
  </a>;
});

function ExpandableText({ text, whatsapp = false }: Readonly<{ text: string; whatsapp?: boolean }>) {
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => setExpanded(false), [text]);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || expanded) return;
    const updateOverflow = () => setOverflowing(content.scrollHeight > content.clientHeight + 1);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [expanded, text]);

  return <>
    <p ref={contentRef} className={`expandable-message-text${expanded ? ' expanded' : ' collapsed'}`}>
      {whatsapp ? <WhatsappText text={text} /> : text}
    </p>
    {(overflowing || expanded) && <button
      type="button"
      className="expandable-message-toggle"
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
    >
      {expanded ? 'Ver menos' : 'Ver mais...'}
    </button>}
  </>;
}

function messageLinkLabel(url: string) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return url; }
}

function MessageLinkPreview({ message, url, onReady }: Readonly<{ message: Message; url: string; onReady(): void }>) {
  const preview = useQuery({
    queryKey: ['message-link-preview', message.conversationId, url],
    queryFn: () => api<Envelope<MessageLinkPreviewData | null>>(`/conversations/${message.conversationId}/messages/${message.id}/link-preview`),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const data = preview.data?.data;

  useEffect(() => {
    if (data) onReady();
  }, [data, onReady]);

  if (!data) return null;
  return <a
    className="message-link-preview"
    href={data.url || url}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`Abrir prévia de ${data.title || data.hostname}`}
  >
    <span className="message-link-preview-media"><Link2 size={21} />{data.imageUrl && <img src={data.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={onReady} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
    <span className="message-link-preview-copy"><strong>{data.title || messageLinkLabel(url)}</strong>{data.description && <span>{data.description}</span>}<small>{data.siteName || data.hostname || messageLinkLabel(url)}</small></span>
  </a>;
}

type MessageBubbleProps = Readonly<{
  message: Message;
  replyTo?: Message;
  replyFallback?: string;
  contactName: string;
  menuOpen: boolean;
  onMenu(message: Message, clientX: number, clientY: number): void;
  onReactionMenu(message: Message, clientX: number, clientY: number): void;
  onJumpToReply(messageId: string): void;
  onReply(message: Message): void;
  onRetry(messageId: string): void;
  retrying: boolean;
  canRetry: boolean;
  onStartSharedContact(contact: SharedWhatsappContact): void;
  onMediaReady(): void;
  audioPlaybackRate: number;
  onCycleAudioPlaybackRate(): void;
}>;

function messageBubbleText(message: Message, sharedContactMessage: boolean, locationMessage: boolean, deleted: boolean, sticker: boolean, originalText?: string) {
  if (sharedContactMessage || locationMessage) return '';
  if (message.text) return message.text;
  if (originalText) return originalText;
  if (deleted) return 'Conteúdo original indisponível';
  if (sticker && !message.media?.length) return 'Figurinha indisponível';
  if (message.media?.length) return '';
  return `[${message.type}]`;
}

function messageBubbleClassName(state: {
  sticker: boolean;
  visualMedia: boolean;
  documentMedia: boolean;
  sharedContactMessage: boolean;
  locationMessage: boolean;
  hasLink: boolean;
  deleted: boolean;
  failed: boolean;
}) {
  const classes = ['message-bubble'];
  if (state.sticker) classes.push('sticker');
  if (state.visualMedia) classes.push('visual-media');
  if (state.documentMedia) classes.push('document-media');
  if (state.sharedContactMessage) classes.push('contact-message');
  if (state.locationMessage) classes.push('location-message');
  if (state.hasLink) classes.push('link-preview-message');
  if (state.deleted) classes.push('deleted-message');
  if (state.failed) classes.push('failed');
  return classes.join(' ');
}

function MessageQuickReaction({ visible, message, onReactionMenu }: Readonly<{
  visible: boolean;
  message: Message;
  onReactionMenu(message: Message, clientX: number, clientY: number): void;
}>) {
  if (!visible) return null;
  return <button type="button" className="message-quick-reaction" aria-label="Reagir à mensagem" onClick={(event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onReactionMenu(message, rect.left, rect.bottom + 4);
  }}><SmilePlus size={18} /></button>;
}

type MessageBubbleContentProps = Pick<MessageBubbleProps,
  'message' | 'replyTo' | 'replyFallback' | 'contactName' | 'onJumpToReply' | 'onRetry' | 'retrying' | 'canRetry' | 'onStartSharedContact' | 'onMediaReady' | 'audioPlaybackRate' | 'onCycleAudioPlaybackRate'
> & {
  originalType: string;
  sticker: boolean;
  deleted: boolean;
  messageText: string;
  messageLink?: string;
  sharedContacts: SharedWhatsappContact[];
  location?: WhatsappLocation;
  failure?: MessageFailure;
  reactions: MessageReaction[];
  edited: boolean;
  outbound: boolean;
};

function MessageBubbleContent(props: MessageBubbleContentProps) {
  const { message, replyTo, replyFallback, contactName, originalType, sticker, deleted, messageText, messageLink, sharedContacts, location, failure, reactions, edited, outbound } = props;
  return <>
    {deleted && <div className="message-deleted-notice" role="note" title="Esta mensagem foi apagada"><Trash2 size={13} /><strong>Mensagem apagada</strong></div>}
    {replyTo && <button type="button" className="message-reply-quote" onClick={() => props.onJumpToReply(replyTo.id)} aria-label={`Ir para a mensagem: ${messagePreview(replyTo)}`}><strong>{replyTo.direction === 'OUTBOUND' ? 'Você' : contactName}</strong><span>{messagePreview(replyTo)}</span></button>}
    {!replyTo && replyFallback && <div className="message-reply-quote message-reply-static" role="note"><strong>Mensagem respondida</strong><span>{replyFallback}</span></div>}
    {message.media?.[0] ? <MediaAttachment media={message.media[0]} sticker={sticker} onReady={props.onMediaReady} audioPlaybackRate={props.audioPlaybackRate} onCycleAudioPlaybackRate={props.onCycleAudioPlaybackRate} /> : originalType === 'document' && <span className="message-file"><FileText size={18} />Documento</span>}
    {isAudioMessage(message) && <AudioTranscription message={message} />}
    {sharedContacts.map((contact) => <SharedContactCard key={contact.phone} contact={contact} onStart={() => props.onStartSharedContact(contact)} />)}
    {location && <LocationCard location={location} />}
    {messageLink && <MessageLinkPreview message={message} url={messageLink} onReady={props.onMediaReady} />}
    {messageText && <ExpandableText text={messageText} whatsapp />}
    <small>{edited && <span className="message-edited-label">Editada</span>}{dateTime(message.createdAt).split(' ')[1]} {outbound && <MessageDelivery status={message.status} failure={failure} onRetry={() => props.onRetry(message.id)} retrying={props.retrying} canRetry={props.canRetry} />}</small>
    {reactions.length > 0 && <div className="message-reactions" aria-label="Reações">{reactions.map((reaction, index) => <span key={`${reaction.userId || reaction.userName || 'reaction'}-${index}`} title={reaction.userName || 'Reação'}>{reaction.emoji}</span>)}</div>}
  </>;
}

const MessageBubble = memo(function MessageBubble(props: MessageBubbleProps) {
  const { message, menuOpen, onMenu, onReactionMenu, onReply, canRetry } = props;
  const outbound = message.direction === 'OUTBOUND';
  const failure = message.status === 'FAILED' ? describeMessageFailure(message.payload) : undefined;
  const reactions = messageReactions(message);
  const edited = isMessageEdited(message);
  const deleted = message.type === 'deleted' || message.payload?.deleted === true;
  const originalType = typeof message.payload?.originalType === 'string' ? message.payload.originalType : message.type;
  const originalText = typeof message.payload?.originalText === 'string' ? message.payload.originalText : undefined;
  const sharedContacts = extractSharedWhatsappContacts(message.payload);
  const sharedContactMessage = sharedContacts.length > 0;
  const location = useMemo(() => extractWhatsappLocation(message.payload), [message.payload]);
  const locationMessage = Boolean(location);
  const sticker = originalType === 'sticker';
  const visualMedia = Boolean(message.media?.length) && (originalType === 'image' || originalType === 'video');
  const documentMedia = Boolean(message.media?.length) && originalType === 'document';
  const messageText = messageBubbleText(message, sharedContactMessage, locationMessage, deleted, sticker, originalText);
  const messageLink = deleted ? undefined : firstWhatsappLink(messageText);
  const quickReactionVisible = canRetry && !deleted;
  const bubbleClassName = messageBubbleClassName({ sticker, visualMedia, documentMedia, sharedContactMessage, locationMessage, hasLink: Boolean(messageLink), deleted, failed: message.status === 'FAILED' });
  return <div className={`message-row ${outbound ? 'outbound' : 'inbound'}${menuOpen ? ' menu-open' : ''}`} data-message-id={message.id} data-message-kind={isAudioMessage(message) ? 'audio' : originalType}>
    {outbound && <MessageQuickReaction visible={quickReactionVisible} message={message} onReactionMenu={onReactionMenu} />}
    <article
      className={bubbleClassName}
      aria-label="Mensagem"
      onContextMenu={(event) => { event.preventDefault(); onMenu(message, event.clientX, event.clientY); }}
      onDoubleClick={(event) => {
        if (!canRetry || deleted || (event.target as HTMLElement).closest('button, a, audio, video')) return;
        event.preventDefault();
        onReply(message);
      }}
    >
      <button type="button" className="message-menu-trigger" aria-label="Abrir opções da mensagem" aria-expanded={menuOpen} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(message, rect.right, rect.bottom + 4); }}><ChevronDown size={17} /></button>
      <MessageBubbleContent {...props} originalType={originalType} sticker={sticker} deleted={deleted} messageText={messageText} messageLink={messageLink} sharedContacts={sharedContacts} location={location || undefined} failure={failure} reactions={reactions} edited={edited} outbound={outbound} />
    </article>
    {!outbound && <MessageQuickReaction visible={quickReactionVisible} message={message} onReactionMenu={onReactionMenu} />}
  </div>;
});

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type MessageActionMenuProps = Readonly<{
  menu: MessageMenuState;
  canInteract: boolean;
  reacting: boolean;
  ownReaction?: string;
  onClose(): void;
  onCopy(): void;
  onDownload(): void;
  downloading: boolean;
  onReply(): void;
  onReact(emoji: string): void;
  onEdit(): void;
  onEditHistory(): void;
  onDelete(): void;
}>;

function messageActionTitle(action: 'react' | 'reply' | 'edit' | 'delete', canInteract: boolean, providerReady: boolean, deleted: boolean, textMessage: boolean) {
  if (!canInteract) {
    if (action === 'react') return 'Assuma e abra o atendimento para reagir';
    if (action === 'reply') return 'Assuma e abra o atendimento para responder';
    if (action === 'edit') return 'Assuma e abra o atendimento para editar';
    return 'Assuma e abra o atendimento para apagar';
  }
  if (!providerReady) return 'Aguarde a mensagem ser enviada';
  if (deleted) return 'A mensagem foi apagada';
  if (action === 'edit' && !textMessage) return 'Somente mensagens de texto podem ser editadas';
  return undefined;
}

type MessageMenuCommandsProps = MessageActionMenuProps & {
  audio: boolean;
  audioAvailable: boolean;
  canReference: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hasEditHistory: boolean;
  reactTitle?: string;
  replyTitle?: string;
  editTitle?: string;
  deleteTitle?: string;
  toggleReactions(): void;
};

function MessageMenuCommands(props: MessageMenuCommandsProps) {
  const { menu, audio, audioAvailable, downloading, reacting, canReference, canEdit, canDelete, hasEditHistory } = props;
  const outbound = menu.message.direction === 'OUTBOUND';
  return <>
    {!audio && <button type="button" role="menuitem" onClick={props.onCopy}><Copy size={17} /><span>Copiar mensagem</span></button>}
    {audio && <button type="button" role="menuitem" disabled={!audioAvailable || downloading} title={!audioAvailable ? 'O arquivo deste áudio não está disponível' : undefined} onClick={props.onDownload}><Download size={17} /><span>{downloading ? 'Baixando áudio…' : 'Baixar áudio'}</span></button>}
    <button type="button" role="menuitem" disabled={!canReference || reacting} title={props.reactTitle} onClick={props.toggleReactions}><SmilePlus size={17} /><span>Reagir</span></button>
    <button type="button" role="menuitem" disabled={!canReference} title={props.replyTitle} onClick={props.onReply}><Reply size={17} /><span>Responder</span></button>
    {hasEditHistory && <button type="button" role="menuitem" onClick={props.onEditHistory}><History size={17} /><span>Ver histórico de edições</span></button>}
    {outbound && <button type="button" role="menuitem" disabled={!canEdit} title={props.editTitle} onClick={props.onEdit}><Pencil size={17} /><span>Editar mensagem</span></button>}
    {outbound && <button type="button" role="menuitem" className="danger" disabled={!canDelete} title={props.deleteTitle} onClick={props.onDelete}><Trash2 size={17} /><span>Apagar para todos</span></button>}
  </>;
}

function MessageActionMenu(props: MessageActionMenuProps) {
  const { menu, canInteract, reacting, ownReaction, onClose } = props;
  const [showReactions, setShowReactions] = useState(menu.mode === 'reactions');
  const providerReady = !menu.message.providerMessageId.startsWith('local:') && !['QUEUED', 'PENDING', 'FAILED', 'SKIPPED'].includes(menu.message.status);
  const deleted = menu.message.type === 'deleted' || menu.message.payload?.deleted === true;
  const audioMedia = messageAudioMedia(menu.message);
  const audio = isAudioMessage(menu.message);
  const hasEditHistory = messageEditHistory(menu.message).length > 0;
  const canReference = canInteract && providerReady && !deleted;
  const canEdit = canInteract && providerReady && !deleted && menu.message.type === 'text';
  const canDelete = canInteract && providerReady && !deleted;
  const textMessage = menu.message.type === 'text';
  const commandProps: MessageMenuCommandsProps = {
    ...props,
    audio,
    audioAvailable: Boolean(audioMedia),
    canReference,
    canEdit,
    canDelete,
    hasEditHistory,
    reactTitle: messageActionTitle('react', canInteract, providerReady, deleted, textMessage),
    replyTitle: messageActionTitle('reply', canInteract, providerReady, deleted, textMessage),
    editTitle: messageActionTitle('edit', canInteract, providerReady, deleted, textMessage),
    deleteTitle: messageActionTitle('delete', canInteract, providerReady, deleted, textMessage),
    toggleReactions: () => setShowReactions((current) => !current),
  };
  return <>
    <button type="button" className="message-menu-scrim" onClick={onClose} aria-label="Fechar opções da mensagem" />
    <div className={`message-action-menu${menu.mode === 'reactions' ? ' reaction-only' : ''}`} role="menu" style={{ top: menu.top, left: menu.left }}>
      {showReactions && <div className="message-reaction-picker" aria-label="Escolher reação">{QUICK_REACTIONS.map((emoji) => <button type="button" key={emoji} className={ownReaction === emoji ? 'selected' : ''} disabled={reacting} onClick={() => props.onReact(emoji)} aria-label={`Reagir com ${emoji}`}>{emoji}</button>)}</div>}
      {menu.mode === 'menu' && <MessageMenuCommands {...commandProps} />}
    </div>
  </>;
}

type MessageReaction = { emoji: string; source?: 'me' | 'contact'; userId?: string; userName?: string };

function messageReactions(message: Message): MessageReaction[] {
  const reactions = message.payload?.reactions;
  if (!Array.isArray(reactions)) return [];
  return reactions.filter((item): item is MessageReaction => Boolean(item && typeof item === 'object' && typeof (item as MessageReaction).emoji === 'string'));
}

function messageReplyContext(message: Message) {
  const payload = message.payload as Record<string, any> | undefined;
  const content = payload?.message || payload?.Message || payload;
  return payload?.contextInfo
    || content?.extendedTextMessage?.contextInfo
    || content?.imageMessage?.contextInfo
    || content?.videoMessage?.contextInfo
    || content?.documentMessage?.contextInfo
    || content?.audioMessage?.contextInfo
    || content?.contactMessage?.contextInfo
    || content?.contextInfo;
}

function messageReplyProviderId(message: Message) {
  const payload = message.payload as Record<string, any> | undefined;
  const context = messageReplyContext(message);
  const providerMessageId = payload?.replyToProviderMessageId || context?.stanzaId || context?.key?.id || context?.key?.ID;
  return typeof providerMessageId === 'string' ? providerMessageId : undefined;
}

function messageQuotedPreview(message: Message) {
  const quoted = messageReplyContext(message)?.quotedMessage;
  if (!quoted || typeof quoted !== 'object') return undefined;
  const text = quoted.conversation
    || quoted.extendedTextMessage?.text
    || quoted.imageMessage?.caption
    || quoted.videoMessage?.caption
    || quoted.documentMessage?.caption
    || quoted.contactMessage?.displayName;
  if (typeof text === 'string' && text.trim()) return text.trim();
  if (quoted.imageMessage) return 'Imagem';
  if (quoted.videoMessage) return 'Vídeo';
  if (quoted.audioMessage) return 'Áudio';
  if (quoted.documentMessage) return quoted.documentMessage.fileName || 'Documento';
  if (quoted.stickerMessage) return 'Figurinha';
  if (quoted.locationMessage || quoted.liveLocationMessage) return 'Localização compartilhada';
  return 'Mensagem';
}

function messageReplyTarget(message: Message, messages: Map<string, Message>, messagesByProviderId: Map<string, Message>) {
  const replyToMessageId = message.payload?.replyToMessageId;
  if (typeof replyToMessageId === 'string') {
    const target = messages.get(replyToMessageId);
    if (target) return target;
  }
  const providerMessageId = messageReplyProviderId(message);
  return providerMessageId ? messagesByProviderId.get(providerMessageId) : undefined;
}

function messagePreview(message: Message) {
  const location = extractWhatsappLocation(message.payload);
  if (location) return location.name || location.address || 'Localização compartilhada';
  const sharedContacts = extractSharedWhatsappContacts(message.payload);
  if (sharedContacts.length) return sharedContacts.length === 1
    ? `Contato: ${sharedContacts[0].name}`
    : `${sharedContacts.length} contatos compartilhados`;
  const text = message.text?.trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  const filename = message.media?.[0]?.filename;
  if (filename) return filename;
  const labels: Record<string, string> = { sticker: '🏷️ Figurinha', image: '🖼️ Imagem', audio: '🎧 Áudio', video: '🎥 Vídeo', document: '📄 Documento', deleted: 'Mensagem apagada' };
  return labels[message.type] || `Mensagem ${message.type}`;
}

function messageCopyText(message: Message) {
  const location = extractWhatsappLocation(message.payload);
  if (location) return location.mapsUrl;
  return message.text?.trim() || message.media?.[0]?.filename || messagePreview(message);
}

function messageAudioMedia(message: Message) {
  return message.media?.find((media) => media.contentType.toLowerCase().startsWith('audio/'));
}

function isAudioMessage(message: Message) {
  const originalType = typeof message.payload?.originalType === 'string' ? message.payload.originalType : message.type;
  return originalType === 'audio' || Boolean(messageAudioMedia(message));
}

type AudioTranscriptionData = {
  messageId: string;
  status: string;
  text: string | null;
  error: string | null;
  provider: string | null;
  transcribedAt: string | null;
};

function AudioTranscription({ message }: Readonly<{ message: Message }>) {
  const client = useQueryClient();
  const queryKey = ['message-transcription', message.id] as const;
  const [started, setStarted] = useState(message.transcriptionStatus === 'PROCESSING');
  const [expanded, setExpanded] = useState(Boolean(message.transcriptionText));
  const transcription = useQuery({
    queryKey,
    queryFn: () => api<Envelope<AudioTranscriptionData>>(`/conversations/${message.conversationId}/messages/${message.id}/transcription`),
    enabled: started && Boolean(message.conversationId),
    refetchInterval: (query) => query.state.data?.data.status === 'PROCESSING' ? 1_500 : false,
    refetchIntervalInBackground: false,
  });
  const request = useMutation({
    mutationFn: () => api<Envelope<AudioTranscriptionData>>(`/conversations/${message.conversationId}/messages/${message.id}/transcription`, { method: 'POST' }),
    onSuccess: (result) => {
      client.setQueryData(queryKey, result);
      setStarted(true);
      setExpanded(true);
    },
  });
  const state = transcription.data?.data || {
    messageId: message.id,
    status: message.transcriptionStatus || 'IDLE',
    text: message.transcriptionText || null,
    error: message.transcriptionError || null,
    provider: message.transcriptionProvider || null,
    transcribedAt: message.transcribedAt || null,
  };

  useEffect(() => {
    if (state.status === 'COMPLETED' && state.text) setExpanded(true);
  }, [state.status, state.text]);

  if (!message.conversationId) return null;
  if (state.status === 'PROCESSING' || request.isPending) {
    return <div className="audio-transcription">
      <button type="button" className="audio-transcription-button processing" disabled>
        <Clock size={14} className="spin" />Transcrevendo áudio…
      </button>
    </div>;
  }
  if (state.status === 'COMPLETED' && state.text) {
    return <div className="audio-transcription completed">
      <button type="button" className="audio-transcription-button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        <FileText size={14} />{expanded ? 'Ocultar transcrição' : 'Mostrar transcrição'}
      </button>
      {expanded && <div className="audio-transcription-text"><strong>Transcrição</strong><ExpandableText text={state.text} /></div>}
    </div>;
  }
  return <div className={`audio-transcription${state.status === 'FAILED' ? ' failed' : ''}`}>
    <button type="button" className="audio-transcription-button" disabled={request.isPending} onClick={() => request.mutate()}>
      <FileText size={14} />{state.status === 'FAILED' ? 'Tentar transcrever novamente' : 'Transcrever áudio'}
    </button>
    {state.status === 'FAILED' && state.error && <span className="audio-transcription-error" title={state.error}>{state.error}</span>}
  </div>;
}

function MessageDelivery({ status, failure, onRetry, retrying, canRetry }: Readonly<{ status: string; failure?: MessageFailure; onRetry(): void; retrying: boolean; canRetry: boolean }>) {
  if (status === 'FAILED') return <span className="message-delivery failed"><button type="button" className="message-error-trigger" aria-label={`Erro no envio: ${failure?.summary || 'Motivo não informado'}`}><AlertCircle size={14} /><span className="message-error-tooltip" role="tooltip"><strong>Falha no envio</strong><span>{failure?.summary || 'O provedor não informou o motivo da falha.'}</span>{failure?.detail && failure.detail !== failure.summary && <code>{failure.detail}</code>}</span></button>Falhou{canRetry && <button type="button" onClick={onRetry} disabled={retrying} aria-label="Tentar enviar novamente" title="Tentar enviar novamente"><RotateCcw size={12} className={retrying ? 'spin' : ''} />Tentar novamente</button>}</span>;
  if (status === 'QUEUED' || status === 'PENDING') return <span className="message-delivery pending" title="Aguardando envio"><Clock size={12} />Enviando</span>;
  if (status === 'READ') return <span className="message-delivery read" title="Lida"><CheckCheck size={13} /></span>;
  if (status === 'DELIVERED') return <span className="message-delivery" title="Entregue"><CheckCheck size={13} /></span>;
  return <span className="message-delivery" title="Enviada"><Check size={13} /></span>;
}

function MediaAttachment({ media, sticker = false, onReady, audioPlaybackRate, onCycleAudioPlaybackRate }: Readonly<{ media: NonNullable<Message['media']>[number]; sticker?: boolean; onReady(): void; audioPlaybackRate: number; onCycleAudioPlaybackRate(): void }>) {
  const signed = useQuery({ queryKey: ['media-url', media.id], queryFn: () => api<Envelope<{ url: string }>>(`/media/${media.id}/url`), staleTime: 12 * 60_000 });
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!signed.data?.data.url) return ['image/', 'audio/', 'video/'].some((type) => media.contentType.startsWith(type))
    ? <span className="message-file"><FileText size={18} />{media.filename}</span>
    : <DocumentAttachment media={media} loading />;
  const url = signed.data.data.url;
  if (media.contentType.startsWith('image/')) return <>
    <button type="button" className="message-media-link" onClick={() => setViewerOpen(true)} aria-label={`Abrir ${sticker ? 'figurinha' : 'imagem'} em tamanho ampliado`} title="Abrir imagem"><img className={`message-media${sticker ? ' sticker-media' : ''}`} src={url} alt={sticker ? 'Figurinha' : media.filename} loading="lazy" decoding="async" onLoad={onReady} /></button>
    {viewerOpen && <ImageLightbox url={url} alt={sticker ? 'Figurinha' : media.filename} onClose={() => setViewerOpen(false)} />}
  </>;
  if (media.contentType.startsWith('audio/')) return <AudioAttachment url={url} onReady={onReady} playbackRate={audioPlaybackRate} onCyclePlaybackRate={onCycleAudioPlaybackRate} />;
  if (media.contentType.startsWith('video/')) return <video className="message-media" controls preload="metadata" src={url} onLoadedMetadata={onReady}><track kind="captions" src="data:text/vtt,WEBVTT" srcLang="pt-BR" label="Sem legendas" /></video>;
  return <DocumentAttachment media={media} url={url} />;
}

const AUDIO_PLAYBACK_RATES = [1, 1.5, 2] as const;

function audioPlaybackLabel(rate: number) {
  return `${rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}

function playNextConversationAudio(currentAudio: HTMLAudioElement) {
  const conversationBody = currentAudio.closest('.conversation-body');
  const currentRow = currentAudio.closest<HTMLElement>('.message-row');
  if (!conversationBody || !currentRow) return;
  const messageQueue = [...conversationBody.querySelectorAll<HTMLElement>('.message-row')];
  const currentIndex = messageQueue.indexOf(currentRow);
  const nextRow = messageQueue[currentIndex + 1];
  if (nextRow?.dataset.messageKind !== 'audio') return;
  const nextAudio = nextRow.querySelector<HTMLAudioElement>('audio.message-audio');
  if (!nextAudio) return;
  nextAudio.currentTime = 0;
  void nextAudio.play().catch(() => undefined);
}

function AudioAttachment({ url, onReady, playbackRate, onCyclePlaybackRate }: Readonly<{ url: string; onReady(): void; playbackRate: number; onCyclePlaybackRate(): void }>) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentIndex = AUDIO_PLAYBACK_RATES.indexOf(playbackRate as (typeof AUDIO_PLAYBACK_RATES)[number]);
  const nextRate = AUDIO_PLAYBACK_RATES[(currentIndex + 1) % AUDIO_PLAYBACK_RATES.length];

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.defaultPlaybackRate = playbackRate;
    audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  return <div className="message-audio-player">
    <audio
      ref={audioRef}
      className="message-audio"
      controls
      preload="metadata"
      src={url}
      onEnded={(event) => playNextConversationAudio(event.currentTarget)}
      onLoadedMetadata={(event) => {
        event.currentTarget.defaultPlaybackRate = playbackRate;
        event.currentTarget.playbackRate = playbackRate;
        onReady();
      }}
    ><track kind="captions" src="data:text/vtt,WEBVTT" srcLang="pt-BR" label="Sem legendas" /></audio>
    <button
      type="button"
      className="message-audio-speed"
      onClick={onCyclePlaybackRate}
      aria-label={`Velocidade de reprodução ${audioPlaybackLabel(playbackRate)}. Alterar para ${audioPlaybackLabel(nextRate)}`}
      title={`Velocidade: ${audioPlaybackLabel(playbackRate)}`}
    >
      {audioPlaybackLabel(playbackRate)}
    </button>
  </div>;
}

function documentExtension(media: NonNullable<Message['media']>[number]) {
  const filenameExtension = media.filename.includes('.') ? media.filename.split('.').pop()?.trim() : '';
  if (filenameExtension && filenameExtension.length <= 6) return filenameExtension.toUpperCase();
  const mimeExtension = media.contentType.split('/').pop()?.split(/[;+]/)[0];
  return mimeExtension && mimeExtension.length <= 6 ? mimeExtension.toUpperCase() : 'ARQ';
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'Tamanho indisponível';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function DocumentAttachment({ media, url, loading = false }: Readonly<{ media: NonNullable<Message['media']>[number]; url?: string; loading?: boolean }>) {
  const extension = documentExtension(media);
  const content = <>
    <span className={`message-document-icon${extension === 'PDF' ? ' pdf' : ''}`} aria-hidden="true"><FileText size={24} /><b>{extension}</b></span>
    <span className="message-document-info"><strong title={media.filename}>{media.filename}</strong><small>{extension} <i /> {formatFileSize(media.sizeBytes)}</small></span>
    <span className="message-document-action" aria-hidden="true">{loading ? <Clock size={18} /> : <Download size={18} />}</span>
  </>;
  if (!url) return <span className="message-document loading" aria-label={`Carregando ${media.filename}`} aria-busy="true">{content}</span>;
  return <a className="message-document" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir documento ${media.filename}`} title="Abrir documento">{content}</a>;
}

function ImageLightbox({ url, alt, onClose }: Readonly<{ url: string; alt: string; onClose(): void }>) {
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const onCloseRef = useRef(onClose);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean; captureTarget: HTMLButtonElement } | null>(null);
  const suppressClickRef = useRef(false);
  const availableWidth = Math.max(1, viewport.width - 56);
  const availableHeight = Math.max(1, viewport.height - 56);
  const fitRatio = naturalSize.width && naturalSize.height ? Math.min(1, availableWidth / naturalSize.width, availableHeight / naturalSize.height) : 1;
  const displayWidth = naturalSize.width ? naturalSize.width * fitRatio * zoom : undefined;
  const displayHeight = naturalSize.height ? naturalSize.height * fitRatio * zoom : undefined;

  onCloseRef.current = onClose;
  const changeZoom = (requested: number) => {
    const next = Math.max(1, Math.min(4, Math.round(requested * 4) / 4));
    const stage = stageRef.current;
    const current = zoomRef.current;
    if (next === current) return;
    const centerX = stage ? (stage.scrollLeft + stage.clientWidth / 2) / Math.max(stage.scrollWidth, 1) : .5;
    const centerY = stage ? (stage.scrollTop + stage.clientHeight / 2) / Math.max(stage.scrollHeight, 1) : .5;
    zoomRef.current = next;
    setZoom(next);
    requestAnimationFrame(() => {
      if (!stage) return;
      stage.scrollLeft = centerX * stage.scrollWidth - stage.clientWidth / 2;
      stage.scrollTop = centerY * stage.scrollHeight - stage.clientHeight / 2;
    });
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === '+' || event.key === '=') changeZoom(zoomRef.current + 0.25);
      if (event.key === '-') changeZoom(zoomRef.current - 0.25);
      if (event.key === '0') changeZoom(1);
      const movement: Record<string, [number, number]> = { ArrowUp: [0, -90], ArrowDown: [0, 90], ArrowLeft: [-90, 0], ArrowRight: [90, 0] };
      if (movement[event.key] && zoomRef.current > 1) {
        event.preventDefault();
        stageRef.current?.scrollBy({ left: movement[event.key][0], top: movement[event.key][1], behavior: 'smooth' });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setViewport({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const beginPan = (event: React.PointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current;
    if (!stage || zoomRef.current <= 1 || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop, moved: false, captureTarget: event.currentTarget };
    setDragging(true);
  };
  const movePan = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      drag.moved = true;
      if (!drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.setPointerCapture(event.pointerId);
    }
    stage.scrollLeft = drag.scrollLeft - deltaX;
    stage.scrollTop = drag.scrollTop - deltaY;
    event.preventDefault();
  };
  const endPan = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    if (drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  return createPortal(<dialog
    open
    className="image-lightbox"
    aria-label={`Visualização ampliada de ${alt}`}
    style={{ margin: 0, padding: 0, border: 0 }}
  >
    <header className="image-lightbox-toolbar">
      <strong title={alt}>{alt}</strong>
      <div>
        <button type="button" onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Diminuir zoom" title="Diminuir zoom"><ZoomOut size={19} /></button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= 4} aria-label="Aumentar zoom" title="Aumentar zoom"><ZoomIn size={19} /></button>
        <button type="button" onClick={() => changeZoom(1)} disabled={zoom === 1} aria-label="Restaurar zoom" title="Restaurar zoom"><RotateCcw size={18} /></button>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar imagem" title="Fechar"><X size={22} /></button>
      </div>
    </header>
    <div
      ref={stageRef}
      className={`image-lightbox-stage${zoom > 1 ? ' zoomed' : ''}${dragging ? ' dragging' : ''}`}
    >
      <div className="image-lightbox-canvas" style={{ position: 'relative' }}>
        <button
          type="button"
          aria-label="Fechar visualização da imagem"
          onClick={onClose}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, background: 'transparent' }}
        />
        <button
          type="button"
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={(event) => {
            event.preventDefault();
            changeZoom(zoomRef.current + (event.deltaY < 0 ? 0.25 : -0.25));
          }}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            changeZoom(zoomRef.current === 1 ? 2 : 1);
          }}
          title={zoom === 1 ? 'Clique para ampliar' : 'Arraste para mover ou clique para restaurar'}
          style={{ position: 'relative', zIndex: 1, display: 'block', border: 0, padding: 0, background: 'transparent' }}
        >
          <img
            src={url}
            alt={alt}
            draggable={false}
            style={{ width: displayWidth, height: displayHeight }}
            onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        </button>
      </div>
    </div>
  </dialog>, document.body);
}

type TimelineItem = ({ kind: 'message'; message: Message } | { kind: 'event'; event: ConversationEvent }) & { createdAt: string; timestamp: number };

const timelineDateFormatter = new Intl.DateTimeFormat('pt-BR');

function groupTimeline(messages: Message[], events: ConversationEvent[]) {
  const timeline: TimelineItem[] = [
    ...messages.map((message) => ({ kind: 'message' as const, message, createdAt: message.createdAt, timestamp: Date.parse(message.createdAt) })),
    ...events.map((event) => ({ kind: 'event' as const, event, createdAt: event.createdAt, timestamp: Date.parse(event.createdAt) })),
  ].sort((left, right) => left.timestamp - right.timestamp);
  const map = new Map<string, TimelineItem[]>();
  for (const item of timeline) {
    const date = timelineDateFormatter.format(new Date(item.timestamp));
    const items = map.get(date);
    if (items) items.push(item);
    else map.set(date, [item]);
  }
  const today = timelineDateFormatter.format(new Date());
  return [...map.entries()].map(([date, items]) => ({ date, label: date === today ? 'Hoje' : date, items }));
}
