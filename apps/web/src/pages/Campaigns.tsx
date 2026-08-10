import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Download, FileSpreadsheet, LoaderCircle, MessageSquareText, Pause, Play, Plus, Search, Send, ShieldCheck, Trash2, Upload, UserRoundCheck, Users, X } from 'lucide-react';
import { api, apiFetch, dateTime, initials, type Envelope } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import {
  contactIsSelected,
  contactMatchesSearch,
  normalizeContactSearch,
} from '../lib/contactSelection';

type CampaignProgress = {
  audience: number;
  sent: number;
  replied: number;
  remaining: number;
  failed: number;
  skipped: number;
};
type CampaignRecipient = {
  id: string;
  status: string;
  exclusionReason?: string;
  lastBubblePosition: number;
  sentAt?: string;
  repliedAt?: string;
  contact: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    jobTitle?: string;
    companies?: Array<{ company?: { name?: string } }>;
  };
  messages?: unknown;
  renderedMessages?: Array<{ type: string; content: string; mediaKey?: string }>;
};
type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  scheduledAt?: string;
  createdAt: string;
  stats: Record<string, any>;
  progress?: CampaignProgress;
  instance?: { id: string; name: string; status: string };
  bubbles: Array<{ content: string }>;
  recipients?: CampaignRecipient[];
  recipientsTruncated?: boolean;
  _count?: { recipients: number };
};
type Instance = { id: string; name: string; status: string; phone?: string; warmupProfile?: { currentDailyCap: number; sentToday: number } };
type CampaignContact = { id: string; name: string; phone?: string; email?: string };
type CsvPreview = {
  total: number;
  valid: number;
  invalid: number;
  columns: string[];
  rows: Array<{ row: number; name: string; phone: string; messages: string[]; hasWhatsapp: boolean }>;
  errors: Array<{ row: number; error: string }>;
};

function campaignProgress(campaign: Campaign): CampaignProgress {
  if (!campaign.progress && campaign.recipients?.length) {
    const count = (statuses: string[]) => campaign.recipients!.filter((recipient) => statuses.includes(recipient.status)).length;
    return {
      audience: Number(campaign._count?.recipients ?? campaign.recipients.length),
      sent: count(['SENT', 'DELIVERED', 'READ', 'REPLIED']),
      replied: count(['REPLIED']),
      remaining: count(['PENDING', 'QUEUED']),
      failed: count(['FAILED']),
      skipped: count(['SKIPPED', 'OPTED_OUT']),
    };
  }
  return campaign.progress || {
    audience: Number(campaign.stats?.audience ?? campaign._count?.recipients ?? 0),
    sent: Number(campaign.stats?.sent || 0),
    replied: Number(campaign.stats?.replied || 0),
    remaining: Number(campaign.stats?.pending || 0),
    failed: Number(campaign.stats?.failed || 0),
    skipped: Number(campaign.stats?.skipped || 0),
  };
}

function campaignRecipientMessages(campaign: Campaign, recipient: CampaignRecipient) {
  const storedMessages = Array.isArray(recipient.messages)
    ? recipient.messages
      .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === 'object' && !Array.isArray(message)))
      .map((message) => ({
        type: typeof message.type === 'string' ? message.type : 'text',
        content: typeof message.content === 'string' ? message.content : '',
        mediaKey: typeof message.mediaKey === 'string' ? message.mediaKey : undefined,
      }))
      .filter((message) => Boolean(message.content))
    : [];
  const messages = recipient.renderedMessages?.length
    ? recipient.renderedMessages
    : storedMessages.length
      ? storedMessages
      : campaign.bubbles.map((bubble) => ({ type: 'text', content: bubble.content }));
  if (recipient.renderedMessages?.length) return messages;

  const variables: Record<string, string> = {
    nome: recipient.contact.name || '',
    telefone: recipient.contact.phone || '',
    email: recipient.contact.email || '',
    empresa: recipient.contact.companies?.[0]?.company?.name || '',
    cargo: recipient.contact.jobTitle || '',
  };
  return messages.map((message) => ({
    ...message,
    content: message.content.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => variables[key] || ''),
  }));
}

