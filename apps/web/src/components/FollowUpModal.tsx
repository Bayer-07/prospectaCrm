import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CalendarDays, Check, Clock3, FileText, Image, MessageSquareText, Plus, Trash2, Workflow, X } from 'lucide-react';
import { api, ApiError, apiErrorMessage, type Envelope } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Modal, PageLoading } from './ui';
import { useAuth } from '../App';

type FollowUpMode = 'message_sequence' | 'workflow';
type DelayUnit = 'seconds' | 'minutes' | 'hours';
type WorkflowOption = { id: string; name: string; description?: string; status: string; publishedVersion?: number };
type FollowUpStep = {
  id?: string;
  text?: string | null;
  mediaKey?: string | null;
  mediaName?: string | null;
  mediaType?: string | null;
  delaySeconds: number;
  status?: string;
};
export type ConversationFollowUp = {
  id: string;
  conversationId: string;
  mode: 'MESSAGE_SEQUENCE' | 'WORKFLOW';
  status: string;
  scheduledAt: string;
  revision: number;
  failureReason?: string | null;
  cancellationReason?: string | null;
  task: { id: string; status: string; dueAt: string };
  workflowVersion?: { id: string; version: number; workflow: { id: string; name: string; status: string } } | null;
  steps: FollowUpStep[];
};

type DraftMessage = {
  key: string;
  text: string;
  delayValue: number;
  delayUnit: DelayUnit;
  mediaKey?: string;
  mediaName?: string;
  mediaType?: string;
  file?: File;
};

