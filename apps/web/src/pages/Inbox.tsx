import { lazy, memo, Suspense, type FormEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Archive, ArrowRightLeft, BriefcaseBusiness, Building2, Check, CheckCheck, ChevronDown, Copy, Clock, Download, Eye, FileText, Filter, History, Inbox, Mail, MessageCircle, Mic, MoreHorizontal, Pause, Pencil, Phone, Play, Plus, Reply, RotateCcw, Search, Send, ShieldCheck, Smile, SmilePlus, Tags, Trash2, Upload, UserCheck, UserPlus, UserRound, UsersRound, Workflow, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api, apiErrorMessage, apiUrl, dateTime, formatPhone, initials, type Envelope } from '../lib/api';
import { describeMessageFailure, type MessageFailure } from '../lib/message-error';
import type { Company, Contact, Conversation, ConversationEvent, Message, Opportunity, Pipeline } from '../lib/types';
import { Button, Empty, Field, Modal, PageLoading, SelectField } from '../components/ui';
import { ContactModal } from '../components/ContactModal';
import { WhatsappComposer, WhatsappText, type WhatsappComposerHandle } from '../components/WhatsappText';
import { useAuth } from '../App';
import { useRealtimeConnected } from '../lib/realtime';
import { useDebouncedValue } from '../lib/useDebouncedValue';

type WhatsappInstance = { id: string; name: string; phone?: string; status: string };
type ConversationHistoryPage = { messages: Message[]; events: ConversationEvent[]; nextCursor: string | null };
type ConversationAssignee = { id: string; name: string; email: string; team?: { id: string; name: string; color: string } };
type WorkflowShortcut = { id: string; name: string; description?: string; status: string; publishedVersion?: number };
type WorkflowEnrollmentResult = { requested: number; enrolled: number; skipped: number };
type ContactInlineField = 'phone' | 'email' | 'companyId';

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

type InboxFilter = 'waiting' | 'open' | 'closed';

function inboxFilterForStatus(status: string): InboxFilter {
  return status === 'CLOSED' ? 'closed' : status === 'WAITING' ? 'waiting' : 'open';
}

