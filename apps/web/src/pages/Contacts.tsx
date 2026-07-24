import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContactRound, Download, Filter, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, initials, type Envelope } from '../lib/api';
import type { Contact } from '../lib/types';
import { Button, Empty, Modal, PageLoading, SelectField, Status } from '../components/ui';
import { ContactModal } from '../components/ContactModal';
import { useDebouncedValue } from '../lib/useDebouncedValue';

type ContactMenu = { contact: Contact; top: number; right: number };
type WhatsappInstance = { id: string; name: string; phone?: string; status: string };

export function ContactsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [starting, setStarting] = useState<Contact | null>(null);
  const [menu, setMenu] = useState<ContactMenu | null>(null);
  const [actionError, setActionError] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const query = useQuery({
    queryKey: ['contacts', debouncedSearch],
    queryFn: () => api<Envelope<Contact[]>>(`/contacts?limit=100&search=${encodeURIComponent(debouncedSearch)}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['contacts'] });

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, contact: Contact) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = 142;
    const top = rect.bottom + menuHeight + 10 > window.innerHeight ? rect.top - menuHeight - 6 : rect.bottom + 6;
    setActionError('');
    setMenu({ contact, top: Math.max(10, top), right: Math.max(12, window.innerWidth - rect.right) });
  };

  if (query.isLoading) return <PageLoading />;
  return <div className="list-page">
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="inline-search wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail ou telefone…" /></div>
        <button className="filter-button"><Filter size={15} />Filtros</button>
      </div>
      <div className="toolbar-actions">
        <button className="button button-secondary"><Download size={15} />Importar CSV</button>
        <Button onClick={() => setCreating(true)}><Plus size={15} />Novo contato</Button>
      </div>
    </div>
    {actionError && <div className="inline-alert contact-action-error">{actionError}</div>}
    {query.data?.data.length ? <div className="table-card"><table>
      <thead><tr><th>Contato</th><th>Empresa</th><th>Telefone</th><th>Consentimento</th><th>Responsável</th><th>Tags</th><th /></tr></thead>
      <tbody>{query.data.data.map((contact) => <tr key={contact.id}>
        <td><div className="entity-cell"><span className="contact-avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong><small><Mail size={12} />{contact.email || contact.jobTitle || 'Sem e-mail'}</small></div></div></td>
        <td>{contact.companies?.[0]?.company.name || 'Sem empresa'}</td>
        <td><span className="phone-cell"><MessageCircle size={13} />{contact.phone || '—'}</span></td>
        <td><Status value={contact.consentStatus} /></td>
        <td>{contact.owner?.name || 'Sem responsável'}</td>
        <td><div className="tag-list">{contact.tags?.slice(0, 2).map(({ tag }) => <span key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span>)}</div></td>
        <td className="contact-actions-cell"><button className="icon-button" onClick={(event) => openMenu(event, contact)} aria-label={`Ações de ${contact.name}`} aria-haspopup="menu" aria-expanded={menu?.contact.id === contact.id}><MoreHorizontal size={17} /></button></td>
      </tr>)}</tbody>
    </table></div> : <Empty icon={<ContactRound />} title="Nenhum contato encontrado" description="Cadastre um contato ou importe sua base em CSV." action={<Button onClick={() => setCreating(true)}>Adicionar contato</Button>} />}

    {menu && <>
      <button className="action-menu-backdrop" onClick={() => setMenu(null)} aria-label="Fechar menu de ações" />
      <div className="contact-action-menu" role="menu" style={{ top: menu.top, right: menu.right }}>
        <button role="menuitem" onClick={() => { setEditing(menu.contact); setMenu(null); }}><Pencil size={16} />Editar</button>
        <button role="menuitem" onClick={() => {
          if (!menu.contact.phone) setActionError(`Adicione um telefone ao contato ${menu.contact.name} antes de iniciar a conversa.`);
          else setStarting(menu.contact);
          setMenu(null);
        }}><MessageCircle size={16} />Iniciar conversa</button>
        <button className="danger" role="menuitem" onClick={() => { setDeleting(menu.contact); setMenu(null); }}><Trash2 size={16} />Excluir</button>
      </div>
    </>}
    {creating && <ContactModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
    {editing && <ContactModal contact={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {starting && <StartConversationModal contact={starting} onClose={() => setStarting(null)} />}
    {deleting && <DeleteContactModal contact={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); refresh(); }} />}
  </div>;
}

function StartConversationModal({ contact, onClose }: { contact: Contact; onClose(): void }) {
  const navigate = useNavigate();
  const instances = useQuery({ queryKey: ['conversation-instances'], queryFn: () => api<Envelope<WhatsappInstance[]>>('/conversations/instances') });
  const [instanceId, setInstanceId] = useState('');
  useEffect(() => {
    if (!instanceId && instances.data?.data[0]) setInstanceId(instances.data.data[0].id);
  }, [instanceId, instances.data]);
  const start = useMutation({
    mutationFn: () => api<Envelope<{ id: string }>>('/conversations/start', { method: 'POST', body: JSON.stringify({ contactId: contact.id, instanceId }) }),
    onSuccess: (result) => navigate(`/inbox/${result.data.id}`),
  });
  return <Modal title="Iniciar conversa" onClose={onClose}>
    <div className="conversation-start-intro"><span className="contact-avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong><p>{contact.phone}</p></div></div>
    {instances.isLoading ? <PageLoading /> : instances.error ? <div className="form-error conversation-start-error">{instances.error.message}</div> : instances.data?.data.length ? <form className="modal-form" onSubmit={(event) => { event.preventDefault(); start.mutate(); }}>
      <SelectField label="Enviar pelo número" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>{instances.data.data.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${instance.phone}` : ''}</option>)}</SelectField>
      <p className="form-hint">A conversa será aberta no Inbox. A mensagem só será enviada quando você escrever e confirmar o envio.</p>
      {start.error && <div className="form-error">{start.error.message}</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={start.isPending} disabled={!instanceId}><MessageCircle size={16} />Abrir conversa</Button></div>
    </form> : <div className="conversation-start-empty"><strong>Nenhuma conexão disponível</strong><p>Conecte um número do WhatsApp antes de iniciar a conversa.</p><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Fechar</Button></div></div>}
  </Modal>;
}

function DeleteContactModal({ contact, onClose, onDeleted }: { contact: Contact; onClose(): void; onDeleted(): void }) {
  const remove = useMutation({ mutationFn: () => api(`/contacts/${contact.id}`, { method: 'DELETE' }), onSuccess: onDeleted });
  return <Modal title="Excluir contato" onClose={onClose}>
    <div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{contact.name}”?</h3><p>O contato deixará de aparecer no CRM. O histórico comercial e as conversas já registradas serão preservados para auditoria.</p></div></div>
    {remove.error && <div className="form-error delete-error">{remove.error.message}</div>}
    <div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}><Trash2 size={16} />Excluir contato</Button></div>
  </Modal>;
}
