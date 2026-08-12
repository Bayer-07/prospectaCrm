import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Download,
  Eye,
  Filter,
  Globe2,
  ImagePlus,
  Linkedin,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatCnpj, isValidCnpj, normalizeCnpj } from '@prospecta/contracts';
import { api, apiUrl, dateTime, formatPhone, initials, type Envelope } from '../lib/api';
import type { Company } from '../lib/types';
import { Button, Empty, Field, Modal, PageLoading, SelectField } from '../components/ui';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { toast } from '../lib/toast';
import { StartConversationModal } from '../components/StartConversationModal';
import {
  activeCompanyFilterCount,
  companyListQuery,
  EMPTY_COMPANY_FILTERS,
  type CompanyListFilters,
} from '../lib/company-filters';

type CompanyMenu = { company: Company; top: number; right: number };
type CompanyFilterMetadata = {
  users: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
};
type CompanyDetails = Company & {
  legalName?: string;
  size?: string;
  phone?: string;
  createdAt?: string;
  contacts: Array<{
    isPrimary?: boolean;
    contact: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      owner?: { id: string; name: string };
    };
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    valueCents: number;
    status: string;
    stage?: { id: string; name: string; color: string };
    owner?: { id: string; name: string };
  }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: string }>;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
};
type CompanyContactDetails = CompanyDetails['contacts'][number]['contact'];
type CompanyContactPhoneMenu = { contact: CompanyContactDetails; top: number; right: number };
type CompanyCnpjLookup = {
  cnpj: string;
  name: string;
  legalName: string;
  sector?: string;
  size?: string;
  phone?: string;
  registrationStatus?: string;
  address?: Record<string, string>;
};
type CompanyLogoLookup = {
  domain: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/x-icon';
  dataUrl: string;
  filename: string;
  sourceUrl: string;
};
type CompanyForm = {
  name: string;
  legalName: string;
  cnpj: string;
  domain: string;
  linkedinUrl: string;
  sector: string;
  size: string;
  phone: string;
  address: string;
};

function CompanyLogo({ company, large = false }: Readonly<{ company: Pick<Company, 'id' | 'name' | 'logoId'>; large?: boolean }>) {
  const src = company.logoId
    ? apiUrl(`/companies/${company.id}/logo?v=${encodeURIComponent(company.logoId)}`)
    : '';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={`company-avatar ${large ? 'large' : ''} ${src && !failed ? 'has-image' : ''}`}>
    {src && !failed
      ? <img src={src} alt={`Logo de ${company.name}`} onError={() => setFailed(true)} />
      : initials(company.name)}
  </span>;
}

function companyDomainHostname(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw || /\s/.test(raw)) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.includes('.') ? url.hostname.replace(/\.$/, '') : '';
  } catch {
    return '';
  }
}

function fileFromLogoLookup(logo: CompanyLogoLookup) {
  const encoded = logo.dataUrl.split(',', 2)[1];
  if (!encoded) throw new Error('Logo automática inválida');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.codePointAt(index) ?? 0;
  return new File([bytes], logo.filename, { type: logo.contentType });
}

function companyAddressText(address?: Record<string, unknown>) {
  if (!address) return '';
  if (typeof address.formatted === 'string') return address.formatted;
  const street = typeof address.street === 'string' ? address.street : '';
  const number = typeof address.number === 'string' ? address.number : '';
  const complement = typeof address.complement === 'string' ? address.complement : '';
  const district = typeof address.district === 'string' ? address.district : '';
  const city = typeof address.city === 'string' ? address.city : '';
  const state = typeof address.state === 'string' ? address.state : '';
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode : '';
  return [
    [street, number].filter(Boolean).join(', '),
    complement,
    district,
    [city, state].filter(Boolean).join(' - '),
    postalCode ? `CEP ${postalCode}` : '',
  ].filter(Boolean).join(' · ');
}

