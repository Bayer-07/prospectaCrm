import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { api, apiErrorMessage, type Envelope } from '../lib/api';
import { Button, Empty, Modal, PageLoading } from '../components/ui';
import { TagModal, type TagRecord } from '../components/TagModal';
import { useAuth } from '../App';
import { toast } from '../lib/toast';

function canWriteContacts(permissions: Array<{ resource: string; action: string }>) {
  return permissions.some((permission) => (permission.resource === '*' || permission.resource === 'contacts')
    && (permission.action === '*' || permission.action === 'write'));
}

export function TagsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TagRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TagRecord | null>(null);
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: () => api<Envelope<TagRecord[]>>('/tags') });
  const canWrite = canWriteContacts(user?.permissions || []);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const tags = useMemo(() => (tagsQuery.data?.data || []).filter((tag) => !normalizedSearch || tag.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)), [normalizedSearch, tagsQuery.data?.data]);

  if (tagsQuery.isLoading) return <PageLoading />;
  return <div className="tags-page">
    <div className="toolbar">
      <label className="inline-search wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tags…" /></label>
      {canWrite && <Button onClick={() => setEditing('new')}><Plus size={16} />Nova tag</Button>}
    </div>
    {tags.length ? <div className="tags-grid">{tags.map((tag) => <article className="tag-card" key={tag.id}>
      <div className="tag-card-header"><span className="tag-card-icon" style={{ background: `${tag.color}20`, color: tag.color }}><Tag size={19} /></span><div><h3>{tag.name}</h3><p>{tag._count?.contacts === 1 ? '1 contato' : `${tag._count?.contacts || 0} contatos`}</p></div></div>
      <div className="tag-card-preview"><span style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span><i style={{ background: tag.color }} /></div>
      {canWrite && <footer><button type="button" onClick={() => setEditing(tag)}><Pencil size={15} />Editar</button><button type="button" className="danger" onClick={() => setDeleting(tag)}><Trash2 size={15} />Excluir</button></footer>}
    </article>)}</div> : <Empty icon={<Tag />} title={tagsQuery.data?.data.length ? 'Nenhuma tag encontrada' : 'Crie sua primeira tag'} description={tagsQuery.data?.data.length ? 'Tente buscar por outro nome.' : 'Organize os contatos com etiquetas visuais e use-as nos filtros e chatbots.'} action={canWrite && !tagsQuery.data?.data.length ? <Button onClick={() => setEditing('new')}><Plus size={16} />Criar tag</Button> : undefined} />}
    {editing && <TagModal tag={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void client.invalidateQueries({ queryKey: ['tags'] }); void client.invalidateQueries({ queryKey: ['contact-filter-options'] }); void client.invalidateQueries({ queryKey: ['chatbot-metadata'] }); void client.invalidateQueries({ queryKey: ['workflow-metadata'] }); }} />}
    {deleting && <DeleteTagModal tag={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void client.invalidateQueries({ queryKey: ['tags'] }); void client.invalidateQueries({ queryKey: ['contact-filter-options'] }); void client.invalidateQueries({ queryKey: ['chatbot-metadata'] }); void client.invalidateQueries({ queryKey: ['workflow-metadata'] }); void client.invalidateQueries({ queryKey: ['contacts'] }); }} />}
  </div>;
}

function DeleteTagModal({ tag, onClose, onDeleted }: Readonly<{ tag: TagRecord; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({
    mutationFn: () => api(`/tags/${tag.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Tag excluída.'); onDeleted(); },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível excluir a tag')),
  });
  return <Modal title="Excluir tag" onClose={() => !mutation.isPending && onClose()}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{tag.name}”?</h3><p>A tag será removida dos contatos e deixará de aparecer nos filtros e nas configurações de automações.</p></div></div><div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir tag</Button></div></Modal>;
}
