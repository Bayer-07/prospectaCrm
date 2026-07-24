import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ContactRound, KanbanSquare, LoaderCircle, Search, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api, money, type Envelope } from '../lib/api';
import { useDebouncedValue } from '../lib/useDebouncedValue';

type SearchCompany = {
  id: string;
  name: string;
  domain?: string;
  cnpj?: string;
  sector?: string;
};

type SearchContact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  companies?: Array<{ company: { name: string } }>;
};

type SearchOpportunity = {
  id: string;
  title: string;
  valueCents: number;
  company?: { name: string };
  pipeline?: { id: string; name: string };
  stage?: { name: string };
};

type SearchResult = {
  id: string;
  type: 'company' | 'contact' | 'opportunity';
  section: string;
  title: string;
  subtitle: string;
  target: string;
};

const resultIcons = {
  company: Building2,
  contact: ContactRound,
  opportunity: KanbanSquare,
} satisfies Record<SearchResult['type'], typeof Search>;

export function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const term = useDebouncedValue(query.trim(), 220);
  const ready = term.length >= 2;
  const canRead = (resource: string) => Boolean(user?.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === resource)
    && (permission.action === '*' || permission.action === 'read')));

  const companies = useQuery({
    queryKey: ['global-search', 'companies', term],
    queryFn: () => api<Envelope<SearchCompany[]>>(`/companies?limit=5&search=${encodeURIComponent(term)}`),
    enabled: ready && canRead('companies'),
    staleTime: 30_000,
  });
  const contacts = useQuery({
    queryKey: ['global-search', 'contacts', term],
    queryFn: () => api<Envelope<SearchContact[]>>(`/contacts?limit=5&search=${encodeURIComponent(term)}`),
    enabled: ready && canRead('contacts'),
    staleTime: 30_000,
  });
  const opportunities = useQuery({
    queryKey: ['global-search', 'opportunities', term],
    queryFn: () => api<Envelope<SearchOpportunity[]>>(`/opportunities?limit=5&search=${encodeURIComponent(term)}`),
    enabled: ready && canRead('opportunities'),
    staleTime: 30_000,
  });

  const results = useMemo<SearchResult[]>(() => [
    ...(companies.data?.data || []).map((company) => ({
      id: company.id,
      type: 'company' as const,
      section: 'Empresas',
      title: company.name,
      subtitle: company.domain || company.cnpj || company.sector || 'Empresa',
      target: `/empresas?search=${encodeURIComponent(company.name)}`,
    })),
    ...(contacts.data?.data || []).map((contact) => ({
      id: contact.id,
      type: 'contact' as const,
      section: 'Contatos',
      title: contact.name,
      subtitle: contact.email || contact.phone || contact.companies?.[0]?.company.name || contact.jobTitle || 'Contato',
      target: `/contatos?search=${encodeURIComponent(contact.name)}`,
    })),
    ...(opportunities.data?.data || []).map((opportunity) => ({
      id: opportunity.id,
      type: 'opportunity' as const,
      section: 'Oportunidades',
      title: opportunity.title,
      subtitle: [
        opportunity.company?.name,
        opportunity.stage?.name,
        money(opportunity.valueCents),
      ].filter(Boolean).join(' · '),
      target: `/pipeline?opportunity=${encodeURIComponent(opportunity.id)}${opportunity.pipeline?.id ? `&pipeline=${encodeURIComponent(opportunity.pipeline.id)}` : ''}`,
    })),
  ], [companies.data, contacts.data, opportunities.data]);
  const loading = ready && (companies.isFetching || contacts.isFetching || opportunities.isFetching);
  const failed = ready && (companies.isError || contacts.isError || opportunities.isError);

  const openResult = (result: SearchResult) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(result.target);
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.key.toLocaleLowerCase() !== 'k') return;
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setActiveIndex(0);
  }, [term]);

  return <div className={`global-search${open ? ' open' : ''}`} ref={rootRef}>
    <Search size={16} />
    <input
      ref={inputRef}
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && results.length) {
          event.preventDefault();
          setActiveIndex((current) => Math.min(results.length - 1, current + 1));
        } else if (event.key === 'ArrowUp' && results.length) {
          event.preventDefault();
          setActiveIndex((current) => Math.max(0, current - 1));
        } else if (event.key === 'Enter' && results[activeIndex]) {
          event.preventDefault();
          openResult(results[activeIndex]);
        } else if (event.key === 'Escape') {
          setOpen(false);
          inputRef.current?.blur();
        }
      }}
      placeholder="Buscar empresas, contatos ou oportunidades…"
      role="combobox"
      aria-expanded={open}
      aria-controls="global-search-results"
      aria-activedescendant={results[activeIndex] ? `global-result-${results[activeIndex].type}-${results[activeIndex].id}` : undefined}
      autoComplete="off"
    />
    {query
      ? <button
        type="button"
        className="global-search-clear"
        onClick={() => {
          setQuery('');
          setOpen(true);
          inputRef.current?.focus();
        }}
        aria-label="Limpar busca"
      ><X size={14} /></button>
      : <kbd>Ctrl + K</kbd>}

    {open && <div className="global-search-results" id="global-search-results" role="listbox">
      {!ready
        ? <div className="global-search-state"><Search size={18} /><span>Digite pelo menos 2 caracteres para buscar.</span></div>
        : loading && !results.length
          ? <div className="global-search-state"><LoaderCircle className="spin" size={18} /><span>Buscando no CRM…</span></div>
          : failed && !results.length
            ? <div className="global-search-state error"><span>Não foi possível realizar a busca.</span></div>
            : !results.length
              ? <div className="global-search-state"><span>Nenhum resultado encontrado para “{term}”.</span></div>
              : <div className="global-search-list">
                {results.map((result, index) => {
                  const Icon = resultIcons[result.type];
                  const showSection = index === 0 || results[index - 1].section !== result.section;
                  return <div className="global-search-group" key={`${result.type}-${result.id}`}>
                    {showSection && <span className="global-search-section">{result.section}</span>}
                    <button
                      id={`global-result-${result.type}-${result.id}`}
                      type="button"
                      className={`global-search-result${activeIndex === index ? ' active' : ''}`}
                      role="option"
                      aria-selected={activeIndex === index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openResult(result)}
                    >
                      <span className={`global-search-result-icon ${result.type}`}><Icon size={16} /></span>
                      <span><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                      <ArrowRight size={15} />
                    </button>
                  </div>;
                })}
              </div>}
      {loading && results.length > 0 && <LoaderCircle className="global-search-inline-loader spin" size={15} />}
    </div>}
  </div>;
}