type Props = Readonly<{
  conversationId: string;
  contactName: string;
  followUpId?: string;
  onClose(): void;
  onSaved?(): void;
}>;

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const scheduleFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const saoPauloPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function FollowUpModal({ conversationId, contactName, followUpId, onClose, onSaved }: Props) {
  const client = useQueryClient();
  const { user } = useAuth();
  const [stage, setStage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(tomorrowAtNine()));
  const [dateKey, setDateKey] = useState(() => calendarDateKey(tomorrowAtNine()));
  const [time, setTime] = useState('09:00');
  const [mode, setMode] = useState<FollowUpMode>('message_sequence');
  const [workflowId, setWorkflowId] = useState('');
  const [messages, setMessages] = useState<DraftMessage[]>(() => [emptyMessage()]);
  const canUseWorkflows = Boolean(user?.roleKey === 'admin' || user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === 'workflows')
    && (permission.action === '*' || permission.action === 'write')));
  const detailsPath = followUpId
    ? `/conversations/${conversationId}/follow-ups/${followUpId}`
    : `/conversations/${conversationId}/follow-ups/active`;
  const details = useQuery({
    queryKey: ['conversation-follow-up', conversationId, followUpId || 'active'],
    queryFn: () => api<Envelope<ConversationFollowUp | null>>(detailsPath),
  });
  const workflows = useQuery({
    queryKey: ['workflow-shortcuts'],
    queryFn: () => api<Envelope<WorkflowOption[]>>('/workflows'),
    staleTime: 60_000,
    enabled: stage === 3 && canUseWorkflows,
  });
  const existing = details.data?.data || null;
  const editable = !existing || existing.status === 'SCHEDULED';
  const publishedWorkflows = useMemo(
    () => (workflows.data?.data || []).filter((item) => item.status === 'PUBLISHED' && item.publishedVersion),
    [workflows.data?.data],
  );

  useEffect(() => {
    if (!existing) return;
    const scheduledAt = new Date(existing.scheduledAt);
    setDateKey(saoPauloDateKey(scheduledAt));
    setCalendarMonth(startOfMonth(saoPauloCalendarDate(scheduledAt)));
    setTime(saoPauloTime(scheduledAt));
    if (existing.mode === 'WORKFLOW') {
      setMode('workflow');
      setWorkflowId(existing.workflowVersion?.workflow.id || '');
    } else {
      setMode('message_sequence');
      setMessages(existing.steps.map((step) => messageFromStep(step)));
    }
    setStage(3);
  }, [existing]);

  const scheduledAt = useMemo(() => dateAndTime(dateKey, time), [dateKey, time]);
  const save = useMutation({
    mutationFn: async () => {
      if (!scheduledAt || scheduledAt.getTime() <= Date.now()) throw new Error('Escolha uma data e horário futuros.');
      let body: Record<string, unknown>;
      if (mode === 'workflow') {
        if (!workflowId) throw new Error('Selecione uma automação publicada.');
        body = { mode, workflowId, scheduledAt: scheduledAt.toISOString() };
      } else {
        const uploaded = await Promise.all(messages.map(uploadDraftMessage));
        const invalid = uploaded.find((message) => !message.text.trim() && !message.mediaKey);
        if (invalid) throw new Error('Cada mensagem precisa ter texto, imagem ou documento.');
        body = {
          mode,
          scheduledAt: scheduledAt.toISOString(),
          messages: uploaded.map((message, index) => ({
            text: message.text.trim() || undefined,
            mediaKey: message.mediaKey,
            delaySeconds: index === 0 ? 0 : delayInSeconds(message.delayValue, message.delayUnit),
          })),
        };
      }
      const path = existing
        ? `/conversations/${conversationId}/follow-ups/${existing.id}`
        : `/conversations/${conversationId}/follow-ups`;
      return api<Envelope<ConversationFollowUp>>(path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success(existing ? 'Follow-up atualizado.' : 'Follow-up agendado.');
      invalidateFollowUp(client, conversationId);
      onSaved?.();
      onClose();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) toast.error(apiErrorMessage(error, 'Não foi possível salvar o follow-up'));
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/conversations/${conversationId}/follow-ups/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(existing?.status === 'RUNNING' ? 'Mensagens restantes canceladas.' : 'Follow-up cancelado.');
      invalidateFollowUp(client, conversationId);
      onSaved?.();
      onClose();
    },
  });

  if (details.isLoading) return <Modal title="Follow-up automático" onClose={onClose} width={880}><PageLoading /></Modal>;
  if (details.isError) return <Modal title="Follow-up automático" onClose={onClose} width={620}><div className="follow-up-load-error"><strong>Não foi possível carregar o follow-up</strong><p>Tente fechar esta janela e abrir novamente.</p></div></Modal>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (stage < 3) setStage(stage + 1);
    else if (editable) save.mutate();
  };
  const title = existing ? 'Ver/editar follow-up' : 'Agendar follow-up automático';
  let submitLabel = 'Continuar';
  if (stage >= 3) submitLabel = existing ? 'Salvar alterações' : 'Agendar follow-up';
  return <Modal title={title} onClose={onClose} width={920}>
    <form className="follow-up-editor" onSubmit={submit}>
      <FollowUpProgress stage={stage} />
      <p className="follow-up-contact">Contato: <strong>{contactName}</strong></p>
      {existing && <FollowUpStatusBanner followUp={existing} />}
      {stage === 1 && <DateStage month={calendarMonth} selected={dateKey} onMonthChange={setCalendarMonth} onSelect={setDateKey} />}
      {stage === 2 && <TimeStage dateKey={dateKey} value={time} onChange={setTime} />}
      {stage === 3 && <ActionStage
        mode={mode}
        messages={messages}
        workflows={publishedWorkflows}
        workflowId={workflowId}
        editable={editable}
        canUseWorkflows={canUseWorkflows}
        onModeChange={setMode}
        onWorkflowChange={setWorkflowId}
        onMessagesChange={setMessages}
      />}
      <footer className="modal-actions follow-up-actions">
        {existing && ['SCHEDULED', 'RUNNING'].includes(existing.status) && <Button type="button" variant="danger" loading={cancel.isPending} onClick={() => {
          const prompt = existing.status === 'RUNNING'
            ? 'Cancelar todas as mensagens restantes deste follow-up?'
            : 'Cancelar este follow-up e a tarefa vinculada?';
          if (window.confirm(prompt)) cancel.mutate();
        }}>{existing.status === 'RUNNING' ? 'Cancelar mensagens restantes' : 'Cancelar follow-up'}</Button>}
        <span />
        {stage > 1 && editable && <Button type="button" variant="secondary" onClick={() => setStage(stage - 1)}>Voltar</Button>}
        <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        {editable && <Button type="submit" loading={save.isPending}>{submitLabel}</Button>}
      </footer>
    </form>
  </Modal>;
}

