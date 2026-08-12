import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContactRound, Filter, LoaderCircle, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatPhone, initials, type Envelope } from '../lib/api';
import type { Contact } from '../lib/types';
import { Button, Empty, Field, Modal, PageLoading, SelectField } from '../components/ui';
import { ContactModal } from '../components/ContactModal';
import { StartConversationModal } from '../components/StartConversationModal';
import { ContactImportModal } from '../components/ContactImportModal';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { toast } from '../lib/toast';
import {
  activeContactFilterCount,
  contactListQuery,
  EMPTY_CONTACT_FILTERS,
  type ContactListFilters,
} from '../lib/contact-filters';

type ContactMenu = { contact: Contact; top: number; right: number };
type ContactFilterMetadata = {
  users: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
};

export function ContactsPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSearch = searchParams.get('search') || '';
  const requestedCreate = searchParams.get('new') === '1';
  const [search, setSearch] = useState(requestedSearch);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [starting, setStarting] = useState<Contact | null>(null);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<ContactMenu | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<ContactListFilters>({ ...EMPTY_CONTACT_FILTERS });
  const [draftFilters, setDraftFilters] = useState<ContactListFilters>({ ...EMPTY_CONTACT_FILTERS });
  useEffect(() => setSearch(requestedSearch), [requestedSearch]);
  useEffect(() => {
    if (requestedCreate) setCreating(true);
  }, [requestedCreate]);
  const debouncedSearch = useDebouncedValue(search);
  const activeFilters = activeContactFilterCount(appliedFilters);
  const query = useInfiniteQuery({
    queryKey: ['contacts', debouncedSearch, appliedFilters],
    queryFn: ({ pageParam }) => api<Envelope<Contact[]>>(`/contacts?${contactListQuery(debouncedSearch, appliedFilters, pageParam)}`),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor || undefined,
  });
  const contacts = useMemo(() => {
    const uniqueContacts = new Map<string, Contact>();
    for (const page of query.data?.pages || []) {
      for (const contact of page.data) uniqueContacts.set(contact.id, contact);
    }
    return [...uniqueContacts.values()];
  }, [query.data?.pages]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '320px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const filterOptions = useQuery({
    queryKey: ['contact-filter-options'],
    queryFn: () => api<Envelope<ContactFilterMetadata>>('/metadata'),
    enabled: filterOpen,
    staleTime: 5 * 60_000,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['contacts'] });
  const closeCreating = () => {
    setCreating(false);
    if (!searchParams.has('new')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };
  const toggleFilters = () => setFilterOpen((open) => {
    if (!open) setDraftFilters({ ...appliedFilters });
    return !open;
  });
  const clearFilters = () => {
    setDraftFilters({ ...EMPTY_CONTACT_FILTERS });
    setAppliedFilters({ ...EMPTY_CONTACT_FILTERS });
    setFilterOpen(false);
  };
  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters, company: draftFilters.company.trim() });
    setFilterOpen(false);
  };

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, contact: Contact) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = 142;
    const top = rect.bottom + menuHeight + 10 > window.innerHeight ? rect.top - menuHeight - 6 : rect.bottom + 6;
    setMenu({ contact, top: Math.max(10, top), right: Math.max(12, window.innerWidth - rect.right) });
  };
  const openEmailCampaign = (contact: Contact) => {
    if (!contact.email) return;
    navigate(`/email?new=campaign&contactId=${encodeURIComponent(contact.id)}`);
  };

  if (query.isLoading) return <PageLoading />;
  return <div className="list-page">
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="inline-search wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail ou telefone…" /></div>
        <div className="list-filter-wrap">
          <button type="button" className={`filter-button ${activeFilters ? 'active' : ''}`} onClick={toggleFilters} aria-expanded={filterOpen}><Filter size={15} />Filtros{activeFilters > 0 && <span>{activeFilters}</span>}</button>
          {filterOpen && <>
            <button type="button" className="list-filter-backdrop" onClick={() => setFilterOpen(false)} aria-label="Fechar filtros" />
            <form className="list-filter-panel" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
              <header><div><strong>Filtrar contatos</strong><small>Refine os contatos exibidos na listagem</small></div><button type="button" onClick={() => setFilterOpen(false)} aria-label="Fechar filtros"><X size={17} /></button></header>
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
                <SelectField label="Tag" value={draftFilters.tagId} onChange={(event) => setDraftFilters((current) => ({ ...current, tagId: event.target.value }))}>
                  <option value="">Todas as tags</option>
                  {(filterOptions.data?.data.tags || []).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </SelectField>
                <Field label="Empresa contém" value={draftFilters.company} onChange={(event) => setDraftFilters((current) => ({ ...current, company: event.target.value }))} placeholder="Ex.: BZS" maxLength={160} />
                <SelectField label="Telefone" value={draftFilters.hasPhone} onChange={(event) => setDraftFilters((current) => ({ ...current, hasPhone: event.target.value as ContactListFilters['hasPhone'] }))}>
                  <option value="">Com ou sem telefone</option>
                  <option value="true">Com telefone</option>
                  <option value="false">Sem telefone</option>
                </SelectField>
                <SelectField label="E-mail" value={draftFilters.hasEmail} onChange={(event) => setDraftFilters((current) => ({ ...current, hasEmail: event.target.value as ContactListFilters['hasEmail'] }))}>
                  <option value="">Com ou sem e-mail</option>
                  <option value="true">Com e-mail</option>
                  <option value="false">Sem e-mail</option>
                </SelectField>
              </div>
              {filterOptions.isLoading && <p className="list-filter-message">Carregando responsáveis, equipes e tags…</p>}
              {filterOptions.isError && <p className="list-filter-message error">Não foi possível carregar todas as opções de filtro.</p>}
              <footer><button type="button" className="list-filter-clear" onClick={clearFilters} disabled={!activeFilters && !activeContactFilterCount(draftFilters)}>Limpar filtros</button><Button type="submit">Aplicar filtros</Button></footer>
            </form>
          </>}
        </div>
      </div>
      <div className="toolbar-actions">
        <button type="button" className="button button-secondary" onClick={() => setImporting(true)}><Upload size={15} />Importar contatos</button>
        <Button onClick={() => setCreating(true)}><Plus size={15} />Novo contato</Button>
      </div>
    </div>
    {contacts.length ? <><div className="table-card"><table>
      <thead><tr><th>Contato</th><th>Empresa</th><th>Telefone</th><th>Responsável</th><th>Tags</th><th /></tr></thead>
      <tbody>{contacts.map((contact) => <tr key={contact.id}>
        <td><div className="entity-cell"><span className="contact-avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong>{contact.email
          ? <button type="button" className="contact-email-link" onClick={() => openEmailCampaign(contact)} title="Criar campanha de e-mail"><Mail size={12} />{contact.email}</button>
          : <small><Mail size={12} />{contact.jobTitle || 'Sem e-mail'}</small>}</div></div></td>
        <td>{contact.companies?.[0]?.company.name || 'Sem empresa'}</td>
        <td><span className="phone-cell"><MessageCircle size={13} />{formatPhone(contact.phone) || '—'}</span></td>
        <td>{contact.owner?.name || 'Sem responsável'}</td>
        <td><div className="tag-list">{contact.tags?.slice(0, 2).map(({ tag }) => <span key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span>)}</div></td>
        <td className="contact-actions-cell"><button type="button" className="icon-button" onClick={(event) => openMenu(event, contact)} aria-label={`Ações de ${contact.name}`} aria-haspopup="menu" aria-expanded={menu?.contact.id === contact.id}><MoreHorizontal size={17} /></button></td>
      </tr>)}</tbody>
    </table></div>{(hasNextPage || isFetchingNextPage) && <div ref={loadMoreRef} className="list-infinite-loader" aria-live="polite">{isFetchingNextPage ? <><LoaderCircle size={18} className="spin" />Carregando mais 20 contatos…</> : 'Continue rolando para carregar mais contatos'}</div>}</> : <Empty icon={<ContactRound />} title="Nenhum contato encontrado" description={activeFilters ? 'Ajuste ou limpe os filtros aplicados.' : 'Cadastre um contato ou importe sua base em CSV.'} action={activeFilters ? <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button> : <Button onClick={() => setCreating(true)}>Adicionar contato</Button>} />}

    {menu && <>
      <button type="button" className="action-menu-backdrop" onClick={() => setMenu(null)} aria-label="Fechar menu de ações" />
      <div className="contact-action-menu" role="menu" style={{ top: menu.top, right: menu.right }}>
        <button type="button" role="menuitem" onClick={() => { setEditing(menu.contact); setMenu(null); }}><Pencil size={16} />Editar</button>
        <button type="button" role="menuitem" onClick={() => {
          if (!menu.contact.phone) toast.warning(`Adicione um telefone ao contato ${menu.contact.name} antes de iniciar a conversa.`);
          else setStarting(menu.contact);
          setMenu(null);
        }}><MessageCircle size={16} />Iniciar conversa</button>
        <button type="button" className="danger" role="menuitem" onClick={() => { setDeleting(menu.contact); setMenu(null); }}><Trash2 size={16} />Excluir</button>
      </div>
    </>}
    {creating && <ContactModal onClose={closeCreating} onSaved={() => { closeCreating(); refresh(); }} />}
    {editing && <ContactModal contact={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {starting && <StartConversationModal contact={starting} onClose={() => setStarting(null)} />}
    {importing && <ContactImportModal onClose={() => setImporting(false)} onImported={() => { setImporting(false); refresh(); }} />}
    {deleting && <DeleteContactModal contact={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); refresh(); }} />}
  </div>;
}

function DeleteContactModal({ contact, onClose, onDeleted }: Readonly<{ contact: Contact; onClose(): void; onDeleted(): void }>) {
  const remove = useMutation({ mutationFn: () => api(`/contacts/${contact.id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Contato excluído.'); onDeleted(); } });
  return <Modal title="Excluir contato" onClose={onClose}>
    <div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{contact.name}”?</h3><p>O contato deixará de aparecer no CRM. O histórico comercial e as conversas já registradas serão preservados para auditoria.</p></div></div>
    <div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}><Trash2 size={16} />Excluir contato</Button></div>
  </Modal>;
}
