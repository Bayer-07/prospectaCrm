import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckSquare, ExternalLink, FileText, Filter, Mail, MessageCircle, PhoneCall, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, dateTime, type Envelope } from '../lib/api';
import { activityCategoryLabels, activityDuration, activityOriginLabels, activityOutcomeLabels, activitySourceUrl, activityStatusLabels, type Activity, type ActivityCategory } from '../lib/activity';
import { ActivityModal } from '../components/ActivityModal';
import { Button, Empty, PageLoading, SelectField } from '../components/ui';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import type { Company, Contact, Opportunity } from '../lib/types';
import { useAuth } from '../App';

type Metadata = { users: Array<{ id: string; name: string }>; teams: Array<{ id: string; name: string }> };
const icons: Record<ActivityCategory, typeof PhoneCall> = { CALL: PhoneCall, NOTE: FileText, MEETING: CalendarDays, TASK: CheckSquare, WHATSAPP: MessageCircle, EMAIL: Mail, SYSTEM: Filter };

function rangeForDays(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function ActivitiesPage() {
  const client = useQueryClient();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState(30);
  const [filters, setFilters] = useState(() => ({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || '',
    origin: searchParams.get('origin') || '',
    status: searchParams.get('status') || '',
    outcome: searchParams.get('outcome') || '',
    userId: searchParams.get('userId') || '',
    teamId: searchParams.get('teamId') || '',
    companyId: searchParams.get('companyId') || '',
    contactId: searchParams.get('contactId') || '',
    opportunityId: searchParams.get('opportunityId') || '',
  }));
  const [createOpen, setCreateOpen] = useState(false);
  const canRead = (resource: string) => Boolean(user?.permissions.some((permission) => (permission.resource === '*' || permission.resource === resource) && (permission.action === '*' || permission.action === 'read')));
  const debouncedSearch = useDebouncedValue(filters.search);
  const range = useMemo(() => rangeForDays(period), [period]);
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: '40', from: range.from, to: range.to });
    for (const [key, value] of Object.entries({ ...filters, search: debouncedSearch })) if (value) params.set(key, value);
    return params.toString();
  }, [debouncedSearch, filters, range.from, range.to]);
  const metadata = useQuery({ queryKey: ['crm-metadata'], queryFn: () => api<Envelope<Metadata>>('/metadata'), staleTime: 5 * 60_000 });
  const companies = useQuery({ queryKey: ['activity-filters', 'companies'], queryFn: () => api<Envelope<Company[]>>('/companies?limit=100'), enabled: canRead('companies'), staleTime: 60_000 });
  const contacts = useQuery({ queryKey: ['activity-filters', 'contacts'], queryFn: () => api<Envelope<Contact[]>>('/contacts?limit=100'), enabled: canRead('contacts'), staleTime: 60_000 });
  const opportunities = useQuery({ queryKey: ['activity-filters', 'opportunities'], queryFn: () => api<Envelope<Opportunity[]>>('/opportunities?limit=100'), enabled: canRead('opportunities'), staleTime: 60_000 });
  const query = useInfiniteQuery({
    queryKey: ['activities', 'global', filterQuery],
    queryFn: ({ pageParam }) => api<Envelope<Activity[]>>(`/activities?${filterQuery}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor || undefined,
  });
  const activities = query.data?.pages.flatMap((page) => page.data) || [];

  return <div className="activities-page">
    <div className="activities-toolbar">
      <div className="segmented" aria-label="Período das atividades">{[7, 30, 90].map((days) => <button key={days} type="button" className={period === days ? 'active' : ''} onClick={() => setPeriod(days)}>{days} dias</button>)}</div>
      <Button onClick={() => setCreateOpen(true)}><Plus size={17} />Registrar atividade</Button>
    </div>
    <section className="activity-filter-panel">
      <label className="activity-search"><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Buscar no título ou conteúdo" aria-label="Buscar atividades" /></label>
      <SelectField label="Tipo" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">Todos</option>{Object.entries(activityCategoryLabels).filter(([value]) => value !== 'SYSTEM').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField label="Origem" value={filters.origin} onChange={(event) => setFilters({ ...filters, origin: event.target.value })}><option value="">Todas</option>{Object.entries(activityOriginLabels).filter(([value]) => value !== 'SYSTEM').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{Object.entries(activityStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField label="Resultado" value={filters.outcome} onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}><option value="">Todos</option>{Object.entries(activityOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField label="Usuário" value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })}><option value="">Todos</option>{metadata.data?.data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</SelectField>
      <SelectField label="Equipe" value={filters.teamId} onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}><option value="">Todas</option>{metadata.data?.data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</SelectField>
      {canRead('companies') && <SelectField label="Empresa" value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.target.value })}><option value="">Todas</option>{companies.data?.data.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectField>}
      {canRead('contacts') && <SelectField label="Contato" value={filters.contactId} onChange={(event) => setFilters({ ...filters, contactId: event.target.value })}><option value="">Todos</option>{contacts.data?.data.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</SelectField>}
      {canRead('opportunities') && <SelectField label="Oportunidade" value={filters.opportunityId} onChange={(event) => setFilters({ ...filters, opportunityId: event.target.value })}><option value="">Todas</option>{opportunities.data?.data.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}</SelectField>}
    </section>
    {query.isLoading ? <PageLoading /> : activities.length ? <section className="activities-list" aria-label="Central de atividades">
      <div className="activities-list-head"><span>Atividade</span><span>Relacionada a</span><span>Responsável</span><span>Data</span><span /></div>
      {activities.map((activity, index) => {
        const Icon = icons[activity.category];
        const url = activitySourceUrl(activity);
        const previous = activities[index - 1];
        const detailsKey = JSON.stringify(activity.details || {});
        const grouped = Boolean(previous && ['WHATSAPP', 'EMAIL'].includes(activity.category) && previous.category === activity.category && JSON.stringify(previous.details || {}) === detailsKey && Math.abs(new Date(previous.occurredAt).getTime() - new Date(activity.occurredAt).getTime()) < 10 * 60_000);
        return <article className={`activities-row ${grouped ? 'grouped' : ''}`} key={activity.id}>
          <div className="activities-row-main"><span className={`activity-icon activity-icon-${activity.category.toLowerCase()}`}><Icon size={17} /></span><div><strong>{activity.title}</strong><p>{activity.body || `${activityCategoryLabels[activity.category]} · ${activityStatusLabels[activity.status] || activity.status}`}</p><small>{activityOriginLabels[activity.origin]}{activity.outcome ? ` · ${activityOutcomeLabels[activity.outcome] || activity.outcome}` : ''}{activityDuration(activity.durationSeconds) ? ` · ${activityDuration(activity.durationSeconds)}` : ''}</small></div></div>
          <div className="activities-related">{activity.company && <Link to={`/empresas?company=${activity.company.id}`}>{activity.company.name}</Link>}{activity.contact && <Link to={`/contatos?contact=${activity.contact.id}`}>{activity.contact.name}</Link>}{activity.opportunity && <Link to={`/pipeline?opportunity=${activity.opportunity.id}`}>{activity.opportunity.title}</Link>}{!activity.company && !activity.contact && !activity.opportunity && <span>—</span>}</div>
          <div>{activity.user?.name || (activity.origin === 'AUTOMATION' ? 'Automação' : 'BZS One')}<small>{activity.team?.name}</small></div>
          <time>{dateTime(activity.occurredAt)}</time>
          <div>{url && <Link className="activity-open-source" to={url} aria-label="Abrir origem"><ExternalLink size={16} /></Link>}</div>
        </article>;
      })}
      {query.hasNextPage && <div className="activities-load-more"><Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Carregar mais</Button></div>}
    </section> : <Empty icon={<CalendarDays />} title="Nenhuma atividade no período" description="Ajuste os filtros ou registre uma atividade comercial." action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} />Registrar atividade</Button>} />}
    {createOpen && <ActivityModal onClose={() => setCreateOpen(false)} onSaved={() => void client.invalidateQueries({ queryKey: ['activities'] })} />}
  </div>;
}