async function downloadInvalidWhatsappNumbers(campaign: Pick<Campaign, 'id' | 'name'>) {
  const response = await apiFetch(`/campaigns/${campaign.id}/invalid-whatsapp-numbers.csv`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || 'Não foi possível baixar os números inválidos');
  }

  const fallbackName = `numeros-invalidos-${campaign.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || campaign.id}.csv`;
  const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/i)?.[1] || fallbackName;
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function useInvalidWhatsappDownload() {
  return useMutation({
    mutationFn: downloadInvalidWhatsappNumbers,
    onSuccess: () => toast.success('Números inválidos baixados.'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível baixar os números inválidos'),
  });
}

export function CampaignsPage() {
  const client = useQueryClient();
  const [modal, setModal] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [filter, setFilter] = useState<'all' | 'RUNNING' | 'SCHEDULED' | 'COMPLETED'>('all');
  const invalidWhatsappDownload = useInvalidWhatsappDownload();
  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<Envelope<Campaign[]>>('/campaigns'),
    refetchInterval: 5_000,
  });
  const instances = useQuery({ queryKey: ['instances'], queryFn: () => api<Envelope<Instance[]>>('/whatsapp/instances') });
  const schedule = useMutation({
    mutationFn: (id: string) => api(`/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      toast.success('Campanha iniciada.');
      return client.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
  const status = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api(`/campaigns/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_result, variables) => {
      toast.success(variables.action === 'pause' ? 'Campanha pausada.' : 'Campanha retomada.');
      return client.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Campanha excluída.');
      setDeleting(null);
      setDetailsId(null);
      client.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
  if (campaigns.isLoading) return <PageLoading />;
  const allCampaigns = (campaigns.data?.data || []).filter((campaign) => campaign.channel !== 'EMAIL');
  const connectedInstances = (instances.data?.data || []).filter((instance) => instance.status === 'CONNECTED');
  const data = filter === 'all' ? allCampaigns : allCampaigns.filter((campaign) => campaign.status === filter);
  const sent = allCampaigns.reduce((sum, item) => sum + Number(item.stats?.sent || 0), 0);
  const replied = allCampaigns.reduce((sum, item) => sum + Number(item.stats?.replied || 0), 0);
  const responseRate = sent > 0 ? `${((replied / sent) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
  return <div className="campaigns-page">
    <section className="campaign-overview">
      <div><span className="metric-icon violet"><MessageSquareText size={19} /></span><p><small>Campanhas ativas</small><strong>{allCampaigns.filter((item) => ['RUNNING', 'SCHEDULED'].includes(item.status)).length}</strong></p></div>
      <div><span className="metric-icon blue"><Users size={19} /></span><p><small>Contatos alcançados</small><strong>{sent}</strong></p></div>
      <div><span className="metric-icon green"><CheckCircle2 size={19} /></span><p><small>Taxa de resposta</small><strong>{responseRate}</strong></p></div>
      <div><span className="metric-icon amber"><ShieldCheck size={19} /></span><p><small>Opt-outs</small><strong>{allCampaigns.reduce((sum, item) => sum + Number(item.stats?.optedOut || 0), 0)}</strong></p></div>
    </section>
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Filtrar campanhas">
        <button className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
        <button className={filter === 'RUNNING' ? 'active' : ''} aria-pressed={filter === 'RUNNING'} onClick={() => setFilter('RUNNING')}>Em execução</button>
        <button className={filter === 'SCHEDULED' ? 'active' : ''} aria-pressed={filter === 'SCHEDULED'} onClick={() => setFilter('SCHEDULED')}>Agendadas</button>
        <button className={filter === 'COMPLETED' ? 'active' : ''} aria-pressed={filter === 'COMPLETED'} onClick={() => setFilter('COMPLETED')}>Concluídas</button>
      </div>
      <Button onClick={() => setModal(true)} disabled={!connectedInstances.length}><Plus size={15} />Nova campanha</Button>
    </div>
    {!instances.isLoading && !connectedInstances.length && <div className="inline-alert"><AlertTriangle size={17} /><div><strong>Conecte um número antes de criar campanhas.</strong><p>Vá até Conexões e conecte uma instância.</p></div></div>}
    {data.length ? <div className="campaign-list">{data.map((campaign) => {
      const progress = campaignProgress(campaign);
      return <article key={campaign.id} onClick={() => setDetailsId(campaign.id)}>
      <div className="campaign-channel"><MessageSquareText size={18} /></div>
      <div className="campaign-info"><div><strong>{campaign.name}</strong><Status value={campaign.status} /></div><p>{campaign.bubbles?.[0]?.content || (campaign.stats?.audienceSource === 'csv' ? 'Mensagens personalizadas pelo CSV' : 'Sem prévia de conteúdo')}</p><small>{campaign.instance?.name || 'Sem número de envio'} · Criada em {dateTime(campaign.createdAt)}</small></div>
      <div className="campaign-numbers"><div><span>Enviados</span><strong>{progress.sent}</strong></div><div><span>Responderam</span><strong>{progress.replied}</strong></div><div><span>Faltam</span><strong>{progress.remaining}</strong></div></div>
      <div className="campaign-actions">
        {campaign.status === 'DRAFT' && <button className="campaign-start-button" title="Validar contatos e iniciar" disabled={schedule.isPending} onClick={(event) => { event.stopPropagation(); schedule.mutate(campaign.id); }}>{schedule.isPending && schedule.variables === campaign.id ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}<span>Iniciar</span></button>}
        {campaign.status === 'RUNNING' && <button title="Pausar" onClick={(event) => { event.stopPropagation(); status.mutate({ id: campaign.id, action: 'pause' }); }}><Pause size={16} /></button>}
        {campaign.status === 'PAUSED' && <button title="Retomar" onClick={(event) => { event.stopPropagation(); status.mutate({ id: campaign.id, action: 'resume' }); }}><Play size={16} /></button>}
        <button
          type="button"
          className="campaign-invalid-download-button"
          title="Baixar números sem WhatsApp"
          aria-label={`Baixar números sem WhatsApp da campanha ${campaign.name}`}
          disabled={invalidWhatsappDownload.isPending && invalidWhatsappDownload.variables?.id === campaign.id}
          onClick={(event) => {
            event.stopPropagation();
            invalidWhatsappDownload.mutate(campaign);
          }}
        >
          {invalidWhatsappDownload.isPending && invalidWhatsappDownload.variables?.id === campaign.id
            ? <LoaderCircle size={16} className="spin" />
            : <Download size={16} />}
        </button>
        <button type="button" className="campaign-delete-button" title="Excluir campanha" aria-label={`Excluir campanha ${campaign.name}`} onClick={(event) => { event.stopPropagation(); setDeleting(campaign); }}><Trash2 size={16} /></button>
        <ChevronRight size={18} />
      </div>
    </article>;
    })}</div> : <Empty icon={<MessageSquareText />} title={allCampaigns.length ? 'Nenhuma campanha neste filtro' : 'Nenhuma campanha criada'} description="Crie uma campanha com audiência consentida, mensagens em bolhas e cadência controlada." action={<Button onClick={() => setModal(true)} disabled={!connectedInstances.length}>Criar campanha</Button>} />}
    {modal && <CampaignModal instances={connectedInstances} onClose={() => setModal(false)} onCreated={() => { setModal(false); client.invalidateQueries({ queryKey: ['campaigns'] }); }} />}
    {detailsId && <CampaignDetails campaignId={detailsId} onClose={() => setDetailsId(null)} />}
    {deleting && <DeleteCampaignModal
      campaign={deleting}
      loading={remove.isPending}
      onClose={() => !remove.isPending && setDeleting(null)}
      onConfirm={() => remove.mutate(deleting.id)}
    />}
  </div>;
}

function DeleteCampaignModal({ campaign, loading, onClose, onConfirm }: {
  campaign: Campaign;
  loading: boolean;
  onClose(): void;
  onConfirm(): void;
}) {
  return <Modal title="Excluir campanha" onClose={onClose}>
    <div className="delete-confirm">
      <div className="delete-confirm-icon"><Trash2 size={22} /></div>
      <div>
        <h3>Excluir “{campaign.name}”?</h3>
        <p>A campanha deixará de aparecer no sistema e todos os envios ainda pendentes serão cancelados. Mensagens e resultados já processados serão preservados para auditoria.</p>
      </div>
    </div>
    <div className="modal-actions delete-actions">
      <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
      <Button variant="danger" loading={loading} onClick={onConfirm}><Trash2 size={16} />Excluir campanha</Button>
    </div>
  </Modal>;
}

function CampaignModal({ instances, onClose, onCreated }: { instances: Instance[]; onClose(): void; onCreated(): void }) {
  const [source, setSource] = useState<'contacts' | 'csv'>('contacts');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<CampaignContact[]>([]);
  const [selectedSearches, setSelectedSearches] = useState<string[]>([]);
  const [excludedContacts, setExcludedContacts] = useState<CampaignContact[]>([]);
  const [messages, setMessages] = useState(['']);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvName, setCsvName] = useState('');
  const [fileDragging, setFileDragging] = useState(false);
  const [csvVisibleRows, setCsvVisibleRows] = useState(100);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const chooseFileRef = useRef<(file?: File) => void>(() => undefined);
  const debouncedSearch = useDebouncedValue(contactSearch);
  const [form, setForm] = useState({
    name: '',
    instanceId: instances[0]?.id || '',
    bubbleMin: 3,
    bubbleMax: 7,
    contactMin: 15,
    contactMax: 30,
    batchSize: 20,
    pauseMin: 120,
    pauseMax: 300,
  });
  const contacts = useQuery({
    queryKey: ['campaign-contacts', debouncedSearch],
    queryFn: () => api<Envelope<CampaignContact[]>>(`/contacts?limit=100&search=${encodeURIComponent(debouncedSearch)}`),
    enabled: source === 'contacts',
  });
  const selectedIds = useMemo(() => new Set(selectedContacts.map((contact) => contact.id)), [selectedContacts]);
  const excludedIds = useMemo(() => new Set(excludedContacts.map((contact) => contact.id)), [excludedContacts]);
  const currentContactSearch = normalizeContactSearch(debouncedSearch);
  const contactSearchPending = normalizeContactSearch(contactSearch) !== currentContactSearch;
  const currentSearchSelected = selectedSearches.includes(currentContactSearch);
  const preview = useMutation({
    mutationFn: ({ file, instanceId }: { file: File; instanceId: string }) => api<Envelope<CsvPreview>>(`/campaigns/csv/preview?instanceId=${encodeURIComponent(instanceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      body: file,
    }),
  });
  const create = useMutation({
    mutationFn: () => {
      const cadence = {
        bubbleDelayMinSeconds: Number(form.bubbleMin),
        bubbleDelayMaxSeconds: Number(form.bubbleMax),
        contactDelayMinSeconds: Number(form.contactMin),
        contactDelayMaxSeconds: Number(form.contactMax),
        batchSize: Number(form.batchSize),
        batchPauseMinSeconds: Number(form.pauseMin),
        batchPauseMaxSeconds: Number(form.pauseMax),
      };
      if (source === 'csv') {
        const query = new URLSearchParams({
          name: form.name,
          instanceId: form.instanceId,
          ...Object.fromEntries(Object.entries(cadence).map(([key, value]) => [key, String(value)])),
        });
        return api(`/campaigns/csv?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv; charset=utf-8' },
          body: csvFile,
        });
      }
      return api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          instanceId: form.instanceId,
          audience: {
            source,
            contactIds: selectedContacts.map((contact) => contact.id),
            contactSearches: selectedSearches,
            excludedContactIds: excludedContacts.map((contact) => contact.id),
          },
          bubbles: messages.filter((message) => message.trim()).map((content) => ({ type: 'text', content })),
          cadence,
        }),
      });
    },
    onSuccess: () => {
      toast.success('Campanha criada.');
      onCreated();
    },
  });

  const chooseFile = async (file?: File) => {
    preview.reset();
    setCsvFile(null);
    setCsvName('');
    setCsvVisibleRows(100);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && !['text/csv', 'application/csv'].includes(file.type)) {
      toast.warning('Selecione um arquivo no formato CSV.');
      return;
    }
    setCsvFile(file);
    setCsvName(file.name);
  };
  chooseFileRef.current = chooseFile;

  useEffect(() => {
    if (csvFile && form.instanceId) preview.mutate({ file: csvFile, instanceId: form.instanceId });
  }, [csvFile, form.instanceId]);

  useEffect(() => {
    const containsFiles = (event: globalThis.DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');
    const enter = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setFileDragging(true);
    };
    const over = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setFileDragging(false);
    };
    const drop = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setFileDragging(false);
      setSource('csv');
      chooseFileRef.current(event.dataTransfer?.files?.[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const dropOnField = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setFileDragging(false);
    void chooseFile(event.dataTransfer.files?.[0]);
  };
  const downloadCsvTemplate = () => {
    const csv = [
      'nome;telefone;mensagem;mensagem_2',
      'Maria Silva;(45) 99922-5389;Olá Maria, tudo bem?;Posso apresentar nossa solução?',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'modelo-campanha-bzs-one.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const updateMessage = (index: number, value: string) => setMessages((current) => current.map((message, position) => position === index ? value : message));
  const addVariable = (variable: string) => setMessages((current) => current.map((message, index) => index === current.length - 1 ? `${message}${message ? ' ' : ''}${variable}` : message));
  const toggleAllSearchResults = () => {
    if (currentSearchSelected) {
      const remainingSearches = selectedSearches.filter((search) => search !== currentContactSearch);
      setSelectedSearches(remainingSearches);
      setExcludedContacts((current) => current.filter((contact) =>
        remainingSearches.some((search) => contactMatchesSearch(contact, search))));
      return;
    }
    setSelectedSearches((current) => [...current, currentContactSearch]);
    setExcludedContacts((current) => current.filter((contact) =>
      !contactMatchesSearch(contact, currentContactSearch)));
  };
  const toggleContact = (contact: CampaignContact) => {
    const selectedBySearch = selectedSearches.some((search) => contactMatchesSearch(contact, search));
    const selected = contactIsSelected(contact, selectedIds, selectedSearches, excludedIds);
    if (selected) {
      setSelectedContacts((current) => current.filter((item) => item.id !== contact.id));
      if (selectedBySearch) {
        setExcludedContacts((current) => current.some((item) => item.id === contact.id)
          ? current
          : [...current, contact]);
      }
      return;
    }
    setExcludedContacts((current) => current.filter((item) => item.id !== contact.id));
    if (!selectedBySearch) {
      setSelectedContacts((current) => current.some((item) => item.id === contact.id)
        ? current
        : [...current, contact]);
    }
  };
  const csvReady = Boolean(csvFile && preview.data?.data.valid);
  const validCsvRows = (preview.data?.data.rows || []).filter((row) => row.hasWhatsapp);
  const invalidCsvRows = (preview.data?.data.rows || []).filter((row) => !row.hasWhatsapp);
  const csvFormatErrors = (preview.data?.data.errors || []).filter((error) => error.error !== 'Número não possui WhatsApp');
  const canSubmit = Boolean(
    form.name.trim()
    && form.instanceId
    && (source === 'contacts'
      ? (selectedContacts.length || selectedSearches.length) && messages.some((message) => message.trim())
      : csvReady),
  );

  return <Modal title="Nova campanha de WhatsApp" width={960} onClose={onClose}>
    <form className="modal-form campaign-create-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (canSubmit) create.mutate(); }}>
      {fileDragging && <div className="campaign-page-drop-overlay"><div><Upload size={34} /><strong>Solte o arquivo CSV aqui</strong><span>O arquivo será importado para esta campanha.</span></div></div>}
      <section className="campaign-form-section">
        <div className="campaign-form-section-title"><span>1</span><div><h3>Informações da campanha</h3><p>Identifique a campanha e escolha a conexão responsável pelos envios.</p></div></div>
        <div className="form-grid">
          <Field label="Título" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Prospecção — Energia SP" required />
          <SelectField label="Número de envio" value={form.instanceId} onChange={(event) => setForm({ ...form, instanceId: event.target.value })} required>
            {instances.map((instance) => <option value={instance.id} key={instance.id}>{instance.name} · {instance.phone || 'Conectado'}</option>)}
          </SelectField>
        </div>
      </section>

      <section className="campaign-form-section">
        <div className="campaign-form-section-title"><span>2</span><div><h3>Contatos</h3><p>Selecione contatos salvos ou importe um CSV que já contenha as mensagens.</p></div></div>
        <div className="campaign-source-tabs" role="group" aria-label="Origem dos contatos">
          <button type="button" className={source === 'contacts' ? 'active' : ''} onClick={() => setSource('contacts')}><UserRoundCheck size={17} />Contatos salvos</button>
          <button type="button" className={source === 'csv' ? 'active' : ''} onClick={() => setSource('csv')}><FileSpreadsheet size={17} />Importar CSV</button>
        </div>

        {source === 'contacts' ? <div className="campaign-contact-picker">
          <label className="campaign-contact-search"><Search size={16} /><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Buscar contato por nome, telefone ou e-mail…" /></label>
          <div className="campaign-contact-bulk-actions">
            <button
              type="button"
              className={currentSearchSelected ? 'active' : ''}
              disabled={contactSearchPending || contacts.isLoading || !contacts.data?.data.length}
              onClick={toggleAllSearchResults}
            >
              <CheckCircle2 size={15} />
              {currentSearchSelected ? 'Desmarcar resultados desta busca' : 'Selecionar todos os resultados'}
            </button>
            <small>{contactSearchPending ? 'Atualizando filtro…' : currentContactSearch ? `Filtro: ${currentContactSearch}` : 'Todos os contatos acessíveis'}</small>
          </div>
          {selectedSearches.length > 0 && <div className="campaign-selected-searches">{selectedSearches.map((search) => <span key={search || '__all__'}><b>{search ? `Todos com “${search}”` : 'Todos os contatos'}</b><button type="button" onClick={() => {
            const remainingSearches = selectedSearches.filter((item) => item !== search);
            setSelectedSearches(remainingSearches);
            setExcludedContacts((current) => current.filter((contact) =>
              remainingSearches.some((remaining) => contactMatchesSearch(contact, remaining))));
          }} aria-label={`Remover seleção ${search || 'de todos os contatos'}`}><X size={13} /></button></span>)}</div>}
          {selectedContacts.length > 0 && <div className="campaign-selected-contacts">{selectedContacts.map((contact) => <span key={contact.id}><i>{initials(contact.name)}</i><b>{contact.name}</b><button type="button" onClick={() => toggleContact(contact)} aria-label={`Remover ${contact.name}`}><X size={13} /></button></span>)}</div>}
          <div className="campaign-contact-results">
            {contacts.isLoading ? <div className="campaign-picker-state">Buscando contatos…</div> : contacts.data?.data.length ? contacts.data.data.map((contact) => {
              const selected = contactIsSelected(contact, selectedIds, selectedSearches, excludedIds);
              return <button type="button" key={contact.id} className={selected ? 'selected' : ''} onClick={() => toggleContact(contact)}>
                <span className="contact-avatar">{initials(contact.name)}</span>
                <div><strong>{contact.name}</strong><small>{contact.phone || contact.email || 'Sem telefone'}</small></div>
                <i>{selected ? <CheckCircle2 size={17} /> : <Plus size={17} />}</i>
              </button>;
            }) : <div className="campaign-picker-state">Nenhum contato encontrado.</div>}
          </div>
          <small className="campaign-selection-count">{selectedSearches.length
            ? `Todos os resultados de ${selectedSearches.length} busca(s) selecionados${selectedContacts.length ? ` + ${selectedContacts.length} individual(is)` : ''}${excludedContacts.length ? `, exceto ${excludedContacts.length}` : ''}`
            : `${selectedContacts.length} contato(s) selecionado(s)`}</small>
        </div> : <div className="campaign-csv-area">
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
          <button type="button" className={`campaign-file-drop ${csvName ? 'has-file' : ''}`} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={dropOnField}>
            <span>{csvName ? <FileSpreadsheet size={24} /> : <Upload size={24} />}</span>
            <div><strong>{csvName || 'Selecionar ou arrastar um arquivo CSV'}</strong><small>Sem limite definido pelo sistema. Colunas obrigatórias: telefone e mensagem. Use mensagem_2, mensagem_3… para enviar mais bolhas.</small></div>
          </button>
          <button type="button" className="campaign-template-download" onClick={downloadCsvTemplate}><Download size={15} /><span><strong>Baixar modelo CSV</strong><small>Planilha de exemplo pronta para preencher</small></span></button>
          <div className="campaign-csv-help"><ShieldCheck size={16} /><p>O sistema consulta a Evolution usando o <strong>número de envio selecionado</strong> e separa os contatos que possuem ou não WhatsApp.</p></div>
          {preview.isPending && <div className="campaign-picker-state">Consultando os números na Evolution…</div>}
          {preview.data && <div className="campaign-csv-preview">
            <header><div><strong>{preview.data.data.valid}</strong><span>com WhatsApp</span></div><div className={preview.data.data.invalid ? 'has-errors' : ''}><strong>{preview.data.data.invalid}</strong><span>sem WhatsApp ou inválidos</span></div><div><strong>{validCsvRows.reduce((total, row) => total + row.messages.length, 0)}</strong><span>mensagens que poderão ser enviadas</span></div></header>
            <div className="campaign-csv-validation-groups">
              <section className="valid"><h4><CheckCircle2 size={15} />Com WhatsApp <span>{validCsvRows.length}</span></h4><div>{validCsvRows.slice(0, csvVisibleRows).map((row) => <article key={row.row}><span className="contact-avatar">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.phone} · {row.messages.length} mensagem(ns)</small></div><span className="campaign-whatsapp-result valid">Válido</span></article>)}{!validCsvRows.length && <p className="campaign-validation-empty">Nenhum número com WhatsApp.</p>}</div></section>
              <section className="invalid"><h4><X size={15} />Sem WhatsApp <span>{invalidCsvRows.length}</span></h4><div>{invalidCsvRows.slice(0, csvVisibleRows).map((row) => <article key={row.row}><span className="contact-avatar">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.phone}</small></div><span className="campaign-whatsapp-result invalid">Ignorado</span></article>)}{!invalidCsvRows.length && <p className="campaign-validation-empty">Nenhum número sem WhatsApp.</p>}</div></section>
            </div>
            {(validCsvRows.length > csvVisibleRows || invalidCsvRows.length > csvVisibleRows) && <button type="button" className="campaign-preview-more" onClick={() => setCsvVisibleRows((current) => current + 100)}>Mostrar mais contatos</button>}
            {csvFormatErrors.length > 0 && <details><summary>Ver {csvFormatErrors.length} linha(s) com formato inválido</summary>{csvFormatErrors.slice(0, 100).map((error) => <p key={`${error.row}-${error.error}`}>Linha {error.row}: {error.error}</p>)}</details>}
          </div>}
        </div>}
      </section>

      {source === 'contacts' && <section className="campaign-form-section">
        <div className="campaign-form-section-title"><span>3</span><div><h3>Mensagens</h3><p>Crie uma ou mais mensagens. Elas serão enviadas na ordem exibida.</p></div></div>
        <div className="campaign-message-list">{messages.map((message, index) => <div className="campaign-message-item" key={index}>
          <header><strong>Mensagem {index + 1}</strong>{messages.length > 1 && <button type="button" onClick={() => setMessages((current) => current.filter((_, position) => position !== index))}><Trash2 size={15} />Remover</button>}</header>
          <textarea rows={4} value={message} onChange={(event) => updateMessage(index, event.target.value)} placeholder={index === 0 ? 'Olá {{nome}}, tudo bem?' : 'Digite a próxima mensagem…'} required />
        </div>)}</div>
        <div className="campaign-message-tools">
          <Button type="button" variant="secondary" onClick={() => setMessages((current) => [...current, ''])}><Plus size={15} />Adicionar mensagem</Button>
          <div className="variable-list"><span>Variáveis:</span><button type="button" onClick={() => addVariable('{{nome}}')}>{'{{nome}}'}</button><button type="button" onClick={() => addVariable('{{empresa}}')}>{'{{empresa}}'}</button><button type="button" onClick={() => addVariable('{{cargo}}')}>{'{{cargo}}'}</button></div>
        </div>
      </section>}

      <section className="campaign-form-section">
        <div className="campaign-form-section-title"><span>{source === 'contacts' ? '4' : '3'}</span><div><h3>Intervalos de envio</h3><p>Defina tempos aleatórios para deixar a cadência mais natural.</p></div></div>
        <div className="campaign-cadence-grid">
          <div><h4>Entre cada mensagem</h4><div className="form-grid"><Field label="Mínimo (segundos)" type="number" min={1} value={form.bubbleMin} onChange={(event) => setForm({ ...form, bubbleMin: Number(event.target.value) })} required /><Field label="Máximo (segundos)" type="number" min={1} value={form.bubbleMax} onChange={(event) => setForm({ ...form, bubbleMax: Number(event.target.value) })} required /></div></div>
          <div><h4>Entre cada contato</h4><div className="form-grid"><Field label="Mínimo (segundos)" type="number" min={1} value={form.contactMin} onChange={(event) => setForm({ ...form, contactMin: Number(event.target.value) })} required /><Field label="Máximo (segundos)" type="number" min={1} value={form.contactMax} onChange={(event) => setForm({ ...form, contactMax: Number(event.target.value) })} required /></div></div>
        </div>
        <details className="campaign-advanced-cadence"><summary>Configurações avançadas de lote</summary><div className="form-grid three"><Field label="Contatos por lote" type="number" min={1} value={form.batchSize} onChange={(event) => setForm({ ...form, batchSize: Number(event.target.value) })} /><Field label="Pausa mínima (s)" type="number" min={1} value={form.pauseMin} onChange={(event) => setForm({ ...form, pauseMin: Number(event.target.value) })} /><Field label="Pausa máxima (s)" type="number" min={1} value={form.pauseMax} onChange={(event) => setForm({ ...form, pauseMax: Number(event.target.value) })} /></div></details>
      </section>

      <div className="campaign-validation-note"><ShieldCheck size={18} /><div><strong>Validação obrigatória antes do envio</strong><p>O sistema repete a consulta à Evolution API e ignora automaticamente contatos bloqueados, descadastrados, duplicados ou cujo número não possua WhatsApp.</p></div></div>
      <div className="modal-actions campaign-form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={create.isPending} disabled={!canSubmit}><MessageSquareText size={16} />Criar campanha</Button></div>
    </form>
  </Modal>;
}

function CampaignDetails({ campaignId, onClose }: { campaignId: string; onClose(): void }) {
  const invalidWhatsappDownload = useInvalidWhatsappDownload();
  const details = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api<Envelope<Campaign>>(`/campaigns/${campaignId}`),
    refetchInterval: 3_000,
  });
  const campaign = details.data?.data;
  const progress = campaign ? campaignProgress(campaign) : null;
  const processed = progress ? progress.sent + progress.failed + progress.skipped : 0;
  const progressPercent = progress?.audience
    ? Math.min(100, Math.round((processed / progress.audience) * 100))
    : 0;

  return <Modal title={campaign?.name || 'Detalhes da campanha'} width={900} onClose={onClose}>
    {details.isLoading
      ? <PageLoading />
      : details.isError || !campaign || !progress
        ? <div className="campaign-detail-error">Não foi possível carregar os detalhes desta campanha.</div>
        : <div className="campaign-detail">
          <div className="detail-status">
            <Status value={campaign.status} />
            <span>{campaign.instance?.name || 'Sem número de envio'}</span>
            <span>Agendada em {dateTime(campaign.scheduledAt)}</span>
            <div className="campaign-detail-actions">
              {['RUNNING', 'SCHEDULED'].includes(campaign.status) && <span className="campaign-detail-live"><i />Atualização automática</span>}
              <Button
                variant="secondary"
                loading={invalidWhatsappDownload.isPending}
                onClick={() => invalidWhatsappDownload.mutate(campaign)}
              >
                <Download size={15} />Baixar números inválidos
              </Button>
            </div>
          </div>
          <div className="detail-grid campaign-progress-grid">
            <div><Users /><span>Audiência</span><strong>{progress.audience}</strong></div>
            <div><Send /><span>Enviados</span><strong>{progress.sent}</strong></div>
            <div><MessageSquareText /><span>Responderam</span><strong>{progress.replied}</strong></div>
            <div><Clock3 /><span>Faltam enviar</span><strong>{progress.remaining}</strong></div>
          </div>
          <div className="campaign-progress-summary">
            <div><i style={{ transform: `scaleX(${progressPercent / 100})` }} /></div>
            <p><strong>{progressPercent}% processado</strong><span>{progress.failed ? `${progress.failed} falharam · ` : ''}{progress.skipped ? `${progress.skipped} ignorados · ` : ''}{progress.remaining} aguardando envio</span></p>
          </div>

          {campaign.bubbles.length > 0 && <>
            <h3>Sequência configurada</h3>
            <div className="bubble-preview">{campaign.bubbles.map((bubble, index) => <div key={index}><small>Mensagem {index + 1}</small><p>{bubble.content}</p></div>)}</div>
          </>}

          <div className="campaign-recipient-heading">
            <div><h3>Mensagens por contato</h3><p>Conteúdo final após aplicar as variáveis de cada destinatário.</p></div>
            <span>{campaign.recipients?.length || 0} de {progress.audience}</span>
          </div>
          <div className="campaign-recipient-list">
            {campaign.recipients?.length
              ? campaign.recipients.map((recipient) => {
                const messages = campaignRecipientMessages(campaign, recipient);
                return <article key={recipient.id}>
                  <header>
                    <span className="contact-avatar">{initials(recipient.contact.name)}</span>
                    <div><strong>{recipient.contact.name}</strong><small>{recipient.contact.phone || recipient.contact.email || 'Sem contato informado'}</small></div>
                    <Status value={recipient.status} />
                  </header>
                  <div className="campaign-recipient-messages">
                    {messages.length
                      ? messages.map((message, index) => <div key={`${recipient.id}-${index}`}>
                        <small>Mensagem {index + 1}{recipient.lastBubblePosition >= index ? ' · enviada' : ''}</small>
                        <p>{message.content}</p>
                      </div>)
                      : <p className="campaign-recipient-empty">Nenhuma mensagem configurada para este contato.</p>}
                  </div>
                  {(recipient.sentAt || recipient.repliedAt || recipient.exclusionReason) && <footer>
                    {recipient.sentAt && <span>Enviado em {dateTime(recipient.sentAt)}</span>}
                    {recipient.repliedAt && <span>Respondeu em {dateTime(recipient.repliedAt)}</span>}
                    {recipient.exclusionReason && <span className="negative">{recipient.exclusionReason}</span>}
                  </footer>}
                </article>;
              })
              : <p className="campaign-recipient-empty">Nenhum destinatário foi adicionado à campanha.</p>}
          </div>
          {campaign.recipientsTruncated && <p className="campaign-recipient-truncated">Mostrando os primeiros 500 contatos. Os contadores acima consideram toda a campanha.</p>}
        </div>}
  </Modal>;
}