function awaitsRecoveredCaption(message: Message) {
  if (message.text || !message.media?.length || !['image', 'video', 'document'].includes(message.type)) return false;
  if (message.payload?.captionCompanionProviderMessageId || message.payload?.recoveredCaption) return false;
  const age = Date.now() - new Date(message.createdAt).getTime();
  return age >= 0 && age < 2 * 60_000;
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
  const [statusError, setStatusError] = useState('');
  const [startingConversation, setStartingConversation] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const view = isAdmin && showAll ? 'all' : 'mine';
  const conversations = useQuery({ queryKey: ['conversations', filter, view], queryFn: () => api<Envelope<Conversation[]>>(`/conversations?status=${filter}&view=${view}`), refetchInterval: realtimeConnected ? false : 15_000 });
  const counts = useQuery({ queryKey: ['conversation-counts', view], queryFn: () => api<Envelope<{ waiting: number; open: number; closed: number }>>(`/conversations/counts?view=${view}`), refetchInterval: realtimeConnected ? false : 15_000 });
  const selectedId = conversationId || conversations.data?.data[0]?.id;
  const conversation = useQuery({ queryKey: ['conversation', selectedId], queryFn: () => api<Envelope<Conversation>>(`/conversations/${selectedId}`), enabled: Boolean(selectedId), refetchInterval: realtimeConnected ? false : 10_000 });
  const history = useInfiniteQuery({
    queryKey: ['conversation-messages', selectedId],
    queryFn: ({ pageParam }) => api<Envelope<ConversationHistoryPage>>(`/conversations/${selectedId}/messages?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
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
  useEffect(() => { if (!conversationId && selectedId) navigate(`/inbox/${selectedId}`, { replace: true }); }, [conversationId, selectedId, navigate]);
  useEffect(() => {
    if (selectedId && (conversation.data?.data.unreadCount || 0) > 0 && !markRead.isPending) markRead.mutate(selectedId);
  }, [selectedId, conversation.data?.data.unreadCount, markRead.isPending]);
  useEffect(() => {
    if (!conversationId || !conversation.data?.data.status) return;
    const currentStatus = conversation.data.data.status.toLowerCase() as 'waiting' | 'open' | 'closed';
    setFilter(currentStatus);
  }, [conversationId, conversation.data?.data.status]);
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
    mutationFn: (value: string) => api<Envelope<Conversation>>(`/conversations/${selectedId}/status`, { method: 'PATCH', body: JSON.stringify({ status: value }) }),
    onMutate: async (value) => {
      const current = conversation.data?.data;
      if (!current || !selectedId) return;
      setStatusError('');
      await Promise.all([
        client.cancelQueries({ queryKey: ['conversation', selectedId] }),
        client.cancelQueries({ queryKey: ['conversations'] }),
        client.cancelQueries({ queryKey: ['conversation-counts'] }),
      ]);
      const previousFilter = filter;
      const targetStatus = value === 'CLOSED' ? 'CLOSED' : current.assignee ? 'OPEN' : 'WAITING';
      const targetFilter = inboxFilterForStatus(targetStatus);
      const sourceKey = ['conversations', previousFilter, view] as const;
      const targetKey = ['conversations', targetFilter, view] as const;
      const conversationKey = ['conversation', selectedId] as const;
      const countsKey = ['conversation-counts', view] as const;
      const previousConversation = client.getQueryData<Envelope<Conversation>>(conversationKey);
      const previousSource = client.getQueryData<Envelope<Conversation[]>>(sourceKey);
      const previousTarget = client.getQueryData<Envelope<Conversation[]>>(targetKey);
      const previousCounts = client.getQueryData<Envelope<{ waiting: number; open: number; closed: number }>>(countsKey);
      const optimistic = { ...current, status: targetStatus };

      client.setQueryData<Envelope<Conversation>>(conversationKey, (cached) => cached ? { ...cached, data: { ...cached.data, status: targetStatus } } : { data: optimistic });
      client.setQueryData<Envelope<Conversation[]>>(sourceKey, (cached) => cached ? { ...cached, data: cached.data.filter((item) => item.id !== selectedId) } : { data: [] });
      client.setQueryData<Envelope<Conversation[]>>(targetKey, (cached) => ({
        ...(cached || { data: [] }),
        data: uniqueById([optimistic, ...(cached?.data || []).filter((item) => item.id !== selectedId)]),
      }));
      client.setQueryData<Envelope<{ waiting: number; open: number; closed: number }>>(countsKey, (cached) => {
        if (!cached || previousFilter === targetFilter) return cached;
        return { ...cached, data: {
          ...cached.data,
          [previousFilter]: Math.max(0, cached.data[previousFilter] - 1),
          [targetFilter]: cached.data[targetFilter] + 1,
        } };
      });
      setFilter(targetFilter);
      return { previousFilter, sourceKey, targetKey, conversationKey, countsKey, previousConversation, previousSource, previousTarget, previousCounts };
    },
    onSuccess: (response) => {
      const targetFilter = inboxFilterForStatus(response.data.status);
      const cachedConversation = client.getQueryData<Envelope<Conversation>>(['conversation', response.data.id]);
      const reconciled = cachedConversation ? { ...cachedConversation.data, ...response.data } : response.data;
      client.setQueryData<Envelope<Conversation>>(['conversation', response.data.id], (cached) => cached ? { ...cached, data: reconciled } : { data: reconciled });
      client.setQueryData<Envelope<Conversation[]>>(['conversations', targetFilter, view], (cached) => ({
        ...(cached || { data: [] }),
        data: uniqueById([reconciled, ...(cached?.data || []).filter((item) => item.id !== response.data.id)]),
      }));
    },
    onError: (error, _value, context) => {
      if (context) {
        if (context.previousConversation) client.setQueryData(context.conversationKey, context.previousConversation);
        else client.removeQueries({ queryKey: context.conversationKey, exact: true });
        if (context.previousSource) client.setQueryData(context.sourceKey, context.previousSource);
        else client.removeQueries({ queryKey: context.sourceKey, exact: true });
        if (context.previousTarget) client.setQueryData(context.targetKey, context.previousTarget);
        else client.removeQueries({ queryKey: context.targetKey, exact: true });
        if (context.previousCounts) client.setQueryData(context.countsKey, context.previousCounts);
        else client.removeQueries({ queryKey: context.countsKey, exact: true });
        setFilter(context.previousFilter);
      }
      setStatusError(apiErrorMessage(error, 'Não foi possível atualizar o atendimento'));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['conversations'], refetchType: 'active' });
      void client.invalidateQueries({ queryKey: ['conversation-counts'], refetchType: 'active' });
      void client.invalidateQueries({ queryKey: ['conversation', selectedId], refetchType: 'active' });
      void client.invalidateQueries({ queryKey: ['conversation-messages', selectedId], refetchType: 'active' });
    },
  });
  useEffect(() => {
    if (!statusError) return;
    const timer = window.setTimeout(() => setStatusError(''), 4200);
    return () => window.clearTimeout(timer);
  }, [statusError]);
  const changeFilter = (next: InboxFilter) => {
    setFilter(next);
    navigate('/inbox', { replace: true });
  };
  const toggleAll = () => {
    setShowAll((current) => !current);
    navigate('/inbox', { replace: true });
  };
  if (conversations.isLoading) return <PageLoading />;
  const emptyText = filter === 'waiting'
    ? ['Nenhum ticket aguardando atendimento', 'Novas mensagens sem atendente aparecerão nesta fila.']
    : filter === 'open'
      ? ['Nenhum ticket em atendimento', 'As conversas aparecem aqui depois que um atendente assumir.']
      : ['Nenhum ticket encerrado', 'Atendimentos finalizados ficarão guardados aqui.'];
  return <div className="inbox-layout">
    <aside className="conversation-sidebar">
      <div className="conversation-sidebar-heading"><strong>Conversas</strong><div className="conversation-sidebar-actions">{isAdmin && <button className={`icon-button conversation-view-all${showAll ? ' active' : ''}`} onClick={toggleAll} aria-label={showAll ? 'Mostrar somente meus atendimentos' : 'Visualizar todos os atendimentos'} title={showAll ? 'Mostrar somente meus atendimentos' : 'Visualizar todos os atendimentos'}><Eye size={16} /></button>}<Button onClick={() => setStartingConversation(true)}><Plus size={14} />Nova conversa</Button></div></div>
      <div className="inbox-tabs">
        <button className={filter === 'waiting' ? 'active' : ''} onClick={() => changeFilter('waiting')}>Aguardando <span>{counts.data?.data.waiting || 0}</span></button>
        <button className={filter === 'open' ? 'active' : ''} onClick={() => changeFilter('open')}>Abertas <span>{counts.data?.data.open || 0}</span></button>
        <button className={filter === 'closed' ? 'active' : ''} onClick={() => changeFilter('closed')}>Encerradas <span>{counts.data?.data.closed || 0}</span></button>
      </div>
      <div className="conversation-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa…" /><button aria-label="Filtrar conversas"><Filter size={14} /></button></div>
      <div className="conversation-list">{shown.map((item) => <button key={item.id} className={item.id === selectedId ? 'active' : ''} onClick={() => navigate(`/inbox/${item.id}`)}><WhatsappAvatar conversationId={item.id} name={item.contact.name} /><div><div><strong>{item.contact.name}</strong><time>{item.lastMessageAt ? dateTime(item.lastMessageAt).split(' ')[1] : ''}</time></div><p>{item.messages[0]?.text || 'Mídia ou nova conversa'}</p><small>{item.instance.name}{item.assignee ? ` · ${item.assignee.name}` : ' · Aguardando atendente'}</small></div>{item.unreadCount > 0 && <b>{item.unreadCount}</b>}</button>)}</div>
    </aside>
    {selectedId && (conversation.isLoading || history.isLoading)
      ? <PageLoading />
      : selectedConversation
        ? <ConversationView
            key={selectedConversation.id}
            conversation={selectedConversation}
            hasOlderMessages={Boolean(history.hasNextPage)}
            loadingOlderMessages={history.isFetchingNextPage}
            onLoadOlderMessages={async () => {
              const result = await history.fetchNextPage();
              if (result.isError) throw result.error;
            }}
            onSend={invalidate}
            onAssign={() => assign.mutate(selectedConversation.assignee?.id ? null : 'self')}
            onTransfer={async (assigneeId) => {
              const response = await api<Envelope<Conversation>>(`/conversations/${selectedConversation.id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) });
              if (!isAdmin && assigneeId !== user?.userId) {
                setFilter('open');
                navigate('/inbox', { replace: true });
                invalidate();
                return;
              }
              moveToConversationStatus(response.data);
            }}
            statusChanging={status.isPending}
            onClose={() => { if (!status.isPending) status.mutate(selectedConversation.status === 'CLOSED' ? 'OPEN' : 'CLOSED'); }}
          />
        : <div className="conversation-empty"><Empty icon={<Inbox />} title={emptyText[0]} description={emptyText[1]} /></div>}
    {startingConversation && <NewConversationModal onClose={() => setStartingConversation(false)} onStarted={(id) => {
      setStartingConversation(false);
      setFilter('open');
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: ['conversation-counts'] });
      navigate(`/inbox/${id}`);
    }} />}
    {statusError && createPortal(<div className="message-action-toast error" role="alert">{statusError}</div>, document.body)}
  </div>;
}

