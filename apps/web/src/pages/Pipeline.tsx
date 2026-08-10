import { memo, type DragEvent, type FormEvent, type KeyboardEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  Building2, CalendarDays, ChevronDown, CircleDollarSign, Clock3, ExternalLink, FileText, Filter,
  LayoutGrid, Link2, Mail, Paperclip, Phone, Plus, Search, Tag, Upload, UserRound, UsersRound, X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage, apiUrl, dateTime, initials, money, type Envelope } from '../lib/api';
import type { Company, Contact, Opportunity, Pipeline, Stage } from '../lib/types';
import { Button, Field, Modal, PageLoading, SelectField } from '../components/ui';
import { toast } from '../lib/toast';
import { useAuth } from '../App';

type OpportunityDetails = Opportunity & {
  status: string;
  currency: string;
  source?: string;
  expectedCloseAt?: string;
  proposalUrl?: string | null;
  proposalAssetId?: string | null;
  proposalAddedAt?: string | null;
  proposalAsset?: { id: string; filename: string; contentType: string; sizeBytes: number } | null;
  createdAt: string;
  company?: Company & { phone?: string; address?: Record<string, string> };
  pipeline: { id: string; name: string };
  stage: { id: string; name: string; color: string };
  team?: { id: string; name: string; color: string };
  contacts: Array<{ isPrimary: boolean; contact: Contact }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: string }>;
  activities: Array<{ id: string; title: string; type: string; occurredAt: string }>;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
};

const OpportunityCard = memo(function OpportunityCard({ opportunity, onOpen, overlay = false }: { opportunity: Opportunity; onOpen?: () => void; overlay?: boolean }) {
  const drag = useDraggable({ id: opportunity.id, data: { stageId: opportunity.stageId }, disabled: overlay });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerMoved = useRef(false);
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
      event.preventDefault();
      onOpen?.();
    }
  };
  const openFromClick = () => {
    if (pointerMoved.current) {
      pointerMoved.current = false;
      return;
    }
    onOpen?.();
  };
  return <article
    ref={drag.setNodeRef}
    {...(!overlay ? drag.listeners : {})}
    {...(!overlay ? drag.attributes : {})}
    className={`opportunity-card ${drag.isDragging ? 'dragging' : ''} ${overlay ? 'drag-overlay-card' : ''}`}
    style={{ transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined }}
    onPointerDownCapture={(event) => {
      pointerStart.current = { x: event.clientX, y: event.clientY };
      pointerMoved.current = false;
    }}
    onPointerMoveCapture={(event) => {
      if (!pointerStart.current) return;
      const distance = Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y);
      if (distance >= 4) pointerMoved.current = true;
    }}
    onClick={openFromClick}
    onKeyDown={openFromKeyboard}
    role={onOpen ? 'button' : undefined}
    tabIndex={onOpen ? 0 : undefined}
  >
    <div className="opportunity-top"><span className="company-mini"><Building2 size={15} />{opportunity.company?.name || 'Sem empresa'}</span></div>
    <h3>{opportunity.title}</h3>
    <strong>{money(opportunity.valueCents)}</strong>
    <div className="opportunity-meta"><span><CalendarDays size={14} />{dateTime(opportunity.updatedAt).split(' ')[0]}</span><span className="avatar xs">{initials(opportunity.owner?.name || 'NA')}</span></div>
  </article>;
});

const StageColumn = memo(function StageColumn({ stage, onOpen }: { stage: Stage; onOpen(id: string): void }) {
  const drop = useDroppable({ id: stage.id });
  const value = stage.opportunities.reduce((sum, item) => sum + item.valueCents, 0);
  return <section ref={drop.setNodeRef} className={`kanban-column ${drop.isOver ? 'drop-over' : ''}`}><header><div><i style={{ background: stage.color }} /><strong>{stage.name}</strong><span>{stage.opportunities.length}</span></div><b>{money(value)}</b></header><div className="kanban-cards">{stage.opportunities.map((item) => <OpportunityCard opportunity={item} key={item.id} onOpen={() => onOpen(item.id)} />)}{!stage.opportunities.length && <div className="kanban-empty">Arraste oportunidades para cá</div>}</div></section>;
});

