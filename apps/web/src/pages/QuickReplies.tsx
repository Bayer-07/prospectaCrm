import { type DragEvent, type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Image, MessageSquareReply, Paperclip, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { api, apiErrorMessage, type Envelope } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Empty, Field, Modal, PageLoading } from '../components/ui';
import { useAuth } from '../App';

export type QuickReply = {
  id: string;
  title: string;
  shortcut: string;
  text?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  mediaAsset?: { id: string; filename: string; contentType: string; sizeBytes: number } | null;
};

const QUICK_REPLY_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const QUICK_REPLY_TYPES = new Set(QUICK_REPLY_ACCEPT.split(','));

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateAttachment(file: File) {
  if (!QUICK_REPLY_TYPES.has(file.type)) return 'Selecione uma imagem, PDF ou documento Word.';
  if (!file.size || file.size > 25 * 1024 * 1024) return 'O anexo deve ter entre 1 byte e 25 MB.';
  return '';
}

export function QuickRepliesPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<QuickReply | null | 'new'>(null);
  const [deleting, setDeleting] = useState<QuickReply | null>(null);
  const query = useQuery({ queryKey: ['quick-replies'], queryFn: () => api<Envelope<QuickReply[]>>('/quick-replies') });
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR').replace(/^\//, '');
  const canWrite = Boolean(user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === 'conversations') && (permission.action === '*' || permission.action === 'write')));
  const replies = useMemo(() => (query.data?.data || []).filter((reply) => !normalizedSearch
    || `${reply.title} ${reply.shortcut} ${reply.text || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)), [normalizedSearch, query.data?.data]);

  if (query.isLoading) return <PageLoading />;
  return <div className="quick-replies-page">
    <div className="toolbar">
      <label className="inline-search wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, atalho ou texto…" /></label>
      {canWrite && <Button onClick={() => setEditing('new')}><Plus size={16} />Nova resposta</Button>}
    </div>
    {replies.length ? <div className="quick-reply-grid">{replies.map((reply) => <article className="quick-reply-card" key={reply.id}>
      <header><span className="quick-reply-icon"><MessageSquareReply size={19} /></span><div><h3>{reply.title}</h3><code>/{reply.shortcut}</code></div>{canWrite && <div className="quick-reply-actions"><button type="button" onClick={() => setEditing(reply)} aria-label={`Editar ${reply.title}`} title="Editar"><Pencil size={16} /></button><button type="button" onClick={() => setDeleting(reply)} aria-label={`Excluir ${reply.title}`} title="Excluir"><Trash2 size={16} /></button></div>}</header>
      <p>{reply.text || 'Resposta somente com anexo'}</p>
      {reply.mediaAsset && <div className="quick-reply-attachment">{reply.mediaAsset.contentType.startsWith('image/') ? <Image size={16} /> : <FileText size={16} />}<span><strong>{reply.mediaAsset.filename}</strong><small>{fileSize(reply.mediaAsset.sizeBytes)}</small></span></div>}
      <footer>Criada por {reply.createdBy.name}</footer>
    </article>)}</div> : <Empty icon={<MessageSquareReply />} title={query.data?.data.length ? 'Nenhuma resposta encontrada' : 'Crie sua primeira resposta rápida'} description={query.data?.data.length ? 'Tente buscar por outro nome, atalho ou trecho do texto.' : 'Cadastre textos e anexos que a equipe poderá inserir no atendimento digitando /.'} action={canWrite && !query.data?.data.length ? <Button onClick={() => setEditing('new')}>Nova resposta</Button> : undefined} />}
    {editing && <QuickReplyModal reply={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void client.invalidateQueries({ queryKey: ['quick-replies'] }); }} />}
    {deleting && <DeleteQuickReplyModal reply={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void client.invalidateQueries({ queryKey: ['quick-replies'] }); }} />}
  </div>;
}

function QuickReplyModal({ reply, onClose, onSaved }: { reply: QuickReply | null; onClose(): void; onSaved(): void }) {
  const [title, setTitle] = useState(reply?.title || '');
  const [shortcut, setShortcut] = useState(reply?.shortcut || '');
  const [text, setText] = useState(reply?.text || '');
  const [file, setFile] = useState<File | null>(null);
  const [removeCurrentFile, setRemoveCurrentFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      let mediaAssetId: string | null | undefined;
      if (file) {
        const created = await api<Envelope<{ id: string; uploadUrl: string }>>('/media/uploads', {
          method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
        });
        const uploaded = await fetch(created.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!uploaded.ok) throw new Error('Não foi possível concluir o upload do anexo');
        mediaAssetId = created.data.id;
      } else if (removeCurrentFile) mediaAssetId = null;
      const body = { title, shortcut, text, ...(mediaAssetId !== undefined ? { mediaAssetId } : {}) };
      return api<Envelope<QuickReply>>(reply ? `/quick-replies/${reply.id}` : '/quick-replies', {
        method: reply ? 'PATCH' : 'POST', body: JSON.stringify(body),
      });
    },
    onSuccess: () => { toast.success(reply ? 'Resposta rápida atualizada.' : 'Resposta rápida criada.'); onSaved(); },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível salvar a resposta rápida')),
  });
  const chooseFile = (candidate: File | null) => {
    if (!candidate) return;
    const error = validateAttachment(candidate);
    if (error) { setFileError(error); return; }
    setFile(candidate);
    setRemoveCurrentFile(false);
    setFileError('');
  };
  const dropFile = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] || null);
  };
  const hasAttachment = Boolean(file || (reply?.mediaAsset && !removeCurrentFile));
  const canSubmit = Boolean(title.trim() && shortcut.trim() && (text.trim() || hasAttachment));

  return <Modal title={reply ? 'Editar resposta rápida' : 'Nova resposta rápida'} onClose={() => !mutation.isPending && onClose()} width={640}>
    <form className="modal-form quick-reply-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (canSubmit) mutation.mutate(); }}>
      <div className="form-grid two"><Field label="Nome" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Apresentação comercial" required /><Field label="Atalho" value={shortcut} maxLength={41} onChange={(event) => setShortcut(event.target.value.replace(/^\//, ''))} placeholder="apresentacao" hint="No chat, use /apresentacao" required /></div>
      <label className="field"><span>Mensagem</span><textarea rows={7} maxLength={4096} value={text} onChange={(event) => setText(event.target.value)} placeholder="Digite o texto que será inserido no atendimento…" /><small>Variáveis como {'{{saudacao}}'} e {'{{nome}}'} serão substituídas somente no envio.</small></label>
      <label className={`quick-reply-dropzone${dragging ? ' dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={dropFile}>
        <input hidden type="file" accept={QUICK_REPLY_ACCEPT} onChange={(event) => { chooseFile(event.target.files?.[0] || null); event.currentTarget.value = ''; }} />
        <Upload size={20} /><span><strong>Adicionar imagem ou documento</strong><small>Clique ou arraste um arquivo de até 25 MB</small></span>
      </label>
      {fileError && <p className="form-error">{fileError}</p>}
      {file && <div className="quick-reply-selected-file"><Paperclip size={16} /><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><button type="button" onClick={() => setFile(null)} aria-label="Remover novo anexo"><X size={16} /></button></div>}
      {!file && reply?.mediaAsset && !removeCurrentFile && <div className="quick-reply-selected-file"><Paperclip size={16} /><span><strong>{reply.mediaAsset.filename}</strong><small>Anexo atual · {fileSize(reply.mediaAsset.sizeBytes)}</small></span><button type="button" onClick={() => setRemoveCurrentFile(true)} aria-label="Remover anexo atual"><X size={16} /></button></div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>{reply ? 'Salvar alterações' : 'Criar resposta'}</Button></div>
    </form>
  </Modal>;
}

function DeleteQuickReplyModal({ reply, onClose, onDeleted }: { reply: QuickReply; onClose(): void; onDeleted(): void }) {
  const mutation = useMutation({
    mutationFn: () => api(`/quick-replies/${reply.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Resposta rápida excluída.'); onDeleted(); },
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível excluir a resposta rápida')),
  });
  return <Modal title="Excluir resposta rápida" onClose={() => !mutation.isPending && onClose()}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{reply.title}”?</h3><p>O atalho <strong>/{reply.shortcut}</strong> deixará de aparecer no composer para toda a equipe.</p></div></div><div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir resposta</Button></div></Modal>;
}