function companyLogoPreview(company: Company | undefined, logoPreview: string, removeLogo: boolean, companyName: string) {
  if (logoPreview) return <img src={logoPreview} alt="Prévia da logo" />;
  if (company?.logoId && !removeLogo) return <CompanyLogo company={company} large />;
  return <span>{initials(companyName || 'Empresa')}</span>;
}

function companyLogoMessage(
  isFetching: boolean,
  logoOrigin: 'manual' | 'auto' | null,
  lookupFinishedWithoutLogo: boolean,
) {
  if (isFetching) return 'Buscando a logo pelo domínio…';
  if (logoOrigin === 'auto') return 'Logo encontrada automaticamente pelo domínio.';
  if (lookupFinishedWithoutLogo) return 'Nenhuma logo foi encontrada. Você pode selecionar uma imagem.';
  return 'Informe o domínio ou selecione JPG, PNG ou WebP de até 5 MB.';
}

function cnpjLookupHint(lookup: {
  isFetching: boolean;
  isSuccess: boolean;
  isError: boolean;
  data?: Envelope<CompanyCnpjLookup>;
}) {
  if (lookup.isFetching) return 'Consultando dados da empresa…';
  if (lookup.isSuccess) {
    const registrationStatus = lookup.data?.data.registrationStatus;
    const status = registrationStatus ? ` · Situação ${registrationStatus.toLowerCase()}` : '';
    return `Dados encontrados${status}.`;
  }
  if (lookup.isError) return 'Não foi possível preencher automaticamente. Você ainda pode cadastrar manualmente.';
  return 'A consulta será feita ao completar um CNPJ válido.';
}