export function PipelinePage() {
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPipelineId = searchParams.get('pipeline') || '';
  const requestedOpportunityId = searchParams.get('opportunity');
  const requestedSearch = searchParams.get('search') || '';
  const requestedCreate = searchParams.get('new') === '1';
  const [pipelineId, setPipelineId] = useState(requestedPipelineId);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState(requestedSearch);
  const deferredSearch = useDeferredValue(search);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(requestedOpportunityId);
  useEffect(() => {
    if (requestedPipelineId) setPipelineId(requestedPipelineId);
    setSearch(requestedSearch);
    if (requestedOpportunityId) setSelectedId(requestedOpportunityId);
    if (requestedCreate) setModal(true);
  }, [requestedCreate, requestedOpportunityId, requestedPipelineId, requestedSearch]);
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api<Envelope<Array<Omit<Pipeline, 'stages'> & { stages: Stage[] }>>>('/pipelines'), staleTime: 5 * 60_000 });
  const selectedPipelineId = pipelineId || pipelines.data?.data[0]?.id || '';
  const kanbanKey = ['kanban', selectedPipelineId] as const;
  const kanban = useQuery({ queryKey: kanbanKey, queryFn: () => api<Envelope<Pipeline>>(`/pipelines/${selectedPipelineId}/kanban`), enabled: Boolean(selectedPipelineId) });
  const move = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api<Envelope<Opportunity & { status: string }>>(`/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stageId }) }),
    onMutate: async ({ id, stageId }) => {
      await client.cancelQueries({ queryKey: kanbanKey });
      const previous = client.getQueryData<Envelope<Pipeline>>(kanbanKey);
      client.setQueryData<Envelope<Pipeline>>(kanbanKey, (current) => {
        if (!current) return current;
        const moving = current.data.stages.flatMap((stage) => stage.opportunities).find((item) => item.id === id);
        if (!moving) return current;
        return { ...current, data: { ...current.data, stages: current.data.stages.map((stage) => ({
          ...stage,
          opportunities: stage.id === stageId
            ? [{ ...moving, stageId }, ...stage.opportunities.filter((item) => item.id !== id)]
            : stage.opportunities.filter((item) => item.id !== id),
        })) } };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => { if (context?.previous) client.setQueryData(kanbanKey, context.previous); },
    onSuccess: (response, variables) => {
      toast.success('Oportunidade movida.');
      client.setQueryData<Envelope<Pipeline>>(kanbanKey, (current) => {
        if (!current) return current;
        return { ...current, data: { ...current.data, stages: current.data.stages.map((stage) => ({
          ...stage,
          opportunities: stage.opportunities.flatMap((opportunity) => {
            if (opportunity.id !== variables.id) return [opportunity];
            if (response.data.status !== 'OPEN') return [];
            return [{ ...opportunity, ...response.data, company: opportunity.company, owner: opportunity.owner }];
          }),
        })) } };
      });
    },
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } }),
  );
  const allOpportunities = useMemo(() => kanban.data?.data.stages.flatMap((stage) => stage.opportunities) || [], [kanban.data]);
  const activeOpportunity = useMemo(() => activeId ? allOpportunities.find((item) => item.id === activeId) : undefined, [activeId, allOpportunities]);
  const onDragStart = useCallback((event: DragStartEvent) => setActiveId(String(event.active.id)), []);
  const onDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    if (event.over && event.active.data.current?.stageId !== event.over.id) move.mutate({ id: String(event.active.id), stageId: String(event.over.id) });
  }, [move]);
  const normalizedSearch = deferredSearch.trim().toLocaleLowerCase('pt-BR');
  const stages = useMemo(() => (kanban.data?.data.stages || []).map((stage) => ({
    ...stage,
    opportunities: stage.opportunities.filter((opportunity) => !normalizedSearch || opportunity.title.toLocaleLowerCase('pt-BR').includes(normalizedSearch) || opportunity.company?.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)),
  })), [kanban.data?.data.stages, normalizedSearch]);
  const closeOpportunity = () => {
    setSelectedId(null);
    if (!searchParams.has('opportunity')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('opportunity');
    setSearchParams(next, { replace: true });
  };
  const closeCreating = () => {
    setModal(false);
    if (!searchParams.has('new')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };
  if (pipelines.isLoading || kanban.isLoading) return <PageLoading />;
  return <div className="pipeline-page"><div className="toolbar"><div className="toolbar-left"><label className="compact-select"><LayoutGrid size={16} /><select value={selectedPipelineId} onChange={(event) => setPipelineId(event.target.value)}>{pipelines.data?.data.map((pipeline) => <option value={pipeline.id} key={pipeline.id}>{pipeline.name}</option>)}</select><ChevronDown size={15} /></label><button className="filter-button"><Filter size={16} />Filtros</button><div className="inline-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no funil…" /></div></div><Button onClick={() => setModal(true)}><Plus size={16} />Nova oportunidade</Button></div><DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}><div className="kanban-board">{stages.map((stage) => <StageColumn stage={stage} key={stage.id} onOpen={setSelectedId} />)}</div>{createPortal(<DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }}>{activeOpportunity ? <OpportunityCard opportunity={activeOpportunity} overlay /> : null}</DragOverlay>, document.body)}</DndContext>{modal && <OpportunityModal pipeline={kanban.data!.data} onClose={closeCreating} onCreated={() => { closeCreating(); void client.invalidateQueries({ queryKey: kanbanKey }); }} />}{selectedId && <OpportunityDrawer id={selectedId} onClose={closeOpportunity} />}</div>;
}

function OpportunityDrawer({ id, onClose }: { id: string; onClose(): void }) {
  const details = useQuery({ queryKey: ['opportunity', id], queryFn: () => api<Envelope<OpportunityDetails>>(`/opportunities/${id}`) });
  const opportunity = details.data?.data;
  const unavailable = Boolean(details.error);
  if (unavailable) return <><button className="drawer-scrim" onClick={onClose} aria-label="Fechar detalhes" /><aside className="opportunity-drawer" aria-label="Detalhes da oportunidade"><header><div><span className="eyebrow">Oportunidade</span><h2>Detalhes indisponíveis</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header></aside></>;
  return <><button className="drawer-scrim" onClick={onClose} aria-label="Fechar detalhes" /><aside className="opportunity-drawer" aria-label="Detalhes da oportunidade"><header><div><span className="eyebrow">Oportunidade</span><h2>{opportunity?.title || 'Carregando…'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>{details.isLoading ? <PageLoading /> : details.error ? <div className="drawer-error">{details.error.message}</div> : opportunity && <div className="drawer-content"><div className="drawer-summary"><div><span>Valor</span><strong>{money(opportunity.valueCents)}</strong></div><div><span>Etapa</span><span className="stage-pill"><i style={{ background: opportunity.stage.color }} />{opportunity.stage.name}</span></div><div><span>Probabilidade</span><strong>{opportunity.probability}%</strong></div></div><OpportunityProposalSection opportunity={opportunity} /><section><h3><Building2 size={17} />Empresa</h3>{opportunity.company ? <div className="drawer-entity"><span className="company-avatar">{initials(opportunity.company.name)}</span><div><strong>{opportunity.company.name}</strong><small>{opportunity.company.sector || opportunity.company.domain || 'Sem informações complementares'}</small>{opportunity.company.phone && <a href={`tel:${opportunity.company.phone}`}><Phone size={13} />{opportunity.company.phone}</a>}</div></div> : <p className="drawer-muted">Nenhuma empresa vinculada.</p>}</section><section><h3><UsersRound size={17} />Contatos</h3>{opportunity.contacts.length ? <div className="drawer-contact-list">{opportunity.contacts.map(({ contact, isPrimary }) => <div key={contact.id}><span className="contact-avatar">{initials(contact.name)}</span><div><strong>{contact.name}{isPrimary && <em>Principal</em>}</strong><small>{contact.jobTitle || 'Cargo não informado'}</small><span>{contact.email && <a href={`mailto:${contact.email}`}><Mail size={13} />{contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`}><Phone size={13} />{contact.phone}</a>}</span></div></div>)}</div> : <p className="drawer-muted">Nenhum contato vinculado.</p>}</section><section className="drawer-grid"><div><h3><UserRound size={17} />Responsável</h3><p>{opportunity.owner?.name || 'Não atribuído'}</p></div><div><h3><CalendarDays size={17} />Previsão</h3><p>{opportunity.expectedCloseAt ? dateTime(opportunity.expectedCloseAt).split(' ')[0] : 'Não definida'}</p></div><div><h3><CircleDollarSign size={17} />Origem</h3><p>{opportunity.source || 'Não informada'}</p></div><div><h3><Clock3 size={17} />Atualizada</h3><p>{dateTime(opportunity.updatedAt)}</p></div></section>{opportunity.tags.length > 0 && <section><h3><Tag size={17} />Tags</h3><div className="drawer-tags">{opportunity.tags.map(({ tag }) => <span key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span>)}</div></section>}<section><h3><Clock3 size={17} />Atividades recentes</h3>{opportunity.activities.length ? <div className="drawer-timeline">{opportunity.activities.slice(0, 8).map((activity) => <div key={activity.id}><i /><p><strong>{activity.title}</strong><small>{dateTime(activity.occurredAt)}</small></p></div>)}</div> : <p className="drawer-muted">Nenhuma atividade registrada.</p>}</section></div>}</aside></>;
}