function FollowUpProgress({ stage }: Readonly<{ stage: number }>) {
  const items = [['1', 'Data'], ['2', 'Horário'], ['3', 'Ação']];
  return <ol className="follow-up-progress">{items.map(([number, label], index) => {
    const step = index + 1;
    const state = stage === step ? 'current' : stage > step ? 'done' : '';
    return <li key={number} className={state} aria-current={stage === step ? 'step' : undefined}><b>{stage > step ? <Check size={14} /> : number}</b><span>{label}</span></li>;
  })}</ol>;
}

function FollowUpStatusBanner({ followUp }: Readonly<{ followUp: ConversationFollowUp }>) {
  const labels: Record<string, string> = { SCHEDULED: 'Agendado', RUNNING: 'Em execução', COMPLETED: 'Concluído', CANCELLED: 'Cancelado', INTERRUPTED: 'Interrompido por resposta', FAILED: 'Falhou' };
  return <div className={`follow-up-status follow-up-status-${followUp.status.toLowerCase()}`}><Clock3 size={18} /><div><strong>{labels[followUp.status] || followUp.status}</strong><span>{scheduleFormatter.format(new Date(followUp.scheduledAt))}</span>{followUp.failureReason && <small>{followUp.failureReason}</small>}</div></div>;
}

function DateStage({ month, selected, onMonthChange, onSelect }: Readonly<{ month: Date; selected: string; onMonthChange(value: Date): void; onSelect(value: string): void }>) {
  const days = calendarDays(month);
  const weekdays = calendarDays(startOfMonth(new Date(2026, 7, 1))).slice(0, 7);
  const todayKey = saoPauloDateKey(new Date());
  return <section className="follow-up-stage"><header><div><CalendarDays size={20} /><div><strong>Escolha o dia</strong><span>A primeira ação será executada nesta data.</span></div></div><div className="follow-up-month-nav"><button type="button" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Mês anterior">‹</button><b>{capitalize(monthFormatter.format(month))}</b><button type="button" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Próximo mês">›</button></div></header><div className="follow-up-calendar"><div className="follow-up-weekdays">{weekdays.map((day) => <span key={day.getDay()}>{weekdayFormatter.format(day).replace('.', '')}</span>)}</div><div className="follow-up-days">{days.map((day) => {
    const key = calendarDateKey(day);
    const unavailable = key < todayKey;
    return <button type="button" key={key} className={`${day.getMonth() !== month.getMonth() ? 'outside ' : ''}${selected === key ? 'selected' : ''}`.trim()} disabled={unavailable} onClick={() => onSelect(key)}><span>{day.getDate()}</span>{key === todayKey && <small>Hoje</small>}</button>;
  })}</div></div></section>;
}

function TimeStage({ dateKey, value, onChange }: Readonly<{ dateKey: string; value: string; onChange(value: string): void }>) {
  const selected = dateAndTime(dateKey, value);
  return <section className="follow-up-stage follow-up-time-stage"><header><div><Clock3 size={20} /><div><strong>Escolha o horário</strong><span>Usaremos o fuso horário de São Paulo.</span></div></div></header><label><span>Horário do primeiro envio</span><input type="time" value={value} onChange={(event) => onChange(event.target.value)} required autoFocus /></label>{selected && <p><CalendarDays size={16} />{scheduleFormatter.format(selected)}</p>}</section>;
}

type ActionStageProps = Readonly<{
  mode: FollowUpMode;
  messages: DraftMessage[];
  workflows: WorkflowOption[];
  workflowId: string;
  editable: boolean;
  canUseWorkflows: boolean;
  onModeChange(value: FollowUpMode): void;
  onWorkflowChange(value: string): void;
  onMessagesChange(value: DraftMessage[]): void;
}>;

