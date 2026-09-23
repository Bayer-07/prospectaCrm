import { type FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, apiErrorMessage, type Envelope } from '../lib/api';
import { Button, Field, Modal } from './ui';
import { toast } from '../lib/toast';

export type TagRecord = {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
};

const TAG_COLORS = ['#64748b', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2'];

export function TagModal({ tag, initialName = '', onClose, onSaved }: Readonly<{ tag: TagRecord | null; initialName?: string; onClose(): void; onSaved(tag: TagRecord): void }>) {
  const [name, setName] = useState(tag?.name || initialName);
  const [color, setColor] = useState(tag?.color || TAG_COLORS[0]);
  const mutation = useMutation({
    mutationFn: () => api<Envelope<TagRecord>>(tag ? `/tags/${tag.id}` : '/tags', {
      method: tag ? 'PATCH' : 'POST',
      body: JSON.stringify({ name: name.trim(), color }),
    }),
    onSuccess: (response) => { toast.success(tag ? 'Tag atualizada.' : 'Tag criada.'); onSaved(response.data); },
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