const PROPOSAL_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain';
const PROPOSAL_TYPES = new Set(PROPOSAL_ACCEPT.split(','));

function proposalFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function proposalLinkLabel(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

function OpportunityProposalSection({ opportunity }: { opportunity: OpportunityDetails }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const canWrite = Boolean(user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === 'opportunities') && (permission.action === '*' || permission.action === 'write')));
  const hasProposal = Boolean(opportunity.proposalUrl || opportunity.proposalAsset);
  const href = opportunity.proposalAsset
    ? apiUrl(`/opportunities/${opportunity.id}/proposal/file`)
    : opportunity.proposalUrl || '';
  return <section className="opportunity-proposal-section">
    <div className="opportunity-proposal-heading"><h3><FileText size={17} />Proposta</h3>{canWrite && hasProposal && <button type="button" onClick={() => setEditing(true)}>Alterar</button>}</div>
    {hasProposal ? <a className="opportunity-proposal-card" href={href} target="_blank" rel="noopener noreferrer">
      <span>{opportunity.proposalAsset ? <Paperclip size={18} /> : <Link2 size={18} />}</span>
      <div><strong>{opportunity.proposalAsset?.filename || proposalLinkLabel(opportunity.proposalUrl || '')}</strong><small>{opportunity.proposalAsset ? `${opportunity.proposalAsset.contentType.split('/').at(-1)?.toUpperCase()} · ${proposalFileSize(opportunity.proposalAsset.sizeBytes)}` : opportunity.proposalUrl}{opportunity.proposalAddedAt ? ` · Adicionada em ${dateTime(opportunity.proposalAddedAt)}` : ''}</small></div>
      <ExternalLink size={17} />
    </a> : canWrite ? <button type="button" className="opportunity-proposal-empty" onClick={() => setEditing(true)}><Plus size={18} /><span><strong>Adicionar proposta</strong><small>Envie um arquivo ou informe um link</small></span></button> : <p className="drawer-muted">Nenhuma proposta adicionada.</p>}
    {editing && <OpportunityProposalModal opportunity={opportunity} onClose={() => setEditing(false)} />}
  </section>;
}