function ActionStage(props: ActionStageProps) {
  const updateMessage = (index: number, patch: Partial<DraftMessage>) => props.onMessagesChange(props.messages.map((item, position) => position === index ? { ...item, ...patch } : item));
  const removeMessage = (index: number) => props.onMessagesChange(props.messages.filter((_, position) => position !== index));
  const moveMessage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= props.messages.length) return;
    const next = [...props.messages];
    [next[index], next[target]] = [next[target], next[index]];
    props.onMessagesChange(next);
  };
  return <section className="follow-up-stage follow-up-action-stage"><header><div><MessageSquareText size={20} /><div><strong>O que deve acontecer?</strong><span>Escolha mensagens editáveis ou uma automação publicada.</span></div></div></header><div className="follow-up-mode-picker"><button type="button" className={props.mode === 'message_sequence' ? 'selected' : ''} aria-pressed={props.mode === 'message_sequence'} disabled={!props.editable} onClick={() => props.onModeChange('message_sequence')}><MessageSquareText size={20} /><strong>Enviar mensagens</strong><span>Texto, imagem ou documento em sequência.</span></button><button type="button" className={props.mode === 'workflow' ? 'selected' : ''} aria-pressed={props.mode === 'workflow'} disabled={!props.editable || !props.canUseWorkflows} title={!props.canUseWorkflows ? 'Você não possui permissão para iniciar automações' : undefined} onClick={() => props.onModeChange('workflow')}><Workflow size={20} /><strong>Iniciar automação</strong><span>Executa a versão publicada selecionada.</span></button></div>
    {props.mode === 'workflow'
      ? <label className="field"><span>Automação publicada</span><select value={props.workflowId} disabled={!props.editable} onChange={(event) => props.onWorkflowChange(event.target.value)} required><option value="">Selecione uma automação</option>{props.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · versão {workflow.publishedVersion}</option>)}</select>{!props.workflows.length && <small>Nenhuma automação publicada está disponível.</small>}</label>
      : <div className="follow-up-message-list">{props.messages.map((message, index) => <FollowUpMessageCard
        key={message.key}
        message={message}
        index={index}
        count={props.messages.length}
        editable={props.editable}
        onChange={(patch) => updateMessage(index, patch)}
        onMove={(direction) => moveMessage(index, direction)}
        onRemove={() => removeMessage(index)}
      />)}{props.editable && props.messages.length < 20 && <button type="button" className="follow-up-add-message" onClick={() => props.onMessagesChange([...props.messages, emptyMessage()])}><Plus size={17} />Adicionar outra mensagem</button>}</div>}
  </section>;
}

type FollowUpMessageCardProps = Readonly<{
  message: DraftMessage;
  index: number;
  count: number;
  editable: boolean;
  onChange(patch: Partial<DraftMessage>): void;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
}>;

function FollowUpMessageCard({ message, index, count, editable, onChange, onMove, onRemove }: FollowUpMessageCardProps) {
  const attachmentName = message.file?.name || message.mediaName;
  const isImage = message.file?.type.startsWith('image/') || message.mediaType?.startsWith('image/');
  const fileInputId = `follow-up-file-${message.key}`;
  return <article className="follow-up-message-card">
    <header>
      <div><b>{index + 1}</b><strong>Mensagem {index + 1}</strong>{index === 0 && <small>Primeiro envio</small>}</div>
      <div className="follow-up-message-actions">
        <button type="button" disabled={!editable || index === 0} onClick={() => onMove(-1)} aria-label="Mover mensagem para cima"><ArrowUp size={16} /></button>
        <button type="button" disabled={!editable || index === count - 1} onClick={() => onMove(1)} aria-label="Mover mensagem para baixo"><ArrowDown size={16} /></button>
        <button type="button" className="danger" disabled={!editable || count === 1} onClick={onRemove} aria-label="Remover mensagem"><Trash2 size={16} /></button>
      </div>
    </header>
    <label className="follow-up-message-field">
      <span>Texto da mensagem <small>{message.text.length}/4096</small></span>
      <textarea value={message.text} disabled={!editable} rows={3} maxLength={4096} placeholder="Escreva a mensagem. Você pode usar {{saudacao}}, {{nome}} e a formatação do WhatsApp." onChange={(event) => onChange({ text: event.target.value })} />
      <small className="follow-up-field-hint">Aceita variáveis e formatação com *negrito*, _itálico_, ~tachado~ e `código`.</small>
    </label>
    <div className={`follow-up-message-options${index === 0 ? ' single' : ''}`}>
      {index > 0 && <label><span>Enviar depois de</span><div className="follow-up-delay-control"><Clock3 size={17} aria-hidden="true" /><input type="number" min={0} value={message.delayValue} aria-label="Tempo de espera" disabled={!editable} onChange={(event) => onChange({ delayValue: Math.max(0, Number(event.target.value)) })} /><select value={message.delayUnit} aria-label="Unidade do tempo de espera" disabled={!editable} onChange={(event) => onChange({ delayUnit: event.target.value as DelayUnit })}><option value="seconds">segundos</option><option value="minutes">minutos</option><option value="hours">horas</option></select></div></label>}
      <div className="follow-up-file"><span>Anexo</span><input id={fileInputId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain" disabled={!editable} onChange={(event) => onChange({ file: event.target.files?.[0], mediaKey: undefined, mediaName: event.target.files?.[0]?.name })} /><div className={attachmentName ? 'has-file' : ''}><label htmlFor={fileInputId}>{isImage ? <Image size={18} /> : <FileText size={18} />}<span><strong>{attachmentName || 'Adicionar imagem ou documento'}</strong><small>{attachmentName ? 'Anexo pronto para o envio' : 'Imagem, PDF, documento ou planilha'}</small></span></label>{attachmentName && editable && <button type="button" onClick={() => onChange({ file: undefined, mediaKey: undefined, mediaName: undefined, mediaType: undefined })} aria-label="Remover anexo"><X size={15} /></button>}</div></div>
    </div>
  </article>;
}

async function uploadDraftMessage(message: DraftMessage) {
  if (!message.file) return message;
  const contentType = message.file.type || 'application/octet-stream';
  const created = await api<Envelope<{ key: string; uploadUrl: string }>>('/media/uploads', {
    method: 'POST',
    body: JSON.stringify({ filename: message.file.name, contentType, sizeBytes: message.file.size }),
  });
  const upload = await fetch(created.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: message.file });
  if (!upload.ok) throw new Error(`Não foi possível enviar o anexo ${message.file.name}.`);
  return { ...message, mediaKey: created.data.key, mediaName: message.file.name, mediaType: contentType };
}