export function CompaniesPage() {
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSearch = searchParams.get('search') || '';
  const requestedCreate = searchParams.get('new') === '1';
  const [search, setSearch] = useState(requestedSearch);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [viewing, setViewing] = useState<Company | null>(null);
  const [viewingContacts, setViewingContacts] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [menu, setMenu] = useState<CompanyMenu | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<CompanyListFilters>({ ...EMPTY_COMPANY_FILTERS });
  const [draftFilters, setDraftFilters] = useState<CompanyListFilters>({ ...EMPTY_COMPANY_FILTERS });

  useEffect(() => setSearch(requestedSearch), [requestedSearch]);
  useEffect(() => {
    if (requestedCreate) setCreating(true);
  }, [requestedCreate]);
  const debouncedSearch = useDebouncedValue(search);
  const activeFilters = activeCompanyFilterCount(appliedFilters);
  const query = useQuery({
    queryKey: ['companies', debouncedSearch, appliedFilters],
    queryFn: () => api<Envelope<Company[]>>(`/companies?${companyListQuery(debouncedSearch, appliedFilters)}`),
    placeholderData: (previous) => previous,
  });
  const filterOptions = useQuery({
    queryKey: ['company-filter-options'],
    queryFn: () => api<Envelope<CompanyFilterMetadata>>('/metadata'),
    enabled: filterOpen,
    staleTime: 5 * 60_000,
  });
  const toggleFilters = () => setFilterOpen((open) => {
    if (!open) setDraftFilters({ ...appliedFilters });
    return !open;
  });
  const clearFilters = () => {
    setDraftFilters({ ...EMPTY_COMPANY_FILTERS });
    setAppliedFilters({ ...EMPTY_COMPANY_FILTERS });
    setFilterOpen(false);
  };
  const applyFilters = () => {
    setAppliedFilters({
      ...draftFilters,
      sector: draftFilters.sector.trim(),
      size: draftFilters.size.trim(),
    });
    setFilterOpen(false);
  };
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['companies'] });
    void client.invalidateQueries({ queryKey: ['company'] });
  };
  const closeCreating = () => {
    setCreating(false);
    if (!searchParams.has('new')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, company: Company) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = 194;
    const top = rect.bottom + menuHeight + 10 > window.innerHeight
      ? rect.top - menuHeight - 6
      : rect.bottom + 6;
    setMenu({
      company,
      top: Math.max(10, top),
      right: Math.max(12, window.innerWidth - rect.right),
    });
  };

  if (query.isLoading) return <PageLoading />;
  const companies = query.data?.data || [];

  return <div className="list-page">
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="inline-search wide">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, domínio ou CNPJ…" />
        </div>
        <div className="list-filter-wrap">
          <button
            type="button"
            className={`filter-button ${activeFilters ? 'active' : ''}`}
            onClick={toggleFilters}
            aria-expanded={filterOpen}
          >
            <Filter size={15} />Filtros{activeFilters > 0 && <span>{activeFilters}</span>}
          </button>
          {filterOpen && <>
            <button type="button" className="list-filter-backdrop" onClick={() => setFilterOpen(false)} aria-label="Fechar filtros" />
            <form className="list-filter-panel" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
              <header>
                <div><strong>Filtrar empresas</strong><small>Refine as empresas exibidas na listagem</small></div>
                <button type="button" onClick={() => setFilterOpen(false)} aria-label="Fechar filtros"><X size={17} /></button>
              </header>
              <div className="list-filter-grid">
                <SelectField label="Responsável" value={draftFilters.ownerId} onChange={(event) => setDraftFilters((current) => ({ ...current, ownerId: event.target.value }))}>
                  <option value="">Todos os responsáveis</option>
                  <option value="none">Sem responsável</option>
                  {(filterOptions.data?.data.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </SelectField>
                <SelectField label="Equipe" value={draftFilters.teamId} onChange={(event) => setDraftFilters((current) => ({ ...current, teamId: event.target.value }))}>
                  <option value="">Todas as equipes</option>
                  <option value="none">Sem equipe</option>
                  {(filterOptions.data?.data.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </SelectField>
                <Field label="Setor contém" value={draftFilters.sector} onChange={(event) => setDraftFilters((current) => ({ ...current, sector: event.target.value }))} placeholder="Ex.: Tecnologia" maxLength={100} />
                <Field label="Porte contém" value={draftFilters.size} onChange={(event) => setDraftFilters((current) => ({ ...current, size: event.target.value }))} placeholder="Ex.: Médio" maxLength={60} />
                <SelectField label="Contatos vinculados" value={draftFilters.hasContacts} onChange={(event) => setDraftFilters((current) => ({ ...current, hasContacts: event.target.value as CompanyListFilters['hasContacts'] }))}>
                  <option value="">Com ou sem contatos</option>
                  <option value="true">Com contatos</option>
                  <option value="false">Sem contatos</option>
                </SelectField>
              </div>
              {filterOptions.isLoading && <p className="list-filter-message">Carregando responsáveis e equipes…</p>}
              {filterOptions.isError && <p className="list-filter-message error">Não foi possível carregar todas as opções de filtro.</p>}
              <footer>
                <button type="button" className="list-filter-clear" onClick={clearFilters} disabled={!activeFilters && !activeCompanyFilterCount(draftFilters)}>Limpar filtros</button>
                <Button type="submit">Aplicar filtros</Button>
              </footer>
            </form>
          </>}
        </div>
      </div>
      <div className="toolbar-actions">
        <a className="button button-secondary" href="/api/v1/reports/companies.csv" download><Download size={15} />Exportar</a>
        <Button onClick={() => setCreating(true)}><Plus size={15} />Nova empresa</Button>
      </div>
    </div>

    {companies.length
      ? <div className="table-card"><table>
        <thead><tr><th>Empresa</th><th>Setor</th><th>Responsável</th><th>Equipe</th><th>Relacionamentos</th><th>Atualizada</th><th /></tr></thead>
        <tbody>{companies.map((company) => <tr key={company.id}>
          <td><div className="entity-cell"><CompanyLogo company={company} /><div><strong>{company.name}</strong><small><Globe2 size={12} />{company.domain || (company.cnpj ? formatCnpj(company.cnpj) : '') || 'Sem domínio'}</small></div></div></td>
          <td><span className="neutral-pill">{company.sector || 'Não informado'}</span></td>
          <td>{company.owner?.name || 'Sem responsável'}</td>
          <td>{company.team ? <span className="team-label"><i style={{ background: company.team.color }} />{company.team.name}</span> : 'Sem equipe'}</td>
          <td><span className="relation-count"><Users size={14} />{company._count?.contacts || 0} contatos</span></td>
          <td>{dateTime(company.updatedAt)}</td>
          <td className="company-actions-cell">
            <button
              type="button"
              className="icon-button"
              onClick={(event) => openMenu(event, company)}
              aria-label={`Ações de ${company.name}`}
              aria-haspopup="menu"
              aria-expanded={menu?.company.id === company.id}
            >
              <MoreHorizontal size={17} />
            </button>
          </td>
        </tr>)}</tbody>
      </table></div>
      : <Empty
        icon={<Building2 />}
        title="Nenhuma empresa encontrada"
        description={activeFilters ? 'Ajuste ou limpe os filtros aplicados.' : 'Cadastre a primeira empresa ou ajuste a busca.'}
        action={activeFilters
          ? <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>
          : <Button onClick={() => setCreating(true)}>Adicionar empresa</Button>}
      />}

    {menu && <>
      <button type="button" className="action-menu-backdrop" onClick={() => setMenu(null)} aria-label="Fechar menu de ações" />
      <div className="contact-action-menu company-action-menu" role="menu" style={{ top: menu.top, right: menu.right }}>
        <button type="button" role="menuitem" onClick={() => { setViewingContacts(menu.company); setMenu(null); }}><Users size={16} />Ver contatos atribuídos</button>
        <button type="button" role="menuitem" onClick={() => { setEditing(menu.company); setMenu(null); }}><Pencil size={16} />Editar</button>
        <button type="button" role="menuitem" onClick={() => { setViewing(menu.company); setMenu(null); }}><Eye size={16} />Ver empresa</button>
        <button type="button" className="danger" role="menuitem" onClick={() => { setDeleting(menu.company); setMenu(null); }}><Trash2 size={16} />Excluir</button>
      </div>
    </>}

    {creating && <CompanyModal onClose={closeCreating} onSaved={() => { closeCreating(); refresh(); }} />}
    {editing && <CompanyModal company={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {viewing && <CompanyDrawer company={viewing} onClose={() => setViewing(null)} />}
    {viewingContacts && <CompanyContactsModal company={viewingContacts} onClose={() => setViewingContacts(null)} />}
    {deleting && <DeleteCompanyModal company={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); refresh(); }} />}
  </div>;
}

function CompanyModal({ company, onClose, onSaved }: Readonly<{
  company?: Company;
  onClose(): void;
  onSaved(): void;
}>) {
  const [form, setForm] = useState<CompanyForm>({
    name: company?.name || '',
    legalName: company?.legalName || '',
    cnpj: formatCnpj(company?.cnpj || ''),
    domain: company?.domain || '',
    linkedinUrl: company?.linkedinUrl || '',
    sector: company?.sector || '',
    size: company?.size || '',
    phone: company?.phone ? formatPhone(company.phone) : '',
    address: companyAddressText(company?.address),
  });
  const [addressDetails, setAddressDetails] = useState<Record<string, string> | undefined>(
    company?.address as Record<string, string> | undefined,
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoOrigin, setLogoOrigin] = useState<'manual' | 'auto' | null>(null);
  const [autoLogoDomain, setAutoLogoDomain] = useState('');
  const [suppressedAutoDomain, setSuppressedAutoDomain] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return;
    }
    const preview = URL.createObjectURL(logoFile);
    setLogoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logoFile]);
  const debouncedLogoDomain = useDebouncedValue(form.domain, 700);
  const logoLookupDomain = companyDomainHostname(debouncedLogoDomain);
  const hasPersistedLogo = Boolean(company?.logoId && !removeLogo);
  const logoLookup = useQuery({
    queryKey: ['company-domain-logo', logoLookupDomain],
    queryFn: () => api<Envelope<CompanyLogoLookup | null>>(`/companies/lookup/logo?domain=${encodeURIComponent(logoLookupDomain)}`),
    enabled: Boolean(
      logoLookupDomain
      && !hasPersistedLogo
      && logoOrigin !== 'manual'
      && suppressedAutoDomain !== logoLookupDomain
    ),
    staleTime: 30 * 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!logoLookupDomain) {
      if (logoOrigin === 'auto') {
        setLogoFile(null);
        setLogoOrigin(null);
        setAutoLogoDomain('');
      }
      return;
    }
    if (!logoLookup.isSuccess || logoOrigin === 'manual') return;
    const found = logoLookup.data?.data;
    if (!found) {
      if (logoOrigin === 'auto' && autoLogoDomain !== logoLookupDomain) {
        setLogoFile(null);
        setLogoOrigin(null);
        setAutoLogoDomain('');
      }
      return;
    }
    if (logoOrigin === 'auto' && autoLogoDomain === found.domain) return;
    try {
      setLogoFile(fileFromLogoLookup(found));
      setLogoOrigin('auto');
      setAutoLogoDomain(found.domain);
      setRemoveLogo(false);
    } catch {
      setLogoFile(null);
      setLogoOrigin(null);
      setAutoLogoDomain('');
    }
  }, [autoLogoDomain, logoLookup.data, logoLookup.isSuccess, logoLookupDomain, logoOrigin]);
  const lastAutomaticValues = useRef<Partial<CompanyForm>>({});
  const cnpjDigits = normalizeCnpj(form.cnpj);
  const validCnpj = cnpjDigits.length === 14 && isValidCnpj(cnpjDigits);
  const lookup = useQuery({
    queryKey: ['company-cnpj-lookup', cnpjDigits],
    queryFn: () => api<Envelope<CompanyCnpjLookup>>(`/companies/lookup/cnpj/${cnpjDigits}`),
    enabled: validCnpj,
    staleTime: 12 * 60 * 60_000,
    retry: false,
  });
  useEffect(() => {
    const companyData = lookup.data?.data;
    if (!companyData) return;
    const automatic: Partial<CompanyForm> = {
      name: companyData.name,
      legalName: companyData.legalName,
      sector: companyData.sector || '',
      size: companyData.size || '',
      phone: companyData.phone ? formatPhone(companyData.phone) : '',
      address: companyAddressText(companyData.address),
    };
    const shouldApplyAddress = Boolean(
      automatic.address
      && (!form.address.trim() || form.address === lastAutomaticValues.current.address),
    );
    setForm((current) => {
      const next = { ...current };
      (Object.keys(automatic) as Array<keyof CompanyForm>).forEach((key) => {
        const value = automatic[key];
        if (value && (!current[key].trim() || current[key] === lastAutomaticValues.current[key])) next[key] = value;
      });
      return next;
    });
    if (companyData.address && shouldApplyAddress) setAddressDetails(companyData.address);
    lastAutomaticValues.current = automatic;
  }, [lookup.data]);
  const mutation = useMutation({
    mutationFn: async () => {
      const { address, ...fields } = form;
      const saved = await api<Envelope<Company>>(company ? `/companies/${company.id}` : '/companies', {
        method: company ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...fields,
          address: address.trim() ? { ...addressDetails, formatted: address.trim() } : undefined,
        }),
      });
      let logoFailed = false;
      try {
        if (logoFile) {
          const created = await api<Envelope<{ id: string; uploadUrl: string }>>('/media/uploads', {
            method: 'POST',
            body: JSON.stringify({ filename: logoFile.name, contentType: logoFile.type, sizeBytes: logoFile.size }),
          });
          const uploaded = await fetch(created.data.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': logoFile.type },
            body: logoFile,
          });
          if (!uploaded.ok) throw new Error('Falha no envio da logo para o armazenamento');
          await api(`/companies/${saved.data.id}/logo`, {
            method: 'PATCH',
            body: JSON.stringify({ mediaAssetId: created.data.id }),
          });
        } else if (removeLogo && company?.logoId) {
          await api(`/companies/${saved.data.id}/logo`, { method: 'DELETE' });
        }
      } catch {
        logoFailed = true;
      }
      return { logoFailed };
    },
    onSuccess: ({ logoFailed }) => {
      if (logoFailed) toast.warning('A empresa foi salva, mas não foi possível atualizar a logo. Tente novamente pela edição.');
      else toast.success(company ? 'Empresa atualizada.' : 'Empresa cadastrada.');
      onSaved();
    },
  });
  const set = (key: keyof CompanyForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };
  const cnpjError = form.cnpj && (cnpjDigits.length !== 14 || !isValidCnpj(form.cnpj))
    ? 'Informe um CNPJ válido com 14 números.'
    : '';
  const setCnpj = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, cnpj: formatCnpj(event.target.value) }));
  };
  const chooseLogo = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Selecione uma logo JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A logo deve ter no máximo 5 MB.');
      return;
    }
    setLogoFile(file);
    setLogoOrigin('manual');
    setAutoLogoDomain('');
    setRemoveLogo(false);
  };
  const clearLogo = () => {
    setLogoFile(null);
    setLogoOrigin(null);
    setAutoLogoDomain('');
    setSuppressedAutoDomain(companyDomainHostname(form.domain));
    setRemoveLogo(Boolean(company?.logoId));
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  return <Modal title={company ? 'Editar empresa' : 'Cadastrar empresa'} onClose={onClose} width={640}>
    <form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!cnpjError) mutation.mutate(); }}>
      <div className="company-logo-picker">
        <div className={`company-logo-preview ${logoPreview || (company?.logoId && !removeLogo) ? 'has-image' : ''}`}>
          {companyLogoPreview(company, logoPreview, removeLogo, form.name)}
        </div>
        <div>
          <strong>Logo da empresa</strong>
          <small>{companyLogoMessage(
            logoLookup.isFetching,
            logoOrigin,
            Boolean(logoLookup.isSuccess && logoLookupDomain && !logoLookup.data?.data),
          )}</small>
          <span className="company-logo-actions">
            <Button type="button" variant="secondary" onClick={() => logoInputRef.current?.click()}><ImagePlus size={15} />Selecionar logo</Button>
            {(logoFile || (company?.logoId && !removeLogo)) && <Button type="button" variant="secondary" onClick={clearLogo}>Remover</Button>}
          </span>
        </div>
        <input
          ref={logoInputRef}
          className="company-logo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => chooseLogo(event.target.files?.[0])}
        />
      </div>
      <Field label="Nome da empresa" value={form.name} onChange={set('name')} required autoFocus />
      <Field label="Razão social" value={form.legalName} onChange={set('legalName')} />
      <div className="form-grid">
        <Field
          label="CNPJ"
          value={form.cnpj}
          onChange={setCnpj}
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          error={cnpjError}
          hint={cnpjLookupHint(lookup)}
          aria-busy={lookup.isFetching}
        />
        <Field label="Telefone" value={form.phone} onChange={set('phone')} placeholder="(00) 0000-0000" />
      </div>
      <div className="form-grid">
        <Field label="Domínio" value={form.domain} onChange={set('domain')} placeholder="empresa.com.br" />
        <Field label="Porte" value={form.size} onChange={set('size')} />
      </div>
      <Field label="LinkedIn" value={form.linkedinUrl} onChange={set('linkedinUrl')} placeholder="linkedin.com/company/empresa" inputMode="url" />
      <Field label="Setor" value={form.sector} onChange={set('sector')} title={form.sector} />
      <Field label="Endereço" value={form.address} onChange={set('address')} placeholder="Rua, número, cidade e estado" title={form.address} />
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={mutation.isPending} disabled={Boolean(cnpjError)}>
          {company ? 'Salvar alterações' : 'Salvar empresa'}
        </Button>
      </div>
    </form>
  </Modal>;
}

