import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Mail,
  Plus,
  Users,
} from 'lucide-react';
import { useAuth } from '../App';
import { api, apiErrorMessage, type Envelope } from '../lib/api';
import { Button, Field, Modal, PageLoading, SelectField } from '../components/ui';

type TaskStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type Task = {
  id: string;
  title: string;
  description?: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignee?: { id: string; name: string };
  company?: { id: string; name: string };
  contact?: { id: string; name: string };
  opportunity?: { id: string; title: string };
};
type Metadata = { users: Array<{ id: string; name: string; teamId?: string }> };
type CalendarView = 'month' | 'week';
type TaskFilter = 'OPEN' | 'COMPLETED' | 'ALL';

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const monthTitleFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const weekTitleFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const hours = Array.from({ length: 24 }, (_, index) => index);

export function TasksPage() {
  const client = useQueryClient();
  const [view, setView] = useState<CalendarView>(() => (localStorage.getItem('bzs-task-calendar-view') === 'week' ? 'week' : 'month'));
  const [filter, setFilter] = useState<TaskFilter>('OPEN');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [modal, setModal] = useState<{ dueAt: Date; task?: Task } | null>(null);
  const range = useMemo(() => visibleRange(anchor, view), [anchor, view]);
  const query = useQuery({
    queryKey: ['tasks', range.start.toISOString(), range.end.toISOString(), filter],
    queryFn: () => api<Envelope<Task[]>>(`/tasks?from=${encodeURIComponent(range.start.toISOString())}&to=${encodeURIComponent(range.end.toISOString())}&status=${filter}`),
    placeholderData: (previous) => previous,
  });
  const metadata = useQuery({
    queryKey: ['crm-metadata'],
    queryFn: () => api<Envelope<Metadata>>('/metadata'),
    staleTime: 5 * 60_000,
  });
  const complete = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}/complete`, { method: 'PATCH' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const tasks = query.data?.data || [];
  const tasksByDay = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = localDateKey(new Date(task.dueAt));
      grouped.set(key, [...(grouped.get(key) || []), task]);
    }
    return grouped;
  }, [tasks]);

  if (query.isLoading || metadata.isLoading) return <PageLoading />;

  const navigate = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + (direction * 7));
    setAnchor(startOfDay(next));
  };
  const title = view === 'month'
    ? capitalize(monthTitleFormatter.format(anchor))
    : `${weekTitleFormatter.format(range.start)} – ${weekTitleFormatter.format(new Date(range.end.getTime() - 1))}`;
  const openTask = (task: Task) => setModal({ dueAt: new Date(task.dueAt), task });
  const createAt = (dueAt: Date) => setModal({ dueAt });
  const saveView = (next: CalendarView) => {
    setView(next);
    localStorage.setItem('bzs-task-calendar-view', next);
  };

  return <div className="tasks-page task-calendar-page">
    <div className="task-calendar-toolbar">
      <div className="task-calendar-navigation">
        <Button variant="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>Hoje</Button>
        <button className="icon-button task-nav-button" onClick={() => navigate(-1)} aria-label="Período anterior"><ChevronLeft size={20} /></button>
        <button className="icon-button task-nav-button" onClick={() => navigate(1)} aria-label="Próximo período"><ChevronRight size={20} /></button>
        <h2>{title}</h2>
      </div>
      <div className="task-calendar-actions">
        <div className="task-digest-hint" title="Cada responsável recebe por e-mail as tarefas do dia">
          <Mail size={16} /><span>Resumo diário às 8h</span>
        </div>
        <div className="segmented task-status-filter" aria-label="Filtrar tarefas">
          <button className={filter === 'OPEN' ? 'active' : ''} onClick={() => setFilter('OPEN')}>Em aberto</button>
          <button className={filter === 'COMPLETED' ? 'active' : ''} onClick={() => setFilter('COMPLETED')}>Concluídas</button>
          <button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>Todas</button>
        </div>
        <div className="segmented task-view-filter" aria-label="Visualização da agenda">
          <button className={view === 'month' ? 'active' : ''} onClick={() => saveView('month')}>Mês</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => saveView('week')}>Semana</button>
        </div>
        <Button onClick={() => createAt(defaultTaskTime(new Date()))}><Plus size={17} />Nova tarefa</Button>
      </div>
    </div>

    {view === 'month'
      ? <MonthCalendar
        range={range}
        anchor={anchor}
        tasksByDay={tasksByDay}
        onCreate={createAt}
        onOpen={openTask}
        onComplete={(task) => task.status === 'OPEN' && complete.mutate(task.id)}
      />
      : <WeekCalendar
        range={range}
        tasks={tasks}
        onCreate={createAt}
        onOpen={openTask}
      />}

    {modal && <TaskModal
      initialDueAt={modal.dueAt}
      task={modal.task}
      users={metadata.data?.data.users || []}
      onClose={() => setModal(null)}
      onSaved={() => {
        setModal(null);
        void client.invalidateQueries({ queryKey: ['tasks'] });
      }}
    />}
  </div>;
}

function MonthCalendar({
  range,
  anchor,
  tasksByDay,
  onCreate,
  onOpen,
  onComplete,
}: {
  range: { start: Date; end: Date };
  anchor: Date;
  tasksByDay: Map<string, Task[]>;
  onCreate(date: Date): void;
  onOpen(task: Task): void;
  onComplete(task: Task): void;
}) {
  const days = datesBetween(range.start, range.end);
  const week = datesBetween(startOfWeek(new Date()), addDays(startOfWeek(new Date()), 7));
  const todayKey = localDateKey(new Date());
  return <section className="task-month-calendar" aria-label="Calendário mensal de tarefas">
    <div className="task-month-weekdays">
      {week.map((day) => <span key={day.getDay()}>{weekdayFormatter.format(day).replace('.', '')}</span>)}
    </div>
    <div className="task-month-grid">
      {days.map((day) => {
        const key = localDateKey(day);
        const dayTasks = tasksByDay.get(key) || [];
        const outside = day.getMonth() !== anchor.getMonth();
        return <div
          key={key}
          className={`task-month-day${outside ? ' outside' : ''}${key === todayKey ? ' today' : ''}`}
          onClick={() => onCreate(defaultTaskTime(day))}
        >
          <button
            className="task-month-day-number"
            onClick={(event) => { event.stopPropagation(); onCreate(defaultTaskTime(day)); }}
            aria-label={`Criar tarefa em ${fullDateFormatter.format(day)}`}
          >{day.getDate()}</button>
          <div className="task-month-events">
            {dayTasks.slice(0, 4).map((task) => <button
              key={task.id}
              className={`task-calendar-event priority-${task.priority.toLowerCase()}${task.status === 'COMPLETED' ? ' completed' : ''}`}
              onClick={(event) => { event.stopPropagation(); onOpen(task); }}
              title={`${timeFormatter.format(new Date(task.dueAt))} · ${task.title}`}
            >
              <span className="task-event-time">{timeFormatter.format(new Date(task.dueAt))}</span>
              <strong>{task.title}</strong>
              <span
                className="task-event-check"
                role="button"
                tabIndex={task.status === 'OPEN' ? 0 : -1}
                aria-label={task.status === 'COMPLETED' ? 'Tarefa concluída' : 'Concluir tarefa'}
                onClick={(event) => { event.stopPropagation(); onComplete(task); }}
              >{task.status === 'COMPLETED' ? <Check size={12} /> : <Circle size={12} />}</span>
            </button>)}
            {dayTasks.length > 4 && <button className="task-more-events" onClick={(event) => event.stopPropagation()}>+{dayTasks.length - 4} tarefas</button>}
          </div>
        </div>;
      })}
    </div>
  </section>;
}

function WeekCalendar({
  range,
  tasks,
  onCreate,
  onOpen,
}: {
  range: { start: Date; end: Date };
  tasks: Task[];
  onCreate(date: Date): void;
  onOpen(task: Task): void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = datesBetween(range.start, range.end);
  const todayKey = localDateKey(new Date());
  const taskGroups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = localDateKey(new Date(task.dueAt));
    taskGroups.set(key, [...(taskGroups.get(key) || []), task]);
  }
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (new Date().getHours() - 1) * 52);
  }, [range.start]);
  const createFromPosition = (event: MouseEvent<HTMLDivElement>, day: Date) => {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains('task-week-hour-slot')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawMinutes = Math.max(0, Math.min(1439, ((event.clientY - rect.top) / rect.height) * 1440));
    const roundedMinutes = Math.min(1410, Math.round(rawMinutes / 30) * 30);
    const dueAt = new Date(day);
    dueAt.setHours(Math.floor(roundedMinutes / 60), roundedMinutes % 60, 0, 0);
    onCreate(dueAt);
  };
  return <section className="task-week-calendar" aria-label="Calendário semanal de tarefas">
    <div className="task-week-header">
      <span className="task-week-timezone">GMT-3</span>
      {days.map((day) => {
        const key = localDateKey(day);
        return <div key={key} className={key === todayKey ? 'today' : ''}>
          <span>{weekdayFormatter.format(day).replace('.', '')}</span>
          <strong>{day.getDate()}</strong>
        </div>;
      })}
    </div>
    <div className="task-week-scroll" ref={scrollRef}>
      <div className="task-week-time-axis">
        {hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
      </div>
      <div className="task-week-days">
        {days.map((day) => {
          const key = localDateKey(day);
          return <div
            key={key}
            className={`task-week-day${key === todayKey ? ' today' : ''}`}
            onClick={(event) => createFromPosition(event, day)}
          >
            {hours.map((hour) => <div className="task-week-hour-slot" key={hour} />)}
            {(taskGroups.get(key) || []).map((task) => {
              const date = new Date(task.dueAt);
              const minute = (date.getHours() * 60) + date.getMinutes();
              return <button
                key={task.id}
                className={`task-week-event priority-${task.priority.toLowerCase()}${task.status === 'COMPLETED' ? ' completed' : ''}`}
                style={{ top: `${(minute / 1440) * 100}%` }}
                onClick={(event) => { event.stopPropagation(); onOpen(task); }}
                title={task.title}
              >
                <strong>{task.title}</strong>
                <span>{timeFormatter.format(date)}{task.assignee ? ` · ${task.assignee.name}` : ''}</span>
              </button>;
            })}
            {key === todayKey && <CurrentTimeLine />}
          </div>;
        })}
      </div>
    </div>
  </section>;
}

function CurrentTimeLine() {
  const now = new Date();
  const minute = (now.getHours() * 60) + now.getMinutes();
  return <span className="task-current-time" style={{ top: `${(minute / 1440) * 100}%` }}><i /></span>;
}

function TaskModal({
  initialDueAt,
  task,
  users,
  onClose,
  onSaved,
}: {
  initialDueAt: Date;
  task?: Task;
  users: Metadata['users'];
  onClose(): void;
  onSaved(): void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => ({
    title: task?.title || '',
    description: task?.description || '',
    dueAt: toLocalInput(task ? new Date(task.dueAt) : initialDueAt),
    priority: (task?.priority || 'MEDIUM').toLowerCase(),
    assigneeId: task?.assignee?.id || user?.userId || users[0]?.id || '',
  }));
  const save = useMutation({
    mutationFn: () => api(task ? `/tasks/${task.id}` : '/tasks', {
      method: task ? 'PATCH' : 'POST',
      body: JSON.stringify({
        ...form,
        dueAt: new Date(form.dueAt).toISOString(),
        assigneeId: form.assigneeId || undefined,
      }),
    }),
    onSuccess: onSaved,
  });
  const complete = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}/complete`, { method: 'PATCH' }),
    onSuccess: onSaved,
  });
  const cancel = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}`, { method: 'DELETE' }),
    onSuccess: onSaved,
  });
  const error = save.error || complete.error || cancel.error;
  return <Modal title={task ? 'Detalhes da tarefa' : 'Nova tarefa'} onClose={onClose} width={620}>
    <form className="modal-form task-modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate(); }}>
      <Field label="O que precisa ser feito?" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required autoFocus />
      <label className="field"><span>Descrição</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <div className="form-grid">
        <Field label="Data e horário" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} required />
        <SelectField label="Prioridade" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
        </SelectField>
      </div>
      <SelectField label="Responsável" value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
        {users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SelectField>
      {task && <div className="task-modal-context">
        <span><Clock size={15} />{fullDateFormatter.format(new Date(task.dueAt))}, {timeFormatter.format(new Date(task.dueAt))}</span>
        {task.assignee && <span><Users size={15} />{task.assignee.name}</span>}
      </div>}
      {error && <p className="form-error">{apiErrorMessage(error, 'Não foi possível salvar a tarefa')}</p>}
      <div className="modal-actions task-modal-actions">
        {task?.status === 'OPEN' && <>
          <Button type="button" variant="secondary" onClick={() => cancel.mutate()} loading={cancel.isPending}>Cancelar tarefa</Button>
          <Button type="button" variant="secondary" onClick={() => complete.mutate()} loading={complete.isPending}><Check size={16} />Concluir</Button>
        </>}
        <span />
        <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        <Button type="submit" loading={save.isPending}>{task ? 'Salvar alterações' : 'Criar tarefa'}</Button>
      </div>
    </form>
  </Modal>;
}

function visibleRange(anchor: Date, view: CalendarView) {
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return { start, end: addDays(start, 42) };
}

function startOfWeek(value: Date) {
  const result = startOfDay(value);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function datesBetween(start: Date, end: Date) {
  const dates: Date[] = [];
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function defaultTaskTime(value: Date) {
  const result = new Date(value);
  if (localDateKey(result) === localDateKey(new Date())) {
    const nextHalfHour = Math.ceil((new Date().getMinutes() + 1) / 30) * 30;
    result.setHours(new Date().getHours(), nextHalfHour, 0, 0);
  } else {
    result.setHours(9, 0, 0, 0);
  }
  return result;
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function toLocalInput(value: Date) {
  const local = new Date(value.getTime() - (value.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