function messageFromStep(step: FollowUpStep): DraftMessage {
  const delay = displayDelay(step.delaySeconds);
  return { key: step.id || crypto.randomUUID(), text: step.text || '', delayValue: delay.value, delayUnit: delay.unit, mediaKey: step.mediaKey || undefined, mediaName: step.mediaName || undefined, mediaType: step.mediaType || undefined };
}

function emptyMessage(): DraftMessage {
  return { key: crypto.randomUUID(), text: '', delayValue: 5, delayUnit: 'minutes' };
}

function displayDelay(seconds: number): { value: number; unit: DelayUnit } {
  if (seconds > 0 && seconds % 3600 === 0) return { value: seconds / 3600, unit: 'hours' };
  if (seconds > 0 && seconds % 60 === 0) return { value: seconds / 60, unit: 'minutes' };
  return { value: seconds, unit: 'seconds' };
}

function delayInSeconds(value: number, unit: DelayUnit) {
  if (unit === 'hours') return Math.round(value * 3600);
  if (unit === 'minutes') return Math.round(value * 60);
  return Math.round(value);
}

function invalidateFollowUp(client: ReturnType<typeof useQueryClient>, conversationId: string) {
  void client.invalidateQueries({ queryKey: ['conversation-follow-up', conversationId] });
  void client.invalidateQueries({ queryKey: ['conversation', conversationId] });
  void client.invalidateQueries({ queryKey: ['conversations'] });
  void client.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
  void client.invalidateQueries({ queryKey: ['tasks'] });
}

function tomorrowAtNine() {
  const value = saoPauloCalendarDate(new Date());
  value.setDate(value.getDate() + 1);
  value.setHours(9, 0, 0, 0);
  return value;
}

function dateAndTime(dateKey: string, time: string) {
  if (!dateKey || !time) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(desiredUtc)) return null;
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = saoPauloDateParts(new Date(candidate));
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate += desiredUtc - representedUtc;
  }
  return new Date(candidate);
}

function saoPauloDateKey(value: Date) {
  const parts = saoPauloDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function calendarDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function saoPauloCalendarDate(value: Date) {
  const parts = saoPauloDateParts(value);
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function saoPauloTime(value: Date) {
  const parts = saoPauloDateParts(value);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function saoPauloDateParts(value: Date) {
  const parts = Object.fromEntries(saoPauloPartsFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function calendarDays(month: Date) {
  const first = startOfMonth(month);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}
