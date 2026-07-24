import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Download, Filter, Globe2, MoreHorizontal, Plus, Search, Users } from 'lucide-react';
import { api, dateTime, initials, type Envelope } from '../lib/api';
import type { Company } from '../lib/types';
import { Button, Empty, Field, Modal, PageLoading } from '../components/ui';
import { useDebouncedValue } from '../lib/useDebouncedValue';

export function CompaniesPage() {
  const client = useQueryClient(); const [search, setSearch] = useState(''); const [modal, setModal] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const query = useQuery({ queryKey: ['companies', debouncedSearch], queryFn: () => api<Envelope<Company[]>>(`/companies?limit=100&search=${encodeURIComponent(debouncedSearch)}`), placeholderData: (previous) => previous });
  if (query.isLoading) return <PageLoading />;
  return <div className="list-page"><div className="toolbar"><div className="toolbar-left"><div className="inline-search wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, domínio ou CNPJ…" /></div><button className="filter-button"><Filter size={15} />Filtros</button></div><div className="toolbar-actions"><a className="button button-secondary" href="/api/v1/reports/companies.csv" download><Download size={15} />Exportar</a><Button onClick={() => setModal(true)}><Plus size={15} />Nova empresa</Button></div></div>{query.data?.data.length ? <div className="table-card"><table><thead><tr><th>Empresa</th><th>Setor</th><th>Responsável</th><th>Equipe</th><th>Relacionamentos</th><th>Atualizada</th><th /></tr></thead><tbody>{query.data.data.map((company) => <tr key={company.id}><td><div className="entity-cell"><span className="company-avatar">{initials(company.name)}</span><div><strong>{company.name}</strong><small><Globe2 size={12} />{company.domain || company.cnpj || 'Sem domínio'}</small></div></div></td><td><span className="neutral-pill">{company.sector || 'Não informado'}</span></td><td>{company.owner?.name || 'Sem responsável'}</td><td>{company.team && <span className="team-label"><i style={{ background: company.team.color }} />{company.team.name}</span>}</td><td><span className="relation-count"><Users size={14} />{company._count?.contacts || 0} contatos</span></td><td>{dateTime(company.updatedAt)}</td><td><button className="icon-button"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div> : <Empty icon={<Building2 />} title="Nenhuma empresa encontrada" description="Cadastre a primeira empresa ou ajuste a busca." action={<Button onClick={() => setModal(true)}>Adicionar empresa</Button>} />}{modal && <CompanyModal onClose={() => setModal(false)} onCreated={() => { setModal(false); client.invalidateQueries({ queryKey: ['companies'] }); }} />}</div>;
}

function CompanyModal({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const [form, setForm] = useState({ name: '', cnpj: '', domain: '', sector: '', size: '' });
  const mutation = useMutation({ mutationFn: () => api('/companies', { method: 'POST', body: JSON.stringify(form) }), onSuccess: onCreated });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  return <Modal title="Cadastrar empresa" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome da empresa" value={form.name} onChange={set('name')} required autoFocus /><div className="form-grid"><Field label="CNPJ" value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" /><Field label="Domínio" value={form.domain} onChange={set('domain')} placeholder="empresa.com.br" /></div><div className="form-grid"><Field label="Setor" value={form.sector} onChange={set('sector')} /><Field label="Porte" value={form.size} onChange={set('size')} /></div>{mutation.error && <div className="form-error">{mutation.error.message}</div>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Salvar empresa</Button></div></form></Modal>;
}
