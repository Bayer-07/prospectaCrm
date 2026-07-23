import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, CheckSquare, Circle, Clock, Plus } from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';

type Task = { id: string; title: string; description?: string; dueAt: string; priority: string; status: string; assignee?: { name: string }; company?: { name: string }; contact?: { name: string } };

export function TasksPage() {
  const client = useQueryClient(); const [modal, setModal] = useState(false); const [filter, setFilter] = useState('open');
  const query = useQuery({ queryKey: ['tasks'], queryFn: () => api<Envelope<Task[]>>('/tasks') });
  const complete = useMutation({ mutationFn: (id: string) => api(`/tasks/${id}/complete`, { method: 'PATCH' }), onSuccess: () => client.invalidateQueries({ queryKey: ['tasks'] }) });
  if (query.isLoading) return <PageLoading />;
  const tasks = query.data?.data.filter((task) => filter === 'all' || task.status.toLowerCase() === filter) || [];
  return <div className="tasks-page"><div className="toolbar"><div className="segmented"><button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Em aberto</button><button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')}>Concluídas</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas</button></div><Button onClick={() => setModal(true)}><Plus size={15} />Nova tarefa</Button></div>{tasks.length ? <div className="task-list">{tasks.map((task) => <article className={task.status === 'COMPLETED' ? 'done' : ''} key={task.id}><button className="task-check" onClick={() => task.status !== 'COMPLETED' && complete.mutate(task.id)}>{task.status === 'COMPLETED' ? <Check size={15} /> : <Circle size={15} />}</button><div className="task-main"><div><strong>{task.title}</strong><p>{task.company?.name || task.contact?.name || task.description || 'Tarefa geral'}</p></div><div className="task-tags"><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Alta' : task.priority === 'LOW' ? 'Baixa' : 'Média'}</span></div></div><div className="task-assignee"><span>{task.assignee?.name || 'Sem responsável'}</span><small className={new Date(task.dueAt) < new Date() && task.status === 'OPEN' ? 'overdue' : ''}><Clock size={13} />{dateTime(task.dueAt)}</small></div></article>)}</div> : <Empty icon={<CheckSquare />} title="Nenhuma tarefa nesta visão" description="Crie uma próxima ação para manter o negócio avançando." action={<Button onClick={() => setModal(true)}>Criar tarefa</Button>} />}{modal && <TaskModal onClose={() => setModal(false)} onCreated={() => { setModal(false); client.invalidateQueries({ queryKey: ['tasks'] }); }} />}</div>;
}

function TaskModal({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const tomorrow = new Date(Date.now() + 86400_000); tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
  const [form, setForm] = useState({ title: '', description: '', dueAt: tomorrow.toISOString().slice(0, 16), priority: 'medium' });
  const mutation = useMutation({ mutationFn: () => api('/tasks', { method: 'POST', body: JSON.stringify(form) }), onSuccess: onCreated });
  return <Modal title="Nova tarefa" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="O que precisa ser feito?" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required autoFocus /><Field label="Descrição" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><div className="form-grid"><Field label="Prazo" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} required /><SelectField label="Prioridade" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></SelectField></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar tarefa</Button></div></form></Modal>;
}
