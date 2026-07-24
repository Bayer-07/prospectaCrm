import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type Envelope } from '../lib/api';
import type { Company, Contact } from '../lib/types';
import { Button, Field, Modal, SelectField } from './ui';

export function ContactModal({ contact, onClose, onSaved }: { contact?: Contact; onClose(): void; onSaved(): void }) {
  const companies = useQuery({ queryKey: ['contact-company-options'], queryFn: () => api<Envelope<Company[]>>('/companies?limit=100'), staleTime: 5 * 60_000 });
  const [form, setForm] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    jobTitle: contact?.jobTitle || '',
    companyId: contact?.companies?.find((item) => item.isPrimary)?.company.id || contact?.companies?.[0]?.company.id || '',
    consentStatus: contact?.consentStatus.toLowerCase() || 'unknown',
  });
  const mutation = useMutation({
    mutationFn: () => {
      const optional = (value: string) => value.trim() || undefined;
      const payload = {
        name: form.name,
        email: optional(form.email),
        phone: optional(form.phone),
        jobTitle: optional(form.jobTitle),
        companyId: form.companyId || null,
        consentStatus: form.consentStatus,
      };
      return api(contact ? `/contacts/${contact.id}` : '/contacts', { method: contact ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: onSaved,
  });
  const sortedCompanies = useMemo(() => [...(companies.data?.data || [])].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')), [companies.data?.data]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value });
  return <Modal title={contact ? 'Editar contato' : 'Cadastrar contato'} onClose={onClose}>
    <form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}>
      <Field label="Nome completo" value={form.name} onChange={set('name')} required autoFocus />
      <div className="form-grid"><Field label="E-mail" type="email" value={form.email} onChange={set('email')} /><Field label="Telefone E.164" value={form.phone} onChange={set('phone')} hint="Ex.: +5511999999999" /></div>
      <div className="form-grid">
        <Field label="Cargo" value={form.jobTitle} onChange={set('jobTitle')} />
        <SelectField label="Empresa" value={form.companyId} onChange={set('companyId')} disabled={companies.isLoading || companies.isError}><option value="">{companies.isLoading ? 'Carregando empresas…' : 'Sem empresa'}</option>{sortedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectField>
      </div>
      <SelectField label="Consentimento WhatsApp" value={form.consentStatus} onChange={set('consentStatus')}><option value="unknown">Não informado</option><option value="granted">Consentido</option><option value="revoked">Revogado</option></SelectField>
      {companies.isError && <div className="form-error">Não foi possível carregar as empresas disponíveis.</div>}
      {mutation.error && <div className="form-error">{mutation.error.message}</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>{contact ? 'Salvar alterações' : 'Salvar contato'}</Button></div>
    </form>
  </Modal>;
}
