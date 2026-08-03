import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type Envelope } from '../lib/api';
import type { Company, Contact } from '../lib/types';
import { Button, Field, Modal, SelectField } from './ui';
import { toast } from '../lib/toast';
import { formatBrazilPhoneInput, toBrazilE164Phone } from '../lib/phone-input';

export function ContactModal({ contact, onClose, onSaved }: { contact?: Contact; onClose(): void; onSaved(): void }) {
  const companies = useQuery({ queryKey: ['contact-company-options'], queryFn: () => api<Envelope<Company[]>>('/companies?limit=100'), staleTime: 5 * 60_000 });
  const [form, setForm] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: formatBrazilPhoneInput(contact?.phone),
    jobTitle: contact?.jobTitle || '',
    companyId: contact?.companies?.find((item) => item.isPrimary)?.company.id || contact?.companies?.[0]?.company.id || '',
    consentStatus: contact?.consentStatus.toLowerCase() || 'unknown',
    campaignsBlocked: contact?.campaignsBlocked || false,
  });
  const mutation = useMutation({
    mutationFn: () => {
      const optional = (value: string) => value.trim() || undefined;
      const payload = {
        name: form.name,
        email: optional(form.email),
        phone: toBrazilE164Phone(form.phone),
        jobTitle: optional(form.jobTitle),
        companyId: form.companyId || null,
        consentStatus: form.consentStatus,
        ...(contact ? { campaignsBlocked: form.campaignsBlocked } : {}),
      };
      return api(contact ? `/contacts/${contact.id}` : '/contacts', { method: contact ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast.success(contact ? 'Contato atualizado.' : 'Contato cadastrado.');
      onSaved();
    },
  });
  const sortedCompanies = useMemo(() => [...(companies.data?.data || [])].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')), [companies.data?.data]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value });
  const setPhone = (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, phone: formatBrazilPhoneInput(event.target.value) });
  return <Modal title={contact ? 'Editar contato' : 'Cadastrar contato'} onClose={onClose}>
    <form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}>
      <Field label="Nome completo" value={form.name} onChange={set('name')} required autoFocus />
      <div className="form-grid"><Field label="E-mail" type="email" value={form.email} onChange={set('email')} /><Field label="Telefone" type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={setPhone} pattern="\(\d{2}\) \d{4,5}-\d{4}" title="Informe o DDD e o telefone usando apenas números" hint="Digite apenas números. Ex.: (45) 99922-5389" /></div>
      <div className="form-grid">
        <Field label="Cargo" value={form.jobTitle} onChange={set('jobTitle')} />
        <SelectField label="Empresa" value={form.companyId} onChange={set('companyId')} disabled={companies.isLoading || companies.isError}><option value="">{companies.isLoading ? 'Carregando empresas…' : 'Sem empresa'}</option>{sortedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectField>
      </div>
      <SelectField label="Consentimento WhatsApp" value={form.consentStatus} onChange={set('consentStatus')}><option value="unknown">Não informado</option><option value="granted">Consentido</option><option value="revoked">Revogado</option></SelectField>
      {contact && <label className={`contact-campaign-block${form.campaignsBlocked ? ' active' : ''}`}>
        <input
          type="checkbox"
          checked={form.campaignsBlocked}
          onChange={(event) => setForm({ ...form, campaignsBlocked: event.target.checked })}
        />
        <span><strong>Não enviar campanhas</strong><small>Impede campanhas de WhatsApp e de e-mail para este contato.</small></span>
      </label>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>{contact ? 'Salvar alterações' : 'Salvar contato'}</Button></div>
    </form>
  </Modal>;
}