function NewConversationModal({ onClose, onStarted }: { onClose(): void; onStarted(id: string): void }) {
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
    onSuccess: (result) => onStarted(result.data.id),
  });
  const selectedContact = contacts.data?.data.find((contact) => contact.id === contactId);
  return <Modal title="Nova conversa" onClose={onClose} width={620}>
    <form className="new-conversation-form" onSubmit={(event) => { event.preventDefault(); if (contactId && instanceId) start.mutate(); }}>
      <label className="conversation-contact-search"><span>Selecionar contato</span><div><Search size={16} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail…" /></div></label>
      <div className="conversation-contact-list">
        {contacts.isLoading ? <PageLoading /> : contacts.error ? <div className="form-error">{contacts.error.message}</div> : contacts.data?.data.length ? contacts.data.data.map((contact) => <button type="button" key={contact.id} className={contact.id === contactId ? 'selected' : ''} disabled={!contact.phone} onClick={() => setContactId(contact.id)}>
          <span className="contact-avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong><small>{formatPhone(contact.phone) || 'Sem telefone'}{contact.email ? ` · ${contact.email}` : ''}</small></div>{contact.id === contactId && <Check size={17} />}
        </button>) : <div className="conversation-contact-empty"><strong>Nenhum contato encontrado</strong><span>Tente buscar usando outro nome, telefone ou e-mail.</span></div>}
      </div>
      {selectedContact && <div className="conversation-selected-contact"><Check size={15} /><span><strong>{selectedContact.name}</strong> será aberto em um novo ticket.</span></div>}
      {instances.isLoading ? <PageLoading /> : instances.data?.data.length ? <SelectField label="Número do WhatsApp" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>{instances.data.data.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${instance.phone}` : ''}</option>)}</SelectField> : <div className="form-error">Nenhuma conexão do WhatsApp está ativa.</div>}
      {start.error && <div className="form-error">{start.error.message}</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={start.isPending} disabled={!contactId || !instanceId}><MessageCircle size={16} />Abrir ticket</Button></div>
    </form>
  </Modal>;
}

function ContactOpportunityModal({ contact, onClose, onCreated }: { contact: Contact; onClose(): void; onCreated(): void }) {
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
      {pipelines.isError && <div className="form-error">Não foi possível carregar os funis disponíveis.</div>}
      {!pipelines.isError && !pipelines.data?.data.length && <div className="form-error">Nenhum funil está configurado.</div>}
      {create.error && <div className="form-error">{create.error.message}</div>}
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

function ConversationView({ conversation, hasOlderMessages, loadingOlderMessages, statusChanging, onLoadOlderMessages, onSend, onAssign, onTransfer, onClose }: {
  conversation: Conversation;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  statusChanging: boolean;
  onLoadOlderMessages(): Promise<void>;
  onSend(): void;
  onAssign(): void;
  onTransfer(assigneeId: string): Promise<void>;
  onClose(): void;
}) {
  const { user, refresh } = useAuth();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [conversationMenu, setConversationMenu] = useState<{ top: number; left: number } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [downloadingMediaId, setDownloadingMediaId] = useState<string | null>(null);
  const [signatureEnabled, setSignatureEnabled] = useState(Boolean(user?.messageSignatureEnabled));
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [automationMenuOpen, setAutomationMenuOpen] = useState(false);
  const [automationIndex, setAutomationIndex] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [draggingAttachment, setDraggingAttachment] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceLevels, setVoiceLevels] = useState(EMPTY_VOICE_LEVELS);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState<number>(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<WhatsappComposerHandle>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
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
  const newestMessageId = conversation.messages.at(-1)?.id;
  const newestEventId = conversation.events?.at(-1)?.id;
  const canReply = conversation.status === 'OPEN' && Boolean(conversation.assignee);
  const canStartAutomations = Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === 'workflows') && (permission.action === '*' || permission.action === 'write')));
  const canCreateOpportunity = Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === 'opportunities') && (permission.action === '*' || permission.action === 'write')));
  const workflows = useQuery({
    queryKey: ['workflow-shortcuts'],
    queryFn: () => api<Envelope<WorkflowShortcut[]>>('/workflows'),
    enabled: automationMenuOpen && canStartAutomations,
    staleTime: 60_000,
  });
  const automationSearch = text.startsWith('/') ? text.slice(1).trim().toLocaleLowerCase('pt-BR') : '';
  const workflowOptions = useMemo(() => (workflows.data?.data || []).filter((workflow) => {
    if (workflow.status !== 'PUBLISHED' || !workflow.publishedVersion) return false;
    if (!automationSearch) return true;
    return `${workflow.name} ${workflow.description || ''}`.toLocaleLowerCase('pt-BR').includes(automationSearch);
  }), [workflows.data, automationSearch]);
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
    onError: (error) => setActionError(apiErrorMessage(error, 'Não foi possível iniciar a automação')),
  });
  const send = useMutation({
    mutationFn: async (draft: OutgoingDraft) => {
      if (!draft.file) return api(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ type: 'text', text: draft.text, replyToMessageId: draft.replyToMessageId, signatureEnabled: draft.signatureEnabled }) });
      const uploadContentType = draft.file.type.toLowerCase().split(';', 1)[0].trim();
      const created = await api<Envelope<{ key: string; uploadUrl: string }>>('/media/uploads', { method: 'POST', body: JSON.stringify({ filename: draft.file.name, contentType: uploadContentType, sizeBytes: draft.file.size }) });
      const uploaded = await fetch(created.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': uploadContentType }, body: draft.file });
      if (!uploaded.ok) throw new Error('Não foi possível enviar o arquivo');
      const type = draft.file.type.startsWith('image/') ? 'image' : draft.file.type.startsWith('audio/') ? 'audio' : draft.file.type.startsWith('video/') ? 'video' : 'document';
      return api(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ type, text: draft.text || undefined, mediaKey: created.data.key, replyToMessageId: draft.replyToMessageId, signatureEnabled: draft.signatureEnabled }) });
    },
    onSuccess: () => { setText(''); setFile(null); setAttachmentError(''); setReplyingTo(null); onSend(); },
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
  const exportPdf = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiUrl(`/conversations/${conversation.id}/export/pdf`), { credentials: 'include' });
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
      setActionNotice('Conversa exportada em PDF');
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Não foi possível exportar a conversa'),
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
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);
  useEffect(() => {
    if (!actionError) return;
    const timer = window.setTimeout(() => setActionError(''), 4200);
    return () => window.clearTimeout(timer);
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
      setAttachmentError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Permita o acesso ao microfone para gravar mensagens de voz.'
        : name === 'NotFoundError'
          ? 'Nenhum microfone foi encontrado neste dispositivo.'
          : 'Não foi possível iniciar a gravação de áudio.');
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
  const handleAutomationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (emojiPickerOpen && event.key === 'Escape') {
      setEmojiPickerOpen(false);
      return true;
    }
    if (!automationMenuOpen) return false;
    if (event.key === 'Escape') {
      setAutomationMenuOpen(false);
      return true;
    }
    if (event.key === 'ArrowDown') {
      setAutomationIndex((current) => workflowOptions.length ? (current + 1) % workflowOptions.length : 0);
      return true;
    }
    if (event.key === 'ArrowUp') {
      setAutomationIndex((current) => workflowOptions.length ? (current - 1 + workflowOptions.length) % workflowOptions.length : 0);
      return true;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const workflow = workflowOptions[automationIndex];
      if (workflow) selectWorkflow(workflow);
      return true;
    }
    return false;
  };
  const submitCurrentMessage = () => {
    if (!canReply) return;
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
    const height = mode === 'reactions' ? 54 : message.direction === 'OUTBOUND' ? 274 : 188;
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
    void target.offsetWidth;
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
      const currentIndex = AUDIO_PLAYBACK_RATES.findIndex((rate) => rate === current);
      return AUDIO_PLAYBACK_RATES[(currentIndex + 1) % AUDIO_PLAYBACK_RATES.length];
    });
  }, []);
  const copyMessage = async (message: Message) => {
    const value = messageCopyText(message);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
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
  const composerPlaceholder = conversation.status === 'CLOSED' ? 'Reabra a conversa para responder' : !canReply ? 'Assuma a conversa para responder' : editingMessage ? 'Edite sua mensagem…' : file ? 'Adicione uma legenda…' : 'Escreva uma mensagem ou cole uma imagem…';

  return <section className="conversation-view" onDragEnter={handleAttachmentDragEnter} onDragOver={handleAttachmentDragOver} onDragLeave={handleAttachmentDragLeave} onDrop={handleAttachmentDrop}>
    {draggingAttachment && <div className={`conversation-file-drop${canReply && !editingMessage ? '' : ' unavailable'}`} aria-hidden="true"><div><span><Upload size={28} /></span><strong>{canReply && !editingMessage ? 'Solte o arquivo para anexar' : editingMessage ? 'Conclua a edição para anexar' : 'Assuma a conversa para anexar'}</strong><small>{canReply && !editingMessage ? 'Imagens, vídeos, áudios e documentos de até 25 MB' : 'O envio de arquivos está indisponível neste momento'}</small></div></div>}
    <header className="conversation-header">
      <button type="button" className="conversation-person conversation-person-button" onClick={() => setContactOpen(true)} aria-label={`Ver informações de ${conversation.contact.name}`}>
        <WhatsappAvatar conversationId={conversation.id} name={conversation.contact.name} large />
        <div><strong>{conversation.contact.name}</strong><span><i /> {formatPhone(conversation.contact.phone) || 'Sem telefone'} · {conversation.instance.name}</span></div>
      </button>
      <div className="conversation-actions">
        <button type="button" className="button button-secondary" onClick={onAssign} disabled={conversation.status === 'CLOSED'} title={conversation.status === 'CLOSED' ? 'Reabra a conversa para alterar o responsável' : undefined}>{conversation.assignee ? <><UserCheck size={15} />{conversation.assignee.name}</> : <><UserPlus size={15} />Assumir</>}</button>
        <button type="button" className={`conversation-status-button ${conversation.status === 'CLOSED' ? 'reopen' : 'finish'}`} onClick={onClose} disabled={statusChanging} aria-busy={statusChanging} title={statusChanging ? 'Atualizando atendimento em segundo plano' : conversation.status === 'CLOSED' ? 'Reabrir atendimento' : 'Finalizar atendimento'} aria-label={conversation.status === 'CLOSED' ? 'Reabrir atendimento' : 'Finalizar atendimento'}>{conversation.status === 'CLOSED' ? <><RotateCcw size={16} /><span>Reabrir</span></> : <><Archive size={16} /><span>Finalizar</span></>}</button>
        <button type="button" className="icon-button" onClick={openConversationMenu} aria-label="Mais ações da conversa" aria-expanded={Boolean(conversationMenu)} title="Mais ações"><MoreHorizontal size={18} /></button>
      </div>
    </header>
    <div ref={bodyRef} className="conversation-body" onScroll={updateScrollPosition}>
      <div className="conversation-history-loader">
        {loadingOlderMessages
          ? <span><i />Carregando mensagens anterioresâ€¦</span>
          : hasOlderMessages
            ? <button type="button" onClick={() => void requestOlderMessages()}><History size={14} />Carregar mensagens anteriores</button>
            : conversation.messages.length > 0 && <span>InÃ­cio da conversa</span>}
      </div>
      {grouped.map((group) => <div className="message-day" key={group.date}><span>{group.label}</span>{group.items.map((item) => item.kind === 'event'
        ? <ConversationEventLog key={`event-${item.event.id}`} event={item.event} />
        : <MessageBubble
            key={item.message.id}
            message={item.message}
            replyTo={messageReplyTarget(item.message, messagesById)}
            contactName={conversation.contact.name}
            menuOpen={messageMenu?.message.id === item.message.id}
            onMenu={openMessageMenu}
            onReactionMenu={openReactionMenu}
            onJumpToReply={jumpToMessage}
            onReply={startReply}
            onRetry={retryMessage}
            retrying={retry.isPending && retry.variables === item.message.id}
            canRetry={canReply}
            onMediaReady={keepLatestVisible}
            audioPlaybackRate={audioPlaybackRate}
            onCycleAudioPlaybackRate={cycleAudioPlaybackRate}
          />)}</div>)}
    </div>
    {showScrollToLatest && <button type="button" className="scroll-to-latest" onClick={scrollToLatest} aria-label="Ir para a mensagem mais recente" title="Ir para a mensagem mais recente"><ChevronDown size={21} /></button>}
    <form className={`composer ${canReply ? '' : 'locked'}`} onSubmit={submit}>
      <label className={`composer-signature${signatureEnabled ? ' active' : ''}${signaturePreference.isPending ? ' saving' : ''}`} title="Assinatura"><Pencil size={16} /><input type="checkbox" checked={signatureEnabled} disabled={signaturePreference.isPending || recordingStatus !== 'idle'} onChange={(event) => signaturePreference.mutate(event.target.checked)} aria-label="Ativar assinatura nas mensagens" /></label>
      <div className="composer-shell">
        {recordingStatus !== 'idle' ? <div className={`voice-recorder ${recordingStatus}`} role="group" aria-label="Gravador de mensagem de voz">
          <button type="button" className="voice-recorder-delete" onClick={discardActiveRecording} disabled={recordingStatus === 'finishing'} aria-label="Cancelar gravação" title="Cancelar gravação"><Trash2 size={20} /></button>
          <span className="voice-recorder-time" aria-label={`Duração ${voiceDuration(recordingSeconds)}`}><i />{recordingStatus === 'requesting' ? 'Microfone…' : voiceDuration(recordingSeconds)}</span>
          <div className="voice-recorder-waveform" aria-hidden="true">{voiceLevels.map((level, index) => <i key={index} style={{ height: `${Math.round(5 + level * 23)}px` }} />)}</div>
          <button type="button" className="voice-recorder-pause" onClick={toggleRecordingPause} disabled={recordingStatus === 'requesting' || recordingStatus === 'finishing'} aria-label={recordingStatus === 'paused' ? 'Retomar gravação' : 'Pausar gravação'} title={recordingStatus === 'paused' ? 'Retomar gravação' : 'Pausar gravação'}>{recordingStatus === 'paused' ? <Play size={20} /> : <Pause size={20} />}</button>
          <button type="button" className="voice-recorder-send" onClick={finishVoiceRecording} disabled={recordingStatus === 'requesting' || recordingStatus === 'finishing'} aria-label="Enviar áudio" title="Enviar áudio">{recordingStatus === 'finishing' ? <Clock className="spin" size={19} /> : <Send size={19} />}</button>
        </div> : <>
        {emojiPickerOpen && <div ref={emojiPickerRef} className="composer-emoji-picker" role="dialog" aria-label="Selecionar emoji">
          <header><strong>Emojis</strong><button type="button" onClick={() => setEmojiPickerOpen(false)} aria-label="Fechar emojis"><X size={16} /></button></header>
          <Suspense fallback={<div className="composer-emoji-loading"><i />Carregando emojis…</div>}>
            <EmojiPickerPopover onEmojiSelect={(emoji) => { textRef.current?.insertText(emoji); setAttachmentError(''); }} />
          </Suspense>
        </div>}
        <div className="composer-capsule">
          <div className="composer-tools"><input ref={fileRef} hidden type="file" accept="image/*,audio/*,video/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onChange={(event) => { attachFile(event.target.files?.[0] || null); event.currentTarget.value = ''; }} /><button type="button" disabled={!canReply || Boolean(editingMessage)} onClick={() => fileRef.current?.click()} title="Anexar arquivo" aria-label="Anexar arquivo"><Plus size={22} /></button><button ref={emojiButtonRef} type="button" disabled={!canReply} onMouseDown={(event) => event.preventDefault()} onClick={() => { setEmojiPickerOpen((current) => !current); setAutomationMenuOpen(false); textRef.current?.focus(); }} title="Emojis" aria-label="Emojis" aria-haspopup="dialog" aria-expanded={emojiPickerOpen}><Smile size={20} /></button></div>
          <div className="composer-input">
        {automationMenuOpen && <div className="automation-command-menu" role="listbox" aria-label="Automações disponíveis">
          <div className="automation-command-heading"><span><Workflow size={17} /></span><div><strong>Iniciar automação</strong><small>Continue digitando para filtrar</small></div><kbd>Esc</kbd></div>
          <div className="automation-command-options">
            {!canStartAutomations
              ? <div className="automation-command-empty"><ShieldCheck size={17} /><span>Você não tem permissão para iniciar automações.</span></div>
              : workflows.isLoading
                ? <div className="automation-command-empty"><i />Carregando automações…</div>
                : workflows.isError
                  ? <div className="automation-command-empty error"><AlertCircle size={17} />Não foi possível carregar as automações.</div>
                  : workflowOptions.length
                    ? workflowOptions.map((workflow, index) => <button
                        type="button"
                        role="option"
                        aria-selected={index === automationIndex}
                        className={index === automationIndex ? 'selected' : ''}
                        key={workflow.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setAutomationIndex(index)}
                        onClick={() => selectWorkflow(workflow)}
                        disabled={startWorkflow.isPending}
                      ><span><Workflow size={16} /></span><div><strong>{workflow.name}</strong><small>{workflow.description || `Versão ${workflow.publishedVersion}`}</small></div>{startWorkflow.isPending && startWorkflow.variables?.id === workflow.id ? <i /> : <ChevronDown size={15} />}</button>)
                    : <div className="automation-command-empty"><Workflow size={17} /><span>{automationSearch ? 'Nenhuma automação corresponde à busca.' : 'Nenhuma automação publicada disponível.'}</span></div>}
          </div>
          <div className="automation-command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> iniciar</span></div>
        </div>}
        {editingMessage && <div className="composer-reply composer-edit"><Pencil size={16} /><div><strong>Editando mensagem</strong><span>{messagePreview(editingMessage)}</span></div><button type="button" onClick={cancelEdit} aria-label="Cancelar edição"><X size={15} /></button></div>}
        {replyingTo && <div className="composer-reply"><Reply size={16} /><div><strong>Respondendo a {replyingTo.direction === 'OUTBOUND' ? 'você' : conversation.contact.name}</strong><span>{messagePreview(replyingTo)}</span></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancelar resposta"><X size={15} /></button></div>}
        {file && <span className={`composer-file${filePreviewUrl ? ' has-preview' : ''}`}>{filePreviewUrl ? <img src={filePreviewUrl} alt="Prévia da imagem colada" /> : <FileText size={14} />}<span>{file.name}</span><button type="button" onClick={() => { setFile(null); setAttachmentError(''); }} aria-label="Remover anexo"><X size={12} /></button></span>}
        <WhatsappComposer ref={textRef} value={text} disabled={!canReply} onPaste={pasteImage} onKeyDown={handleAutomationKeyDown} onChange={(value) => { setText(value); setAutomationMenuOpen(canReply && !editingMessage && !file && value.startsWith('/') && !value.includes('\n')); setAttachmentError(''); if (send.isError) send.reset(); if (edit.isError) edit.reset(); }} placeholder={composerPlaceholder} onSubmit={() => { if (!send.isPending && !edit.isPending && !startWorkflow.isPending) submitCurrentMessage(); }} />
        {attachmentError && <span className="composer-error"><AlertCircle size={14} />{attachmentError}</span>}
        {send.isError && <span className="composer-error"><AlertCircle size={14} />{send.error instanceof Error ? send.error.message : 'Não foi possível enviar a mensagem'}</span>}
        {edit.isError && <span className="composer-error"><AlertCircle size={14} />{apiErrorMessage(edit.error, 'Não foi possível editar a mensagem')}</span>}
        {retry.isError && <span className="composer-error"><AlertCircle size={14} />{retry.error instanceof Error ? retry.error.message : 'Não foi possível reenviar a mensagem'}</span>}
        {react.isError && <span className="composer-error"><AlertCircle size={14} />{react.error instanceof Error ? react.error.message : 'Não foi possível enviar a reação'}</span>}
        {signaturePreference.isError && <span className="composer-error"><AlertCircle size={14} />Não foi possível salvar a preferência de assinatura</span>}
          </div>
          {canReply && (text.trim() || (!editingMessage && file)) && <div className="composer-send"><Button type="submit" loading={send.isPending || edit.isPending || startWorkflow.isPending} aria-label={editingMessage ? 'Salvar edição' : automationMenuOpen ? 'Iniciar automação' : 'Enviar mensagem'} title={editingMessage ? 'Salvar edição' : automationMenuOpen ? 'Iniciar automação' : 'Enviar mensagem'}>{editingMessage ? <Check size={18} /> : automationMenuOpen ? <Workflow size={18} /> : <Send size={19} />}</Button></div>}
          {canReply && !text.trim() && !file && !editingMessage && <div className="composer-send"><button type="button" className="composer-record" onClick={() => void startVoiceRecording()} disabled={send.isPending || startWorkflow.isPending} aria-label="Gravar áudio" title="Gravar áudio"><Mic size={20} /></button></div>}
        </div>
        </>}
      </div>
    </form>
    {messageMenu && createPortal(<MessageActionMenu
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
      onDelete={() => { setDeletingMessage(messageMenu.message); setMessageMenu(null); }}
    />, document.body)}
    {conversationMenu && createPortal(<>
      <button type="button" className="message-menu-scrim" onClick={() => setConversationMenu(null)} aria-label="Fechar ações da conversa" />
      <div className="conversation-action-menu" role="menu" style={{ top: conversationMenu.top, left: conversationMenu.left }}>
        {conversation.contact.phone
          ? <a role="menuitem" href={`tel:${conversation.contact.phone}`} onClick={() => setConversationMenu(null)}><Phone size={17} /><span>Ligar para {formatPhone(conversation.contact.phone)}</span></a>
          : <button type="button" role="menuitem" disabled title="O contato não possui telefone cadastrado"><Phone size={17} /><span>Ligar</span></button>}
        <button type="button" role="menuitem" disabled={!canCreateOpportunity} title={!canCreateOpportunity ? 'Você não possui permissão para criar oportunidades' : undefined} onClick={() => { setConversationMenu(null); setOpportunityOpen(true); }}><BriefcaseBusiness size={17} /><span>Criar oportunidade</span></button>
        <button type="button" role="menuitem" disabled={conversation.status === 'CLOSED'} title={conversation.status === 'CLOSED' ? 'Reabra a conversa antes de transferir' : undefined} onClick={() => { setConversationMenu(null); setTransferTarget(''); transfer.reset(); setTransferOpen(true); }}><ArrowRightLeft size={17} /><span>Transferir para atendente</span></button>
        <button type="button" role="menuitem" disabled={exportPdf.isPending} onClick={() => { setConversationMenu(null); setActionError(''); exportPdf.mutate(); }}><Download size={17} /><span>{exportPdf.isPending ? 'Exportando PDF…' : 'Exportar para PDF'}</span></button>
      </div>
    </>, document.body)}
    {opportunityOpen && <ContactOpportunityModal
      contact={conversation.contact}
      onClose={() => setOpportunityOpen(false)}
      onCreated={() => {
        setOpportunityOpen(false);
        setActionNotice(`Oportunidade criada para ${conversation.contact.name}`);
        onSend();
      }}
    />}
    {actionNotice && createPortal(<div className="message-action-toast" role="status">{actionNotice}</div>, document.body)}
    {actionError && createPortal(<div className="message-action-toast error" role="alert">{actionError}</div>, document.body)}
    {contactOpen && <ContactDrawer conversation={conversation} onClose={() => setContactOpen(false)} onUpdated={onSend} />}
    {deletingMessage && <Modal title="Apagar mensagem?" onClose={() => { if (!remove.isPending) setDeletingMessage(null); }} width={470}>
      <div className="delete-message-confirmation"><div className="delete-message-icon"><Trash2 size={22} /></div><div><strong>Apagar para todos</strong><p>A mensagem será removida desta conversa e também do WhatsApp do contato.</p><blockquote>{messagePreview(deletingMessage)}</blockquote></div></div>
      {remove.isError && <div className="form-error">{remove.error instanceof Error ? remove.error.message : 'Não foi possível apagar a mensagem'}</div>}
      <div className="modal-actions"><Button variant="secondary" onClick={() => setDeletingMessage(null)} disabled={remove.isPending}>Cancelar</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(deletingMessage.id)}><Trash2 size={16} />Apagar para todos</Button></div>
    </Modal>}
    {transferOpen && <Modal title="Transferir atendimento" onClose={() => { if (!transfer.isPending) { setTransferOpen(false); setTransferTarget(''); } }} width={540}>
      <div className="conversation-transfer">
        <div className="conversation-transfer-intro"><ArrowRightLeft size={20} /><div><strong>Escolha o novo atendente</strong><p>A conversa será removida da sua fila e o novo responsável receberá uma notificação.</p></div></div>
        {assignees.isLoading ? <PageLoading /> : assignees.isError ? <div className="form-error">{assignees.error instanceof Error ? assignees.error.message : 'Não foi possível carregar os atendentes'}</div> : transferTargets.length ? <div className="conversation-assignee-list">{transferTargets.map((assignee) => <button type="button" key={assignee.id} className={transferTarget === assignee.id ? 'selected' : ''} onClick={() => { setTransferTarget(assignee.id); transfer.reset(); }}><span className="contact-avatar">{initials(assignee.name)}</span><div><strong>{assignee.name}</strong><small>{assignee.team?.name || assignee.email}</small></div>{transferTarget === assignee.id && <Check size={18} />}</button>)}</div> : <div className="conversation-transfer-empty"><UsersRound size={22} /><strong>Nenhum outro atendente disponível</strong><span>Não há outro usuário ativo na equipe para receber esta conversa.</span></div>}
        {transfer.isError && <div className="form-error">{transfer.error instanceof Error ? transfer.error.message : 'Não foi possível transferir o atendimento'}</div>}
      </div>
      <div className="modal-actions"><Button variant="secondary" onClick={() => { setTransferOpen(false); setTransferTarget(''); }} disabled={transfer.isPending}>Cancelar</Button><Button onClick={() => transferTarget && transfer.mutate(transferTarget)} loading={transfer.isPending} disabled={!transferTarget}><ArrowRightLeft size={16} />Transferir</Button></div>
    </Modal>}
  </section>;
}

function ContactDrawer({ conversation, onClose, onUpdated }: { conversation: Conversation; onClose(): void; onUpdated(): void }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inlineField, setInlineField] = useState<ContactInlineField | null>(null);
  const [inlineValue, setInlineValue] = useState('');
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
    enabled: inlineField === 'companyId',
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
  const beginInlineEdit = (field: ContactInlineField) => {
    if (!canEdit || inlineUpdate.isPending) return;
    inlineUpdate.reset();
    setInlineField(field);
    setInlineValue(field === 'phone' ? contact.phone || '' : field === 'email' ? contact.email || '' : company?.id || '');
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
          {companies.isError && field === 'companyId' && <small className="contact-inline-error">Não foi possível carregar as empresas.</small>}
          {inlineUpdate.error && <small className="contact-inline-error">{inlineUpdate.error.message}</small>}
        </div>
      </form>;
    }
    const content = <>{icon}<span>{label}</span><strong>{value}</strong>{canEdit && <Pencil className="contact-detail-pencil" size={14} />}</>;
    return canEdit
      ? <button type="button" className="contact-detail-row contact-detail-edit-trigger" onClick={() => beginInlineEdit(field)} aria-label={`Editar ${label.toLowerCase()}`}>{content}</button>
      : <div className="contact-detail-row">{content}</div>;
  };
  return <>
    <button className="drawer-scrim" onClick={onClose} aria-label="Fechar informações do contato" />
    <aside className="opportunity-drawer contact-drawer" aria-label={`Informações de ${contact.name}`}>
      <header>
        <div><span className="eyebrow">Contato</span><h2>{contact.name}</h2></div>
        <div className="contact-drawer-actions">{canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Editar contato</Button>}<button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
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
        <section>
          <h3><Tags size={15} />Tags</h3>
          {contact.tags?.length ? <div className="drawer-tags">{contact.tags.map(({ tag }) => <span key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span>)}</div> : <p className="drawer-empty-copy">Nenhuma tag adicionada.</p>}
        </section>
        <section>
          <h3><BriefcaseBusiness size={15} />Oportunidades</h3>
          {contact.opportunities?.length ? <div className="contact-opportunity-list">{contact.opportunities.map(({ opportunity }) => <div key={opportunity.id}><div><strong>{opportunity.title}</strong><small>{opportunity.status === 'OPEN' ? 'Em andamento' : opportunity.status === 'WON' ? 'Ganha' : 'Perdida'}</small></div><span><i style={{ background: opportunity.stage.color }} />{opportunity.stage.name}</span></div>)}</div> : <p className="drawer-empty-copy">Nenhuma oportunidade vinculada.</p>}
        </section>
      </div>
    </aside>
    {editing && <ContactModal contact={contact} onClose={() => setEditing(false)} onSaved={refresh} />}
  </>;
}

const WhatsappAvatar = memo(function WhatsappAvatar({ conversationId, name, large = false }: { conversationId: string; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`contact-avatar${large ? ' large' : ''}${failed ? '' : ' has-image'}`}>
    {!failed && <img src={apiUrl(`/conversations/${conversationId}/profile-picture?v=1`)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    {failed && initials(name)}
  </span>;
});

const ConversationEventLog = memo(function ConversationEventLog({ event }: { event: ConversationEvent }) {
  return <div className={`conversation-event conversation-event-${event.type}`}><span><History size={13} /><strong>{event.text}</strong><time>{dateTime(event.createdAt).split(' ')[1]}</time></span></div>;
});

const MessageBubble = memo(function MessageBubble({ message, replyTo, contactName, menuOpen, onMenu, onReactionMenu, onJumpToReply, onReply, onRetry, retrying, canRetry, onMediaReady, audioPlaybackRate, onCycleAudioPlaybackRate }: {
  message: Message;
  replyTo?: Message;
  contactName: string;
  menuOpen: boolean;
  onMenu(message: Message, clientX: number, clientY: number): void;
  onReactionMenu(message: Message, clientX: number, clientY: number): void;
  onJumpToReply(messageId: string): void;
  onReply(message: Message): void;
  onRetry(messageId: string): void;
  retrying: boolean;
  canRetry: boolean;
  onMediaReady(): void;
  audioPlaybackRate: number;
  onCycleAudioPlaybackRate(): void;
}) {
  const outbound = message.direction === 'OUTBOUND';
  const failure = message.status === 'FAILED' ? describeMessageFailure(message.payload) : undefined;
  const reactions = messageReactions(message);
  const deleted = message.type === 'deleted' || message.payload?.deleted === true;
  const originalType = typeof message.payload?.originalType === 'string' ? message.payload.originalType : message.type;
  const originalText = typeof message.payload?.originalText === 'string' ? message.payload.originalText : undefined;
  const sticker = originalType === 'sticker';
  const visualMedia = Boolean(message.media?.length) && (originalType === 'image' || originalType === 'video');
  const documentMedia = Boolean(message.media?.length) && originalType === 'document';
  const messageText = message.text || originalText || (deleted ? 'Conteúdo original indisponível' : sticker && !message.media?.length ? 'Figurinha indisponível' : message.media?.length ? '' : `[${message.type}]`);
  const quickReactionButton = canRetry && !deleted && <button type="button" className="message-quick-reaction" aria-label="Reagir à mensagem" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onReactionMenu(message, rect.left, rect.bottom + 4); }}><SmilePlus size={18} /></button>;
  return <div className={`message-row ${outbound ? 'outbound' : 'inbound'}${menuOpen ? ' menu-open' : ''}`} data-message-id={message.id} data-message-kind={isAudioMessage(message) ? 'audio' : originalType}>
    {outbound && quickReactionButton}
    <div
      className={`message-bubble${sticker ? ' sticker' : ''}${visualMedia ? ' visual-media' : ''}${documentMedia ? ' document-media' : ''}${deleted ? ' deleted-message' : ''}${message.status === 'FAILED' ? ' failed' : ''}`}
      onContextMenu={(event) => { event.preventDefault(); onMenu(message, event.clientX, event.clientY); }}
      onDoubleClick={(event) => {
        if (!canRetry || deleted || (event.target as HTMLElement).closest('button, a, audio, video')) return;
        event.preventDefault();
        onReply(message);
      }}
    >
      <button type="button" className="message-menu-trigger" aria-label="Abrir opções da mensagem" aria-expanded={menuOpen} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(message, rect.right, rect.bottom + 4); }}><ChevronDown size={17} /></button>
      {deleted && <div className="message-deleted-notice" role="note" title="Esta mensagem foi apagada"><Trash2 size={13} /><strong>Mensagem apagada</strong></div>}
      {replyTo && <button type="button" className="message-reply-quote" onClick={() => onJumpToReply(replyTo.id)} aria-label={`Ir para a mensagem: ${messagePreview(replyTo)}`}><strong>{replyTo.direction === 'OUTBOUND' ? 'Você' : contactName}</strong><span>{messagePreview(replyTo)}</span></button>}
      {(message.media?.[0] ? <MediaAttachment media={message.media[0]} sticker={sticker} onReady={onMediaReady} audioPlaybackRate={audioPlaybackRate} onCycleAudioPlaybackRate={onCycleAudioPlaybackRate} /> : originalType === 'document' && <span className="message-file"><FileText size={18} />Documento</span>)}
      {messageText && <p><WhatsappText text={messageText} /></p>}
      <small>{dateTime(message.createdAt).split(' ')[1]} {outbound && <MessageDelivery status={message.status} failure={failure} onRetry={() => onRetry(message.id)} retrying={retrying} canRetry={canRetry} />}</small>
      {reactions.length > 0 && <div className="message-reactions" aria-label="Reações">{reactions.map((reaction, index) => <span key={`${reaction.userId || reaction.userName || 'reaction'}-${index}`} title={reaction.userName || 'Reação'}>{reaction.emoji}</span>)}</div>}
    </div>
    {!outbound && quickReactionButton}
  </div>;
});

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function MessageActionMenu({ menu, canInteract, reacting, ownReaction, onClose, onCopy, onDownload, downloading, onReply, onReact, onEdit, onDelete }: {
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
  onDelete(): void;
}) {
  const [showReactions, setShowReactions] = useState(menu.mode === 'reactions');
  const outbound = menu.message.direction === 'OUTBOUND';
  const providerReady = !menu.message.providerMessageId.startsWith('local:') && !['QUEUED', 'PENDING', 'FAILED', 'SKIPPED'].includes(menu.message.status);
  const deleted = menu.message.type === 'deleted' || menu.message.payload?.deleted === true;
  const audioMedia = messageAudioMedia(menu.message);
  const audio = isAudioMessage(menu.message);
  const canReference = canInteract && providerReady && !deleted;
  const canEdit = canInteract && providerReady && !deleted && menu.message.type === 'text';
  const canDelete = canInteract && providerReady && !deleted;
  return <>
    <button type="button" className="message-menu-scrim" onClick={onClose} aria-label="Fechar opções da mensagem" />
    <div className={`message-action-menu${menu.mode === 'reactions' ? ' reaction-only' : ''}`} role="menu" style={{ top: menu.top, left: menu.left }}>
      {showReactions && <div className="message-reaction-picker" aria-label="Escolher reação">{QUICK_REACTIONS.map((emoji) => <button type="button" key={emoji} className={ownReaction === emoji ? 'selected' : ''} disabled={reacting} onClick={() => onReact(emoji)} aria-label={`Reagir com ${emoji}`}>{emoji}</button>)}</div>}
      {menu.mode === 'menu' && <>
        {!audio && <button type="button" role="menuitem" onClick={onCopy}><Copy size={17} /><span>Copiar mensagem</span></button>}
        {audio && <button type="button" role="menuitem" disabled={!audioMedia || downloading} title={!audioMedia ? 'O arquivo deste áudio não está disponível' : undefined} onClick={onDownload}><Download size={17} /><span>{downloading ? 'Baixando áudio…' : 'Baixar áudio'}</span></button>}
        <button type="button" role="menuitem" disabled={!canReference || reacting} title={!canInteract ? 'Assuma e abra o atendimento para reagir' : !providerReady ? 'Aguarde a mensagem ser enviada' : deleted ? 'A mensagem foi apagada' : undefined} onClick={() => setShowReactions((current) => !current)}><SmilePlus size={17} /><span>Reagir</span></button>
        <button type="button" role="menuitem" disabled={!canReference} title={!canInteract ? 'Assuma e abra o atendimento para responder' : !providerReady ? 'Aguarde a mensagem ser enviada' : deleted ? 'A mensagem foi apagada' : undefined} onClick={onReply}><Reply size={17} /><span>Responder</span></button>
        {outbound && <button type="button" role="menuitem" disabled={!canEdit} title={!canInteract ? 'Assuma e abra o atendimento para editar' : !providerReady ? 'Aguarde a mensagem ser enviada' : menu.message.type !== 'text' ? 'Somente mensagens de texto podem ser editadas' : undefined} onClick={onEdit}><Pencil size={17} /><span>Editar mensagem</span></button>}
        {outbound && <button type="button" role="menuitem" className="danger" disabled={!canDelete} title={!canInteract ? 'Assuma e abra o atendimento para apagar' : !providerReady ? 'Aguarde a mensagem ser enviada' : undefined} onClick={onDelete}><Trash2 size={17} /><span>Apagar para todos</span></button>}
      </>}
    </div>
  </>;
}

type MessageReaction = { emoji: string; source?: 'me' | 'contact'; userId?: string; userName?: string };

function messageReactions(message: Message): MessageReaction[] {
  const reactions = message.payload?.reactions;
  if (!Array.isArray(reactions)) return [];
  return reactions.filter((item): item is MessageReaction => Boolean(item && typeof item === 'object' && typeof (item as MessageReaction).emoji === 'string'));
}

function messageReplyTarget(message: Message, messages: Map<string, Message>) {
  const replyToMessageId = message.payload?.replyToMessageId;
  return typeof replyToMessageId === 'string' ? messages.get(replyToMessageId) : undefined;
}

function messagePreview(message: Message) {
  const text = message.text?.trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  const filename = message.media?.[0]?.filename;
  if (filename) return filename;
  const labels: Record<string, string> = { sticker: '🏷️ Figurinha', image: '🖼️ Imagem', audio: '🎧 Áudio', video: '🎥 Vídeo', document: '📄 Documento', deleted: 'Mensagem apagada' };
  return labels[message.type] || `Mensagem ${message.type}`;
}

function messageCopyText(message: Message) {
  return message.text?.trim() || message.media?.[0]?.filename || messagePreview(message);
}

function messageAudioMedia(message: Message) {
  return message.media?.find((media) => media.contentType.toLowerCase().startsWith('audio/'));
}

function isAudioMessage(message: Message) {
  const originalType = typeof message.payload?.originalType === 'string' ? message.payload.originalType : message.type;
  return originalType === 'audio' || Boolean(messageAudioMedia(message));
}

function MessageDelivery({ status, failure, onRetry, retrying, canRetry }: { status: string; failure?: MessageFailure; onRetry(): void; retrying: boolean; canRetry: boolean }) {
  if (status === 'FAILED') return <span className="message-delivery failed"><span className="message-error-trigger" tabIndex={0} aria-label={`Erro no envio: ${failure?.summary || 'Motivo não informado'}`}><AlertCircle size={14} /><span className="message-error-tooltip" role="tooltip"><strong>Falha no envio</strong><span>{failure?.summary || 'O provedor não informou o motivo da falha.'}</span>{failure?.detail && failure.detail !== failure.summary && <code>{failure.detail}</code>}</span></span>Falhou{canRetry && <button type="button" onClick={onRetry} disabled={retrying} aria-label="Tentar enviar novamente" title="Tentar enviar novamente"><RotateCcw size={12} className={retrying ? 'spin' : ''} />Tentar novamente</button>}</span>;
  if (status === 'QUEUED' || status === 'PENDING') return <span className="message-delivery pending" title="Aguardando envio"><Clock size={12} />Enviando</span>;
  if (status === 'READ') return <span className="message-delivery read" title="Lida"><CheckCheck size={13} /></span>;
  if (status === 'DELIVERED') return <span className="message-delivery" title="Entregue"><CheckCheck size={13} /></span>;
  return <span className="message-delivery" title="Enviada"><Check size={13} /></span>;
}

function MediaAttachment({ media, sticker = false, onReady, audioPlaybackRate, onCycleAudioPlaybackRate }: { media: NonNullable<Message['media']>[number]; sticker?: boolean; onReady(): void; audioPlaybackRate: number; onCycleAudioPlaybackRate(): void }) {
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
  if (media.contentType.startsWith('video/')) return <video className="message-media" controls preload="metadata" src={url} onLoadedMetadata={onReady} />;
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

function AudioAttachment({ url, onReady, playbackRate, onCyclePlaybackRate }: { url: string; onReady(): void; playbackRate: number; onCyclePlaybackRate(): void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentIndex = AUDIO_PLAYBACK_RATES.findIndex((rate) => rate === playbackRate);
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
    />
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

function DocumentAttachment({ media, url, loading = false }: { media: NonNullable<Message['media']>[number]; url?: string; loading?: boolean }) {
  const extension = documentExtension(media);
  const content = <>
    <span className={`message-document-icon${extension === 'PDF' ? ' pdf' : ''}`} aria-hidden="true"><FileText size={24} /><b>{extension}</b></span>
    <span className="message-document-info"><strong title={media.filename}>{media.filename}</strong><small>{extension} <i /> {formatFileSize(media.sizeBytes)}</small></span>
    <span className="message-document-action" aria-hidden="true">{loading ? <Clock size={18} /> : <Download size={18} />}</span>
  </>;
  if (!url) return <span className="message-document loading" aria-label={`Carregando ${media.filename}`} aria-busy="true">{content}</span>;
  return <a className="message-document" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir documento ${media.filename}`} title="Abrir documento">{content}</a>;
}

