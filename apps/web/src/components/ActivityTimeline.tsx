import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckSquare, ExternalLink, FileText, Mail, MessageCircle, MoreHorizontal, PhoneCall, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, dateTime, type Envelope } from '../lib/api';
import { activityCategoryLabels, activityDuration, activityOutcomeLabels, activitySourceUrl, activityStatusLabels, type Activity, type ActivityCategory } from '../lib/activity';
import { useAuth } from '../App';
import { toast } from '../lib/toast';
import { ActivityModal, type ActivityAssociation } from './ActivityModal';
import { Button, Empty, Modal, PageLoading } from './ui';

const categoryIcons: Record<ActivityCategory, typeof PhoneCall> = {
  CALL: PhoneCall, NOTE: FileText, MEETING: CalendarDays, TASK: CheckSquare,
  WHATSAPP: MessageCircle, EMAIL: Mail, SYSTEM: MoreHorizontal,
};

export function ActivityQuickActions({ association, compact = false }: Readonly<{ association: ActivityAssociation; compact?: boolean }>) {
  const [category, setCategory] = useState<'call' | 'meeting' | 'note' | null>(null);
  const client = useQueryClient();
  const { user } = useAuth();
  const canWrite = user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === 'activities') && (permission.action === '*' || permission.action === 'write'));
  if (!canWrite) return null;
  return <>
    <div className={`activity-quick-actions ${compact ? 'compact' : ''}`}>
      <Button variant="secondary" onClick={() => setCategory('call')}><PhoneCall size={16} />Ligar</Button>
      <Button variant="secondary" onClick={() => setCategory('meeting')}><CalendarDays size={16} />Registrar reunião</Button>
      <Button variant="secondary" onClick={() => setCategory('note')}><FileText size={16} />Adicionar nota</Button>
      <Link className="button button-secondary" to={`/tarefas?new=1${association.companyId ? `&company=${association.companyId}` : ''}${association.contactId ? `&contact=${association.contactId}` : ''}${association.opportunityId ? `&opportunity=${association.opportunityId}` : ''}`}><Plus size={16} />Criar tarefa</Link>
    </div>
    {category && <ActivityModal category={category} association={association} onClose={() => setCategory(null)} onSaved={() => void client.invalidateQueries({ queryKey: ['activities'] })} />}
  </>;
}

export function ActivityTimeline({ association, limit = 30, showActions = true }: Readonly<{ association: ActivityAssociation; limit?: number; showActions?: boolean }>) {
  const client = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState<ActivityCategory | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (association.companyId) params.set('companyId', association.companyId);
    if (association.contactId) params.set('contactId', association.contactId);
    if (association.opportunityId) params.set('opportunityId', association.opportunityId);
    if (filter !== 'ALL') params.set('category', filter);
    return params.toString();
  }, [association.companyId, association.contactId, association.opportunityId, filter, limit]);
  const query = useQuery({
    queryKey: ['activities', queryString],
    queryFn: () => api<Envelope<Activity[]>>(`/activities?${queryString}`),
    enabled: Boolean(user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === 'activities') && (permission.action === '*' || permission.action === 'read'))),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/activities/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Atividade excluída.');
      setDeleting(null);
      return client.invalidateQueries({ queryKey: ['activities'] });
    },
  });
  const canRead = user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === 'activities') && (permission.action === '*' || permission.action === 'read'));
  if (!canRead) return <p className="drawer-muted">Você não possui acesso às atividades deste registro.</p>;
  if (query.isLoading) return <PageLoading />;
  const activities = query.data?.data || [];
  return <div className="activity-timeline-wrap">
    {showActions && <ActivityQuickActions association={association} />}
    <div className="activity-filter-tabs" aria-label="Filtrar linha do tempo">
      {(['ALL', 'CALL', 'NOTE', 'MEETING', 'TASK', 'WHATSAPP', 'EMAIL'] as const).map((category) => <button type="button" key={category} className={filter === category ? 'active' : ''} onClick={() => setFilter(category)}>{category === 'ALL' ? 'Tudo' : activityCategoryLabels[category]}</button>)}
    </div>
    {activities.length ? <div className="activity-timeline">{activities.map((activity, index) => {
      const Icon = categoryIcons[activity.category];
      const previous = activities[index - 1];
      const grouped = Boolean(previous && ['WHATSAPP', 'EMAIL'].includes(activity.category) && previous.category === activity.category
        && JSON.stringify(previous.details || {}) === JSON.stringify(activity.details || {})
        && Math.abs(new Date(previous.occurredAt).getTime() - new Date(activity.occurredAt).getTime()) < 10 * 60_000);
      const sourceUrl = activitySourceUrl(activity);
      const editable = activity.origin === 'MANUAL' && !activity.sourceType;
      return <article className={`activity-item activity-${activity.category.toLowerCase()} ${grouped ? 'grouped' : ''}`} key={activity.id}>
        <span className="activity-icon"><Icon size={17} /></span>
        <div className="activity-card">
          <header><div><strong>{activity.title}</strong><span>{activityCategoryLabels[activity.category]} · {activityStatusLabels[activity.status] || activity.status}</span></div><time>{dateTime(activity.occurredAt)}</time></header>
          {activity.body && <p>{activity.body}</p>}
          <footer><span>{activity.user?.name || (activity.origin === 'AUTOMATION' ? 'Automação' : 'BZS One')}{activity.outcome ? ` · ${activityOutcomeLabels[activity.outcome] || activity.outcome}` : ''}{activityDuration(activity.durationSeconds) ? ` · ${activityDuration(activity.durationSeconds)}` : ''}</span><div>{sourceUrl && <Link to={sourceUrl}>Abrir origem <ExternalLink size={13} /></Link>}{editable && <><button type="button" onClick={() => setEditing(activity)}>Editar</button><button type="button" className="danger-link" onClick={() => setDeleting(activity)}><Trash2 size={13} />Excluir</button></>}</div></footer>
        </div>
      </article>;
    })}</div> : <Empty icon={<CalendarDays />} title="Nenhuma atividade" description="Registre uma ligação, reunião ou nota para iniciar a linha do tempo." />}
    {editing && <ActivityModal activity={editing} association={association} onClose={() => setEditing(null)} onSaved={() => void client.invalidateQueries({ queryKey: ['activities'] })} />}
    {deleting && <Modal title="Excluir atividade" onClose={() => setDeleting(null)}><p className="modal-copy">A atividade será removida da linha do tempo e dos indicadores, mas continuará disponível na auditoria.</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(deleting.id)}>Excluir atividade</Button></div></Modal>}
  </div>;
}