function useCompanyDetails(companyId: string) {
  return useQuery({
    queryKey: ['company', companyId],
    queryFn: () => api<Envelope<CompanyDetails>>(`/companies/${companyId}`),
  });
}

function CompanyContactsModal({ company, onClose }: Readonly<{ company: Company; onClose(): void }>) {
  const navigate = useNavigate();
  const details = useCompanyDetails(company.id);
  const contacts = details.data?.data.contacts || [];
  const [phoneMenu, setPhoneMenu] = useState<CompanyContactPhoneMenu | null>(null);
  const [startingConversation, setStartingConversation] = useState<CompanyContactDetails | null>(null);
  const openPhoneMenu = (event: React.MouseEvent<HTMLButtonElement>, contact: CompanyContactDetails) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = 92;
    const top = rect.bottom + menuHeight + 10 > window.innerHeight
      ? rect.top - menuHeight - 6
      : rect.bottom + 6;
    setPhoneMenu({
      contact,
      top: Math.max(10, top),
      right: Math.max(12, window.innerWidth - rect.right),
    });
  };
  const openEmailCampaign = (contact: CompanyContactDetails) => {
    navigate(`/email?new=campaign&contactId=${encodeURIComponent(contact.id)}`);
  };

  let content;
  if (details.isLoading) {
    content = <PageLoading />;
  } else if (details.isError) {
    content = <p className="company-modal-error">Não foi possível carregar os contatos vinculados.</p>;
  } else if (contacts.length) {
    content = <div className="company-contacts-modal-list">{contacts.map(({ contact, isPrimary }) => <article key={contact.id}>
            <span className="contact-avatar large">{initials(contact.name)}</span>
            <div>
              <strong>{contact.name}{isPrimary && <em>Principal</em>}</strong>
              <small>{contact.jobTitle || 'Cargo não informado'}</small>
              <span>
                {contact.email && <button type="button" className="company-contact-channel" onClick={() => openEmailCampaign(contact)}><Mail size={13} />{contact.email}</button>}
                {contact.phone && <button type="button" className="company-contact-channel" onClick={(event) => openPhoneMenu(event, contact)}><Phone size={13} />{formatPhone(contact.phone)}</button>}
              </span>
            </div>
          </article>)}</div>;
  } else {
    content = <Empty icon={<Users />} title="Nenhum contato atribuído" description="Esta empresa ainda não possui contatos vinculados." />;
  }

  return <Modal title={`Contatos de ${company.name}`} width={680} onClose={onClose}>
    {content}
    {phoneMenu && <>
      <button type="button" className="action-menu-backdrop company-contact-phone-scrim" onClick={() => setPhoneMenu(null)} aria-label="Fechar ações do telefone" />
      <div className="contact-action-menu company-contact-phone-menu" role="menu" style={{ top: phoneMenu.top, right: phoneMenu.right }}>
        <button type="button" role="menuitem" onClick={() => { setStartingConversation(phoneMenu.contact); setPhoneMenu(null); }}><MessageCircle size={16} />Iniciar conversa</button>
        <a role="menuitem" href={`tel:${phoneMenu.contact.phone}`} onClick={() => setPhoneMenu(null)}><Phone size={16} />Ligar</a>
      </div>
    </>}
    {startingConversation && <StartConversationModal contact={startingConversation} onClose={() => setStartingConversation(null)} />}
  </Modal>;
}

