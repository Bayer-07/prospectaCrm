import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { api, apiErrorMessage, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading } from '../components/ui';
import { useAuth } from '../App';
import { toast } from '../lib/toast';

export type TagRecord = {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
};

const TAG_COLORS = ['#64748b', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2'];

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

function TagModal({ tag, onClose, onSaved }: Readonly<{ tag: TagRecord | null; onClose(): void; onSaved(): void }>) {
  const [name, setName] = useState(tag?.name || '');
  const [color, setColor] = useState(tag?.color || TAG_COLORS[0]);
  const mutation = useMutation({
    mutationFn: () => api<Envelope<TagRecord>>(tag ? `/tags/${tag.id}` : '/tags', {
      method: tag ? 'PATCH' : 'POST',
      body: JSON.stringify({ name: name.trim(), color }),
    }),
    onSuccess: () => { toast.success(tag ? 'Tag atualizada.' : 'Tag criada.'); onSaved(); },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível salvar a tag')),
  });
  const valid = name.trim().length >= 2;
  return <Modal title={tag ? 'Editar tag' : 'Nova tag'} onClose={() => !mutation.isPending && onClose()} width={460}>
    <form className="modal-form tag-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (valid) mutation.mutate(); }}>
      <Field label="Nome da tag" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Cliente VIP" maxLength={80} autoFocus required />
      <div className="tag-color-field"><span>Cor da tag</span><div className="tag-color-control"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Escolher cor da tag" /><code>{color.toUpperCase()}</code></div><div className="tag-color-swatches" aria-label="Cores sugeridas">{TAG_COLORS.map((preset) => <button type="button" key={preset} className={color.toLowerCase() === preset ? 'active' : ''} style={{ background: preset }} onClick={() => setColor(preset)} aria-label={`Usar cor ${preset}`} />)}</div></div>
      <div className="tag-preview"><span>Pré-visualização</span><strong style={{ '--tag-color': color } as React.CSSProperties}><i style={{ background: color }} />{name.trim() || 'Nome da tag'}</strong></div>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" loading={mutation.isPending} disabled={!valid}>{tag ? 'Salvar alterações' : 'Criar tag'}</Button></div>
    </form>
  </Modal>;
}

function DeleteTagModal({ tag, onClose, onDeleted }: Readonly<{ tag: TagRecord; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({
    mutationFn: () => api(`/tags/${tag.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Tag excluída.'); onDeleted(); },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível excluir a tag')),
  });
  return <Modal title="Excluir tag" onClose={() => !mutation.isPending && onClose()}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{tag.name}”?</h3><p>A tag será removida dos contatos e deixará de aparecer nos filtros e nas configurações de automações.</p></div></div><div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir tag</Button></div></Modal>;
}
