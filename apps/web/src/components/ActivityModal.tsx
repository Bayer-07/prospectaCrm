import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, FileText, Phone, PhoneCall } from 'lucide-react';
import { api, type Envelope } from '../lib/api';
import type { Activity } from '../lib/activity';
import type { Company, Contact, Opportunity } from '../lib/types';
import { toast } from '../lib/toast';
import { Button, Field, Modal, SelectField } from './ui';
import { useAuth } from '../App';

type ManualCategory = 'call' | 'note' | 'meeting';
export type ActivityAssociation = {
  companyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  phone?: string | null;
};

const callOutcomes = [
  ['connected', 'Atendida'], ['no_answer', 'Não atendeu'], ['busy', 'Ocupado'],
  ['voicemail', 'Caixa postal'], ['wrong_number', 'Número incorreto'],
] as const;
const meetingOutcomes = [
  ['held', 'Realizada'], ['no_show', 'Não compareceu'], ['rescheduled', 'Reagendada'], ['cancelled', 'Cancelada'],
] as const;

function localInputDate(value: string | Date) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ActivityModal({
  category: initialCategory,
  activity,
  association = {},
  onClose,
  onSaved,
}: Readonly<{
  category?: ManualCategory;
  activity?: Activity;
  association?: ActivityAssociation;
  onClose(): void;
  onSaved(): void;
}>) {
  const initial = (activity?.category.toLowerCase() || initialCategory || 'call') as ManualCategory;
  const { user } = useAuth();
  const canRead = (resource: string) => Boolean(user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === resource) && (permission.action === '*' || permission.action === 'read')));
  const [category, setCategory] = useState<ManualCategory>(initial);
  const [form, setForm] = useState({
    title: activity?.title || (initial === 'call' ? 'Ligação comercial' : initial === 'meeting' ? 'Reunião comercial' : 'Nota comercial'),
    body: activity?.body || '',
    occurredAt: localInputDate(activity?.occurredAt || new Date()),
    durationMinutes: activity?.durationSeconds ? String(Math.round(activity.durationSeconds / 60)) : '',
    direction: activity?.direction?.toLowerCase() || 'outbound',
    outcome: activity?.outcome || '',
    companyId: activity?.company?.id || association.companyId || '',
    contactId: activity?.contact?.id || association.contactId || '',
    opportunityId: activity?.opportunity?.id || association.opportunityId || '',
    createFollowUp: false,
    followUpTitle: 'Retornar contato',
    followUpAt: localInputDate(new Date(Date.now() + 24 * 60 * 60_000)),
  });
  const needsAssociationPicker = !activity && !association.companyId && !association.contactId && !association.opportunityId;
  const companies = useQuery({
    queryKey: ['activity-associations', 'companies'],
    queryFn: () => api<Envelope<Company[]>>('/companies?limit=100'),
    enabled: needsAssociationPicker && canRead('companies'),
    staleTime: 60_000,
  });
  const contacts = useQuery({
    queryKey: ['activity-associations', 'contacts'],
    queryFn: () => api<Envelope<Contact[]>>('/contacts?limit=100'),
    enabled: needsAssociationPicker && canRead('contacts'),
    staleTime: 60_000,
  });
  const opportunities = useQuery({
    queryKey: ['activity-associations', 'opportunities'],
    queryFn: () => api<Envelope<Opportunity[]>>('/opportunities?limit=100'),
    enabled: needsAssociationPicker && canRead('opportunities'),
    staleTime: 60_000,
  });
  const payload = useMemo(() => ({
    category,
    title: form.title,
    body: form.body || undefined,
    occurredAt: new Date(form.occurredAt).toISOString(),
    direction: category === 'call' ? form.direction : undefined,
    outcome: form.outcome || undefined,
    durationSeconds: form.durationMinutes ? Math.round(Number(form.durationMinutes) * 60) : undefined,
    companyId: form.companyId || undefined,
    contactId: form.contactId || undefined,
    opportunityId: form.opportunityId || undefined,
    followUp: form.createFollowUp && !activity ? {
      title: form.followUpTitle,
      dueAt: new Date(form.followUpAt).toISOString(),
      priority: 'medium',
    } : undefined,
  }), [activity, category, form]);
  const mutation = useMutation({
    mutationFn: () => api(activity ? `/activities/${activity.id}` : '/activities', {
      method: activity ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      toast.success(activity ? 'Atividade atualizada.' : 'Atividade registrada.');
      onSaved();
      onClose();
    },
  });
  const phone = association.phone || activity?.contact?.phone;
  const outcomes = category === 'call' ? callOutcomes : category === 'meeting' ? meetingOutcomes : [];
  const title = activity ? 'Editar atividade' : category === 'call' ? 'Registrar ligação' : category === 'meeting' ? 'Registrar reunião' : 'Adicionar nota';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.companyId && !form.contactId && !form.opportunityId) {
      toast.error('Vincule uma empresa, contato ou oportunidade.');
      return;
    }
    mutation.mutate();
  };

  return <Modal title={title} onClose={onClose} width={660}>
    <form className="modal-form activity-form" onSubmit={submit}>
      {!activity && <div className="activity-kind-picker" aria-label="Tipo de atividade">
        <button type="button" className={category === 'call' ? 'active' : ''} onClick={() => setCategory('call')}><PhoneCall size={17} />Ligação</button>
        <button type="button" className={category === 'meeting' ? 'active' : ''} onClick={() => setCategory('meeting')}><CalendarDays size={17} />Reunião</button>
        <button type="button" className={category === 'note' ? 'active' : ''} onClick={() => setCategory('note')}><FileText size={17} />Nota</button>
      </div>}
      {category === 'call' && phone && <a className="activity-call-link" href={`tel:${phone}`}><Phone size={17} />Abrir ligação para {phone}</a>}
      <Field label="Título" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
      <div className="form-grid two">
        <Field label={category === 'meeting' ? 'Data e hora' : 'Horário'} type="datetime-local" value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} required />
        {category !== 'note' && <Field label="Duração (minutos)" type="number" min="0" max="1440" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} />}
      </div>
      {category === 'call' && <SelectField label="Direção" value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}><option value="outbound">Realizada</option><option value="inbound">Recebida</option></SelectField>}
      {outcomes.length > 0 && <SelectField label="Resultado" value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })}><option value="">Não informado</option>{outcomes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>}
      <label className="field"><span>{category === 'note' ? 'Texto da nota' : 'Observações'}</span><textarea rows={5} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required={category === 'note'} /></label>
      {needsAssociationPicker ? <div className="form-grid three activity-associations">
        <SelectField label="Empresa" value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })}><option value="">Nenhuma</option>{companies.data?.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <SelectField label="Contato" value={form.contactId} onChange={(event) => setForm({ ...form, contactId: event.target.value })}><option value="">Nenhum</option>{contacts.data?.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <SelectField label="Oportunidade" value={form.opportunityId} onChange={(event) => setForm({ ...form, opportunityId: event.target.value })}><option value="">Nenhuma</option>{opportunities.data?.data.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</SelectField>
      </div> : <div className="activity-linked-records"><span>Vinculada a</span><strong>{association.opportunityTitle || association.contactName || association.companyName || activity?.opportunity?.title || activity?.contact?.name || activity?.company?.name}</strong></div>}
      {!activity && <div className="activity-follow-up">
        <label><input type="checkbox" checked={form.createFollowUp} onChange={(event) => setForm({ ...form, createFollowUp: event.target.checked })} />Criar tarefa de acompanhamento</label>
        {form.createFollowUp && <div className="form-grid two"><Field label="Tarefa" value={form.followUpTitle} onChange={(event) => setForm({ ...form, followUpTitle: event.target.value })} required /><Field label="Prazo" type="datetime-local" value={form.followUpAt} onChange={(event) => setForm({ ...form, followUpAt: event.target.value })} required /></div>}
      </div>}
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Salvar atividade</Button></div>
    </form>
  </Modal>;
}
