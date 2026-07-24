import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Mail, Pause, Play, Plus, Search, Send, Trash2, Users } from 'lucide-react';
import { api, apiErrorMessage, dateTime, initials, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import {
  contactIsSelected,
  contactMatchesSearch,
  normalizeContactSearch,
} from '../lib/contactSelection';

type Template = { id: string; name: string; subject: string; html: string; text?: string; updatedAt: string };
type Provider = {
  provider: 'mailgun';
  configured: boolean;
  webhookConfigured: boolean;
  region: 'US' | 'EU';
  domain: string | null;
  fromEmail: string | null;
  fromName: string;
  missing: string[];
};
type Contact = { id: string; name: string; email?: string; phone?: string };
type EmailCampaign = {
  id: string;
  name: string;
  channel: string;
  emailSubject?: string;
  status: string;
  createdAt: string;
  scheduledAt?: string;
  sentRecipientCount: number;
  stats?: Record<string, any>;
  _count?: { recipients: number };
  bubbles: Array<{ content: string }>;
};
type EmailDeleteTarget = {
  type: 'template' | 'campaign';
  id: string;
  name: string;
  status?: string;
};

export function EmailPage() {
  const client = useQueryClient();
  const [templateModal, setTemplateModal] = useState(false);
  const [campaignTemplate, setCampaignTemplate] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<EmailDeleteTarget | null>(null);
  const [view, setView] = useState<'templates' | 'campaigns'>('templates');
  const [actionError, setActionError] = useState('');
  const templates = useQuery({ queryKey: ['email-templates'], queryFn: () => api<Envelope<Template[]>>('/email/templates') });
  const provider = useQuery({ queryKey: ['email-provider'], queryFn: () => api<Envelope<Provider>>('/email/provider') });
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => api<Envelope<EmailCampaign[]>>('/campaigns') });
  const schedule = useMutation({
    mutationFn: (id: string) => api(`/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({}) }),
    onMutate: () => setActionError(''),
    onSuccess: () => client.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: (error) => setActionError(apiErrorMessage(error, 'Não foi possível iniciar a campanha')),
  });
  const status = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api(`/campaigns/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: (error) => setActionError(apiErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (target: EmailDeleteTarget) => api(
      target.type === 'template' ? `/email/templates/${target.id}` : `/campaigns/${target.id}`,
      { method: 'DELETE' },
    ),
    onSuccess: (_, target) => {
      setDeleting(null);
      client.invalidateQueries({ queryKey: target.type === 'template' ? ['email-templates'] : ['campaigns'] });
    },
  });

  if (templates.isLoading || provider.isLoading || campaigns.isLoading) return <PageLoading />;
  const templateData = templates.data?.data || [];
  const providerData = provider.data?.data;
  const emailCampaigns = (campaigns.data?.data || []).filter((campaign) => campaign.channel === 'EMAIL');

  return <div className="email-page">
    {actionError && <div className="inline-alert"><AlertCircle size={17} /><div><strong>Não foi possível concluir a ação</strong><p>{actionError}</p></div></div>}

    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Alternar visão de e-mail">
        <button className={view === 'templates' ? 'active' : ''} aria-pressed={view === 'templates'} onClick={() => setView('templates')}>Modelos</button>
        <button className={view === 'campaigns' ? 'active' : ''} aria-pressed={view === 'campaigns'} onClick={() => setView('campaigns')}>Campanhas</button>
      </div>
      {view === 'templates'
        ? <Button onClick={() => setTemplateModal(true)}><Plus size={15} />Novo modelo</Button>
        : <Button onClick={() => setCampaignTemplate(templateData[0] || null)} disabled={!templateData.length}><Plus size={15} />Nova campanha</Button>}
    </div>

    {view === 'templates'
      ? templateData.length
        ? <div className="template-grid">{templateData.map((template) => <article key={template.id}>
          <span><Mail size={18} /></span>
          <h3>{template.name}</h3>
          <strong>{template.subject}</strong>
          <p>{template.html.replace(/<[^>]+>/g, '').slice(0, 140)}</p>
          <footer><small>Atualizado {dateTime(template.updatedAt)}</small><div className="template-card-actions"><Button variant="secondary" onClick={() => setCampaignTemplate(template)}><Send size={14} />Usar</Button><button type="button" className="icon-button danger-icon" title="Excluir modelo" aria-label={`Excluir modelo ${template.name}`} onClick={() => setDeleting({ type: 'template', id: template.id, name: template.name })}><Trash2 size={16} /></button></div></footer>
        </article>)}</div>
        : <Empty icon={<FileText />} title="Nenhum modelo de e-mail" description="Crie um modelo com assunto e conteúdo para utilizá-lo em campanhas." action={<Button onClick={() => setTemplateModal(true)}>Criar modelo</Button>} />
      : emailCampaigns.length
        ? <div className="campaign-list email-campaign-list">{emailCampaigns.map((campaign) => <article key={campaign.id}>
          <div className="campaign-channel"><Mail size={18} /></div>
          <div className="campaign-info"><div><strong>{campaign.name}</strong><Status value={campaign.status} /></div><p>{campaign.emailSubject || 'Sem assunto'}</p><small>Criada em {dateTime(campaign.createdAt)}</small></div>
          <div className="campaign-numbers"><div><span>Destinatários</span><strong>{campaign.stats?.audience ?? campaign._count?.recipients ?? 0}</strong></div><div><span>Elegíveis</span><strong>{campaign.stats?.eligible ?? 0}</strong></div><div><span>Enviados</span><strong>{campaign.sentRecipientCount || 0}</strong></div></div>
          <div className="campaign-actions">
            {campaign.status === 'DRAFT' && <button className="campaign-start-button" title={providerData?.configured ? 'Validar e iniciar' : 'Configure o Mailgun para iniciar'} disabled={!providerData?.configured || schedule.isPending} onClick={() => schedule.mutate(campaign.id)}>{schedule.isPending && schedule.variables === campaign.id ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}<span>Iniciar</span></button>}
            {campaign.status === 'RUNNING' && <button title="Pausar" onClick={() => status.mutate({ id: campaign.id, action: 'pause' })}><Pause size={16} /></button>}
            {campaign.status === 'PAUSED' && <button title="Retomar" disabled={!providerData?.configured} onClick={() => status.mutate({ id: campaign.id, action: 'resume' })}><Play size={16} /></button>}
            <button type="button" className="campaign-delete-button" title="Excluir campanha" aria-label={`Excluir campanha ${campaign.name}`} onClick={() => setDeleting({ type: 'campaign', id: campaign.id, name: campaign.name, status: campaign.status })}><Trash2 size={16} /></button>
          </div>
        </article>)}</div>
        : <Empty icon={<Mail />} title="Nenhuma campanha de e-mail" description="Crie uma campanha usando um modelo e os contatos que possuem e-mail cadastrado." action={<Button onClick={() => setCampaignTemplate(templateData[0] || null)} disabled={!templateData.length}>Criar campanha</Button>} />}

    {templateModal && <TemplateModal onClose={() => setTemplateModal(false)} onCreated={() => { setTemplateModal(false); client.invalidateQueries({ queryKey: ['email-templates'] }); }} />}
    {deleting && <DeleteEmailItemModal
      target={deleting}
      loading={remove.isPending}
      error={remove.error ? apiErrorMessage(remove.error) : ''}
      onClose={() => !remove.isPending && setDeleting(null)}
      onConfirm={() => remove.mutate(deleting)}
    />}
    {campaignTemplate && <EmailCampaignModal
      templates={templateData}
      initialTemplate={campaignTemplate}
      onClose={() => setCampaignTemplate(null)}
      onCreated={() => {
        setCampaignTemplate(null);
        setView('campaigns');
        client.invalidateQueries({ queryKey: ['campaigns'] });
      }}
    />}
  </div>;
}

function DeleteEmailItemModal({ target, loading, error, onClose, onConfirm }: {
  target: EmailDeleteTarget;
  loading: boolean;
  error: string;
  onClose(): void;
  onConfirm(): void;
}) {
  const campaign = target.type === 'campaign';
  return <Modal title={campaign ? 'Excluir campanha' : 'Excluir modelo de e-mail'} onClose={onClose}>
    <div className="delete-confirm">
      <div className="delete-confirm-icon"><Trash2 size={22} /></div>
      <div>
        <h3>Excluir “{target.name}”?</h3>
        <p>{campaign
          ? 'A campanha deixará de aparecer no sistema e todos os envios ainda pendentes serão cancelados. O histórico já processado será preservado para auditoria.'
          : 'O modelo será removido definitivamente. Campanhas já criadas com ele não serão alteradas, pois armazenam uma cópia própria do conteúdo.'}</p>
      </div>
    </div>
    {error && <div className="form-error delete-error">{error}</div>}
    <div className="modal-actions delete-actions">
      <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
      <Button variant="danger" loading={loading} onClick={onConfirm}><Trash2 size={16} />Excluir {campaign ? 'campanha' : 'modelo'}</Button>
    </div>
  </Modal>;
}

function TemplateModal({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const [form, setForm] = useState({ name: '', subject: '', html: '' });
  const mutation = useMutation({ mutationFn: () => api('/email/templates', { method: 'POST', body: JSON.stringify(form) }), onSuccess: onCreated });
  return <Modal title="Novo modelo de e-mail" onClose={onClose} width={680}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}>
    <Field label="Nome interno" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
    <Field label="Assunto" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
    <label className="field"><span>Conteúdo HTML</span><textarea rows={10} value={form.html} onChange={(event) => setForm({ ...form, html: event.target.value })} placeholder="Olá {{nome}},…" required /></label>
    {mutation.isError && <p className="form-error">{apiErrorMessage(mutation.error)}</p>}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Salvar modelo</Button></div>
  </form></Modal>;
}

function EmailCampaignModal({ templates, initialTemplate, onClose, onCreated }: {
  templates: Template[];
  initialTemplate: Template;
  onClose(): void;
  onCreated(): void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [selectedSearches, setSelectedSearches] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Contact[]>([]);
  const [form, setForm] = useState({
    name: '',
    templateId: initialTemplate.id,
    subject: initialTemplate.subject,
    html: initialTemplate.html,
    contactMin: 5,
    contactMax: 15,
  });
  const contacts = useQuery({
    queryKey: ['email-campaign-contacts', debouncedSearch],
    queryFn: () => api<Envelope<Contact[]>>(`/contacts?limit=100&emailOnly=true&search=${encodeURIComponent(debouncedSearch)}`),
  });
  const selectedIds = useMemo(() => new Set(selected.map((contact) => contact.id)), [selected]);
  const excludedIds = useMemo(() => new Set(excluded.map((contact) => contact.id)), [excluded]);
  const currentContactSearch = normalizeContactSearch(debouncedSearch);
  const contactSearchPending = normalizeContactSearch(search) !== currentContactSearch;
  const currentSearchSelected = selectedSearches.includes(currentContactSearch);
  const available = (contacts.data?.data || []).filter((contact) => Boolean(contact.email));
  const create = useMutation({
    mutationFn: () => api('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        channel: 'email',
        emailSubject: form.subject,
        audience: {
          source: 'contacts',
          contactIds: selected.map((contact) => contact.id),
          contactSearches: selectedSearches,
          excludedContactIds: excluded.map((contact) => contact.id),
        },
        bubbles: [{ type: 'html', content: form.html }],
        cadence: {
          bubbleDelayMinSeconds: 1,
          bubbleDelayMaxSeconds: 1,
          contactDelayMinSeconds: Number(form.contactMin),
          contactDelayMaxSeconds: Number(form.contactMax),
          batchSize: 50,
          batchPauseMinSeconds: 60,
          batchPauseMaxSeconds: 120,
        },
      }),
    }),
    onSuccess: onCreated,
  });
  const changeTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setForm((current) => ({ ...current, templateId: id, subject: template.subject, html: template.html }));
  };
  const toggleAllSearchResults = () => {
    if (currentSearchSelected) {
      const remainingSearches = selectedSearches.filter((item) => item !== currentContactSearch);
      setSelectedSearches(remainingSearches);
      setExcluded((current) => current.filter((contact) =>
        remainingSearches.some((remaining) => contactMatchesSearch(contact, remaining))));
      return;
    }
    setSelectedSearches((current) => [...current, currentContactSearch]);
    setExcluded((current) => current.filter((contact) =>
      !contactMatchesSearch(contact, currentContactSearch)));
  };
  const removeSelectedSearch = (searchToRemove: string) => {
    const remainingSearches = selectedSearches.filter((item) => item !== searchToRemove);
    setSelectedSearches(remainingSearches);
    setExcluded((current) => current.filter((contact) =>
      remainingSearches.some((remaining) => contactMatchesSearch(contact, remaining))));
  };
  const toggleContact = (contact: Contact) => {
    const selectedBySearch = selectedSearches.some((item) => contactMatchesSearch(contact, item));
    const isSelected = contactIsSelected(contact, selectedIds, selectedSearches, excludedIds);
    if (isSelected) {
      setSelected((current) => current.filter((item) => item.id !== contact.id));
      if (selectedBySearch) {
        setExcluded((current) => current.some((item) => item.id === contact.id)
          ? current
          : [...current, contact]);
      }
      return;
    }
    setExcluded((current) => current.filter((item) => item.id !== contact.id));
    if (!selectedBySearch) {
      setSelected((current) => current.some((item) => item.id === contact.id)
        ? current
        : [...current, contact]);
    }
  };

  return <Modal title="Nova campanha de e-mail" onClose={onClose} width={820}><form className="modal-form email-campaign-form" onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }}>
    <div className="form-grid two">
      <Field label="Título da campanha" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <SelectField label="Modelo" value={form.templateId} onChange={(event) => changeTemplate(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</SelectField>
    </div>
    <Field label="Assunto" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
    <label className="field"><span>Conteúdo HTML</span><textarea rows={8} value={form.html} onChange={(event) => setForm({ ...form, html: event.target.value })} required /></label>
    <div className="email-contact-picker">
      <label className="campaign-contact-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contatos com e-mail…" /></label>
      <div className="campaign-contact-bulk-actions">
        <button
          type="button"
          className={currentSearchSelected ? 'active' : ''}
          disabled={contactSearchPending || contacts.isLoading || !available.length}
          onClick={toggleAllSearchResults}
        >
          <CheckCircle2 size={15} />
          {currentSearchSelected ? 'Desmarcar resultados desta busca' : 'Selecionar todos os resultados'}
        </button>
        <small>{contactSearchPending ? 'Atualizando filtro…' : currentContactSearch ? `Filtro: ${currentContactSearch}` : 'Todos os contatos com e-mail'}</small>
      </div>
      {selectedSearches.length > 0 && <div className="campaign-selected-searches">{selectedSearches.map((selectedSearch) => <span key={selectedSearch || '__all__'}><b>{selectedSearch ? `Todos com “${selectedSearch}”` : 'Todos os contatos com e-mail'}</b><button type="button" onClick={() => removeSelectedSearch(selectedSearch)} aria-label={`Remover seleção ${selectedSearch || 'de todos os contatos'}`}>×</button></span>)}</div>}
      {selected.length > 0 && <div className="campaign-selected-contacts">{selected.map((contact) => <span key={contact.id}><i>{initials(contact.name)}</i><b>{contact.name}</b><button type="button" onClick={() => toggleContact(contact)}>×</button></span>)}</div>}
      <div className="campaign-contact-results">{contacts.isLoading
        ? <div className="campaign-picker-state">Buscando contatos…</div>
        : available.length
          ? available.map((contact) => {
            const isSelected = contactIsSelected(contact, selectedIds, selectedSearches, excludedIds);
            return <button type="button" key={contact.id} className={isSelected ? 'selected' : ''} onClick={() => toggleContact(contact)}><span className="contact-avatar">{initials(contact.name)}</span><span><strong>{contact.name}</strong><small>{contact.email}</small></span><span>{isSelected ? <CheckCircle2 size={17} /> : <Plus size={17} />}</span></button>;
          })
          : <div className="campaign-picker-state">Nenhum contato com e-mail encontrado.</div>}</div>
      <small className="campaign-selection-count"><Users size={13} /> {selectedSearches.length
        ? `Todos os resultados de ${selectedSearches.length} busca(s)${selected.length ? ` + ${selected.length} individual(is)` : ''}${excluded.length ? `, exceto ${excluded.length}` : ''}`
        : `${selected.length} destinatário(s) selecionado(s)`}</small>
    </div>
    <div className="form-grid two">
      <Field label="Intervalo mínimo entre contatos (s)" type="number" min={1} value={form.contactMin} onChange={(event) => setForm({ ...form, contactMin: Number(event.target.value) })} />
      <Field label="Intervalo máximo entre contatos (s)" type="number" min={1} value={form.contactMax} onChange={(event) => setForm({ ...form, contactMax: Number(event.target.value) })} />
    </div>
    <div className="campaign-validation-note"><Mail size={18} /><div><strong>Rastreamento de e-mail</strong><p>O Mailgun atualizará entrega, abertura, clique, falha e descadastro pelo webhook configurado.</p></div></div>
    {create.isError && <p className="form-error">{apiErrorMessage(create.error)}</p>}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={create.isPending} disabled={!form.name.trim() || !form.subject.trim() || !form.html.trim() || (!selected.length && !selectedSearches.length)}><Send size={15} />Criar campanha</Button></div>
  </form></Modal>;
}