function CompanyDrawer({ company, onClose }: Readonly<{ company: Company; onClose(): void }>) {
  const details = useCompanyDetails(company.id);
  const data = details.data?.data;
  let content;
  if (details.isLoading) {
    content = <PageLoading />;
  } else if (details.isError || !data) {
    content = <div className="drawer-error">Não foi possível carregar os detalhes desta empresa.</div>;
  } else {
    content = <CompanyDrawerContent data={data} />;
  }

  return <>
    <button type="button" className="drawer-scrim" onClick={onClose} aria-label="Fechar detalhes da empresa" />
    <aside className="opportunity-drawer company-detail-drawer" aria-label="Detalhes da empresa">
      <header>
        <div className="company-drawer-title"><CompanyLogo company={data || company} large /><div><span className="eyebrow">Empresa</span><h2>{data?.name || company.name}</h2></div></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </header>
      {content}
    </aside>
  </>;
}

function CompanyDrawerContent({ data }: Readonly<{ data: CompanyDetails }>) {
  return <div className="drawer-content">
            <div className="drawer-summary">
              <div><span>Contatos</span><strong>{data.contacts.length}</strong></div>
              <div><span>Oportunidades</span><strong>{data.opportunities.length}</strong></div>
              <div><span>Tarefas</span><strong>{data.tasks.length}</strong></div>
            </div>

            <section className="drawer-grid">
              <div><h3><Globe2 size={17} />Domínio</h3><p>{data.domain || 'Não informado'}</p></div>
              <div><h3><Linkedin size={17} />LinkedIn</h3>{data.linkedinUrl ? <a href={data.linkedinUrl} target="_blank" rel="noreferrer">Abrir perfil</a> : <p>Não informado</p>}</div>
              <div><h3><Building2 size={17} />CNPJ</h3><p>{data.cnpj ? formatCnpj(data.cnpj) : 'Não informado'}</p></div>
              <div><h3><BriefcaseBusiness size={17} />Setor</h3><p>{data.sector || 'Não informado'}</p></div>
              <div><h3><Building2 size={17} />Porte</h3><p>{data.size || 'Não informado'}</p></div>
              <div><h3><UserRound size={17} />Responsável</h3><p>{data.owner?.name || 'Não atribuído'}</p></div>
              <div><h3><Users size={17} />Equipe</h3><p>{data.team?.name || 'Não atribuída'}</p></div>
              <div><h3><CalendarDays size={17} />Atualizada</h3><p>{dateTime(data.updatedAt)}</p></div>
              <div><h3><Phone size={17} />Telefone</h3>{data.phone ? <a href={`tel:${data.phone}`}>{formatPhone(data.phone)}</a> : <p>Não informado</p>}</div>
            </section>

            <section>
              <h3><Users size={17} />Contatos vinculados</h3>
              {data.contacts.length
                ? <div className="drawer-contact-list">{data.contacts.slice(0, 8).map(({ contact, isPrimary }) => <div key={contact.id}>
                  <span className="contact-avatar">{initials(contact.name)}</span>
                  <div>
                    <strong>{contact.name}{isPrimary && <em>Principal</em>}</strong>
                    <small>{contact.jobTitle || contact.email || 'Sem informações complementares'}</small>
                    {contact.phone && <a href={`tel:${contact.phone}`}><Phone size={13} />{formatPhone(contact.phone)}</a>}
                  </div>
                </div>)}</div>
                : <p className="drawer-muted">Nenhum contato vinculado.</p>}
            </section>

            <section>
              <h3><BriefcaseBusiness size={17} />Oportunidades</h3>
              {data.opportunities.length
                ? <div className="company-opportunity-list">{data.opportunities.slice(0, 8).map((opportunity) => <div key={opportunity.id}>
                  <div><strong>{opportunity.title}</strong><small>{opportunity.owner?.name || 'Sem responsável'}</small></div>
                  <span>{opportunity.stage?.name || opportunity.status}</span>
                </div>)}</div>
                : <p className="drawer-muted">Nenhuma oportunidade vinculada.</p>}
            </section>
          </div>;
}

function DeleteCompanyModal({ company, onClose, onDeleted }: Readonly<{
  company: Company;
  onClose(): void;
  onDeleted(): void;
}>) {
  const remove = useMutation({
    mutationFn: () => api(`/companies/${company.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Empresa excluída.');
      onDeleted();
    },
  });

  return <Modal title="Excluir empresa" onClose={onClose}>
    <div className="delete-confirm">
      <div className="delete-confirm-icon"><Trash2 size={22} /></div>
      <div>
        <h3>Excluir “{company.name}”?</h3>
        <p>A empresa deixará de aparecer no CRM. Os contatos, oportunidades e históricos já registrados serão preservados para auditoria.</p>
      </div>
    </div>
    <div className="modal-actions delete-actions">
      <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>Cancelar</Button>
      <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}><Trash2 size={16} />Excluir empresa</Button>
    </div>
  </Modal>;
}