function ImageLightbox({ url, alt, onClose }: { url: string; alt: string; onClose(): void }) {
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const onCloseRef = useRef(onClose);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
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

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || zoomRef.current <= 1 || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop, moved: false };
    setDragging(true);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      drag.moved = true;
      if (!stage.hasPointerCapture(event.pointerId)) stage.setPointerCapture(event.pointerId);
    }
    stage.scrollLeft = drag.scrollLeft - deltaX;
    stage.scrollTop = drag.scrollTop - deltaY;
    event.preventDefault();
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  return createPortal(<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`Visualização ampliada de ${alt}`}>
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
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClick={(event) => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains('image-lightbox-canvas')) onClose();
      }}
      onWheel={(event) => { event.preventDefault(); changeZoom(zoomRef.current + (event.deltaY < 0 ? 0.25 : -0.25)); }}
    >
      <div className="image-lightbox-canvas">
        <img
          src={url}
          alt={alt}
          draggable={false}
          style={{ width: displayWidth, height: displayHeight }}
          onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onClick={() => { if (!suppressClickRef.current) changeZoom(zoomRef.current === 1 ? 2 : 1); }}
          title={zoom === 1 ? 'Clique para ampliar' : 'Arraste para mover ou clique para restaurar'}
        />
      </div>
    </div>
  </div>, document.body);
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
