import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, Mail, Plus, Send, Settings2 } from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading } from '../components/ui';

type Template = { id: string; name: string; subject: string; html: string; updatedAt: string };

export function EmailPage() {
  const client = useQueryClient(); const [modal, setModal] = useState(false);
  const query = useQuery({ queryKey: ['email-templates'], queryFn: () => api<Envelope<Template[]>>('/email/templates') });
  if (query.isLoading) return <PageLoading />;
  return <div className="email-page"><div className="channel-disabled"><span><AlertCircle size={19} /></span><div><strong>Canal de e-mail preparado, mas desativado</strong><p>Você pode criar modelos e rascunhos. Agendamento e envio serão liberados após configurar um provedor SMTP/API.</p></div><Button variant="secondary" disabled><Settings2 size={15} />Configurar provedor</Button></div><div className="toolbar"><div className="segmented"><button className="active">Modelos</button><button>Campanhas em rascunho</button></div><Button onClick={() => setModal(true)}><Plus size={15} />Novo modelo</Button></div>{query.data?.data.length ? <div className="template-grid">{query.data.data.map((template) => <article key={template.id}><span><Mail size={18} /></span><h3>{template.name}</h3><strong>{template.subject}</strong><p>{template.html.replace(/<[^>]+>/g, '').slice(0, 120)}</p><footer><small>Atualizado {dateTime(template.updatedAt)}</small><Button variant="secondary" disabled><Send size={14} />Enviar</Button></footer></article>)}</div> : <Empty icon={<FileText />} title="Nenhum modelo de e-mail" description="Prepare assuntos e conteúdos enquanto o provedor de envio é definido." action={<Button onClick={() => setModal(true)}>Criar modelo</Button>} />}{modal && <TemplateModal onClose={() => setModal(false)} onCreated={() => { setModal(false); client.invalidateQueries({ queryKey: ['email-templates'] }); }} />}</div>;
}

function TemplateModal({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const [form, setForm] = useState({ name: '', subject: '', html: '' });
  const mutation = useMutation({ mutationFn: () => api('/email/templates', { method: 'POST', body: JSON.stringify(form) }), onSuccess: onCreated });
  return <Modal title="Novo modelo de e-mail" onClose={onClose} width={680}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome interno" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Field label="Assunto" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /><label className="field"><span>Conteúdo</span><textarea rows={10} value={form.html} onChange={(event) => setForm({ ...form, html: event.target.value })} placeholder="Olá {{nome}},…" required /></label><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Salvar modelo</Button></div></form></Modal>;
}