function OpportunityProposalModal({ opportunity, onClose }: { opportunity: OpportunityDetails; onClose(): void }) {
  const client = useQueryClient();
  const [type, setType] = useState<'FILE' | 'LINK'>(opportunity.proposalUrl ? 'LINK' : 'FILE');
  const [url, setUrl] = useState(opportunity.proposalUrl || '');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      let mediaAssetId: string | undefined;
      if (type === 'FILE') {
        if (!file) throw new Error('Selecione o arquivo da proposta');
        const created = await api<Envelope<{ id: string; uploadUrl: string }>>('/media/uploads', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
        });
        const uploaded = await fetch(created.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!uploaded.ok) throw new Error('Não foi possível concluir o upload da proposta');
        mediaAssetId = created.data.id;
      }
      return api(`/opportunities/${opportunity.id}/proposal`, {
        method: 'PATCH',
        body: JSON.stringify(type === 'FILE' ? { type, mediaAssetId } : { type, url }),
      });
    },
    onSuccess: () => {
      toast.success(opportunity.proposalUrl || opportunity.proposalAsset ? 'Proposta atualizada.' : 'Proposta adicionada.');
      void client.invalidateQueries({ queryKey: ['opportunity', opportunity.id] });
      void client.invalidateQueries({ queryKey: ['kanban'] });
      onClose();
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível salvar a proposta')),
  });
  const chooseFile = (candidate: File | null) => {
    if (!candidate) return;
    if (!PROPOSAL_TYPES.has(candidate.type)) { setFileError('Selecione uma imagem, PDF ou documento compatível.'); return; }
    if (!candidate.size || candidate.size > 25 * 1024 * 1024) { setFileError('O arquivo deve ter entre 1 byte e 25 MB.'); return; }
    setFile(candidate);
    setFileError('');
  };
  const dropFile = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] || null);
  };
  const canSubmit = type === 'FILE' ? Boolean(file) : Boolean(url.trim());
  return <Modal title={opportunity.proposalUrl || opportunity.proposalAsset ? 'Alterar proposta' : 'Adicionar proposta'} onClose={() => !mutation.isPending && onClose()} width={600}>
    <form className="modal-form opportunity-proposal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (canSubmit) mutation.mutate(); }}>
      <div className="segmented opportunity-proposal-type" role="group" aria-label="Tipo da proposta"><button type="button" className={type === 'FILE' ? 'active' : ''} aria-pressed={type === 'FILE'} onClick={() => setType('FILE')}><Upload size={15} />Arquivo</button><button type="button" className={type === 'LINK' ? 'active' : ''} aria-pressed={type === 'LINK'} onClick={() => setType('LINK')}><Link2 size={15} />Link</button></div>
      {type === 'LINK' ? <Field label="Link da proposta" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://exemplo.com/proposta" hint="O endereço será aberto em uma nova aba." required /> : <>
        <label className={`opportunity-proposal-dropzone${dragging ? ' dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={dropFile}>
          <input hidden type="file" accept={PROPOSAL_ACCEPT} onChange={(event) => { chooseFile(event.target.files?.[0] || null); event.currentTarget.value = ''; }} />
          <Upload size={22} /><span><strong>Selecionar arquivo da proposta</strong><small>Clique ou arraste uma imagem ou documento de até 25 MB</small></span>
        </label>
        {file && <div className="opportunity-proposal-selected"><Paperclip size={17} /><span><strong>{file.name}</strong><small>{proposalFileSize(file.size)}</small></span><button type="button" onClick={() => setFile(null)} aria-label="Remover arquivo selecionado"><X size={16} /></button></div>}
        {fileError && <p className="form-error">{fileError}</p>}
      </>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>Salvar proposta</Button></div>
    </form>
  </Modal>;
}

function OpportunityModal({ pipeline, onClose, onCreated }: { pipeline: Pipeline; onClose(): void; onCreated(): void }) {
  const [title, setTitle] = useState(''); const [value, setValue] = useState(''); const [stageId, setStageId] = useState(pipeline.stages[0]?.id || '');
  const mutation = useMutation({
    mutationFn: () => api('/opportunities', { method: 'POST', body: JSON.stringify({ title, pipelineId: pipeline.id, stageId, valueCents: Math.round(Number(value || 0) * 100), probability: pipeline.stages.find((stage) => stage.id === stageId)?.position || 0 }) }),
    onSuccess: () => {
      toast.success('Oportunidade criada.');
      onCreated();
    },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <Modal title="Nova oportunidade" onClose={onClose}><form className="modal-form" onSubmit={submit}><Field label="Título da oportunidade" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Expansão comercial" required /><div className="form-grid"><Field label="Valor estimado (R$)" type="number" min="0" value={value} onChange={(event) => setValue(event.target.value)} /><SelectField label="Etapa" value={stageId} onChange={(event) => setStageId(event.target.value)}>{pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</SelectField></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar oportunidade</Button></div></form></Modal>;
}
