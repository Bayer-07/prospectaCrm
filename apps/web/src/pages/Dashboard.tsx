import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  CircleDollarSign,
  Clock3,
  Mail,
  MessageCircleMore,
  MoveRight,
  PhoneCall,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, dateTime, money, type Envelope } from '../lib/api';
import { PageLoading } from '../components/ui';

type Dashboard = {
  openOpportunities: number;
  pipelineValueCents: number;
  totalContacts: number;
  overdueTasks: number;
  openConversations: number;
  wonLast30Days: number;
  wonValueCents: number;
  stageDistribution: Array<{ id: string; name: string; color: string; count: number }>;
  recentActivities: Array<{
    id: string;
    type: string;
    category?: string;
    origin?: string;
    status?: string;
    title: string;
    body?: string;
    occurredAt: string;
    userName?: string;
    entityName?: string;
    companyId?: string;
    contactId?: string;
    opportunityId?: string;
    details?: Record<string, unknown>;
  }>;
  activitySummary: {
    totals: { calls: number; connectedCalls: number; connectionRate: number; whatsapp: number; emails: number; meetings: number; notes: number; completedTasks: number };
    origins: Record<string, number>;
    series: Array<{ date: string; category: string; count: number }>;
    byUser: Array<{ userId: string; userName: string; count: number }>;
  };
  inbox: {
    averageFirstResponseMinutes: number | null;
    resolvedToday: number;
    responseRate: number;
    connectedInstances: number;
  };
};

function activityVisual(type: string) {
  if (type === 'CALL') return { icon: PhoneCall, tone: 'amber' };
  if (type === 'MEETING') return { icon: CalendarDays, tone: 'violet' };
  if (type === 'EMAIL') return { icon: Mail, tone: 'blue' };
  if (type === 'TASK') return { icon: CheckSquare, tone: 'green' };
  if (type.includes('stage')) return { icon: MoveRight, tone: 'blue' };
  if (type.includes('task')) return { icon: CheckCircle2, tone: 'green' };
  if (type.includes('company')) return { icon: Building2, tone: 'amber' };
  return { icon: MessageCircleMore, tone: 'violet' };
}

function activityDestination(item: Dashboard['recentActivities'][number]) {
  const details = item.details || {};
  if (typeof details.conversationId === 'string') return `/inbox/${details.conversationId}`;
  if (typeof details.campaignId === 'string') return item.category === 'EMAIL' ? '/email' : '/campanhas';
  if (item.opportunityId) return `/pipeline?opportunity=${item.opportunityId}`;
  if (item.companyId) return `/empresas?company=${item.companyId}`;
  if (item.contactId) return `/contatos?contact=${item.contactId}`;
  const type = item.type;
  if (type.includes('stage') || type.includes('opportunity')) return '/pipeline';
  if (type.includes('task')) return '/tarefas';
  if (type.includes('company')) return '/empresas';
  if (type.includes('contact')) return '/contatos';
  if (type.includes('campaign')) return '/campanhas';
  return '/inbox';
}

export function DashboardPage() {
  const [activityPeriod, setActivityPeriod] = useState(30);
  const activityRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (activityPeriod - 1) * 86_400_000);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [activityPeriod]);
  const query = useQuery({ queryKey: ['dashboard', activityPeriod], queryFn: () => api<Envelope<Dashboard>>(`/dashboard?from=${encodeURIComponent(activityRange.from)}&to=${encodeURIComponent(activityRange.to)}`) });
  if (query.isLoading) return <PageLoading />;

  const fallback: Dashboard = {
    openOpportunities: 0,
    pipelineValueCents: 0,
    totalContacts: 0,
    overdueTasks: 0,
    openConversations: 0,
    wonLast30Days: 0,
    wonValueCents: 0,
    stageDistribution: [],
    recentActivities: [],
    activitySummary: { totals: { calls: 0, connectedCalls: 0, connectionRate: 0, whatsapp: 0, emails: 0, meetings: 0, notes: 0, completedTasks: 0 }, origins: {}, series: [], byUser: [] },
    inbox: {
      averageFirstResponseMinutes: null,
      resolvedToday: 0,
      responseRate: 0,
      connectedInstances: 0,
    },
  };
  const response = query.data?.data;
  const data: Dashboard = {
    ...fallback,
    ...response,
    recentActivities: response?.recentActivities || [],
    activitySummary: response?.activitySummary || fallback.activitySummary,
    inbox: { ...fallback.inbox, ...response?.inbox },
  };
  const maxStage = Math.max(...data.stageDistribution.map((item) => item.count), 1);
  const activitySeries = Object.values(data.activitySummary.series.reduce<Record<string, Record<string, string | number>>>((days, item) => {
    const key = item.date.slice(0, 10);
    days[key] ||= { date: key };
    days[key][item.category] = Number(days[key][item.category] || 0) + item.count;
    return days;
  }, {}));

  return <div className="dashboard-grid">
    <section className="metric-grid">
      <Link className="metric-card dashboard-link-card" to="/pipeline" aria-label="Abrir pipeline">
        <div className="metric-icon violet"><CircleDollarSign size={19} /></div>
        <div className="metric-label"><span>Pipeline aberto</span><MoveRight size={16} /></div>
        <strong>{money(data.pipelineValueCents)}</strong>
        <p><em className="positive"><ArrowUpRight size={13} /> {data.openOpportunities}</em> negócios em andamento</p>
      </Link>
      <Link className="metric-card dashboard-link-card" to="/pipeline" aria-label="Abrir oportunidades">
        <div className="metric-icon blue"><Target size={19} /></div>
        <div className="metric-label"><span>Oportunidades</span><MoveRight size={16} /></div>
        <strong>{data.openOpportunities}</strong>
        <p><em className="positive"><ArrowUpRight size={13} /> {data.wonLast30Days}</em> ganhas nos últimos 30 dias</p>
      </Link>
      <Link className="metric-card dashboard-link-card" to="/contatos" aria-label="Abrir contatos">
        <div className="metric-icon green"><Users size={19} /></div>
        <div className="metric-label"><span>Contatos ativos</span><MoveRight size={16} /></div>
        <strong>{data.totalContacts.toLocaleString('pt-BR')}</strong>
        <p><em className="positive"><ArrowUpRight size={13} /> Base</em> disponível no CRM</p>
      </Link>
      <Link className="metric-card dashboard-link-card" to="/tarefas" aria-label="Abrir calendário de tarefas">
        <div className="metric-icon amber"><Clock3 size={19} /></div>
        <div className="metric-label"><span>Tarefas vencidas</span><MoveRight size={16} /></div>
        <strong>{data.overdueTasks}</strong>
        <p><em className={data.overdueTasks ? 'negative' : 'positive'}><ArrowDownRight size={13} /> {data.overdueTasks ? 'Atenção' : 'Em dia'}</em> na operação</p>
      </Link>
    </section>

    <section className="panel commercial-activity-panel">
      <header className="panel-header">
        <div><h2>Atividade comercial</h2><p>Indicadores reais dentro do seu escopo de acesso</p></div>
        <div className="segmented dashboard-activity-period" aria-label="Período da atividade">{[7, 30, 90].map((days) => <button type="button" key={days} className={activityPeriod === days ? 'active' : ''} onClick={() => setActivityPeriod(days)}>{days} dias</button>)}</div>
      </header>
      <div className="commercial-activity-kpis">
        <Link to="/atividades?category=CALL"><span><PhoneCall size={16} />Ligações</span><strong>{data.activitySummary.totals.calls}</strong><small>{data.activitySummary.totals.connectionRate}% atendidas</small></Link>
        <Link to="/atividades?category=WHATSAPP"><span><MessageCircleMore size={16} />WhatsApp</span><strong>{data.activitySummary.totals.whatsapp}</strong><small>mensagens enviadas</small></Link>
        <Link to="/atividades?category=EMAIL"><span><Mail size={16} />E-mails</span><strong>{data.activitySummary.totals.emails}</strong><small>envios registrados</small></Link>
        <Link to="/atividades?category=MEETING"><span><CalendarDays size={16} />Reuniões</span><strong>{data.activitySummary.totals.meetings}</strong><small>realizadas</small></Link>
        <Link to="/atividades?category=TASK"><span><CheckSquare size={16} />Tarefas</span><strong>{data.activitySummary.totals.completedTasks}</strong><small>concluídas</small></Link>
      </div>
      <div className="commercial-activity-content">
        <div className="commercial-activity-chart">
          <div className="activity-origin-legend"><span><i className="human" />Ações humanas: {(data.activitySummary.origins.manual || 0) + (data.activitySummary.origins.inbox || 0)}</span><span><i className="automatic" />Campanhas e automações: {(data.activitySummary.origins.campaign || 0) + (data.activitySummary.origins.automation || 0)}</span></div>
          {activitySeries.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={activitySeries} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="date" tickFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T12:00:00`))} tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))} /><Bar dataKey="call" name="Ligações" stackId="activity" fill="#df8e12" /><Bar dataKey="meeting" name="Reuniões" stackId="activity" fill="#7167dc" /><Bar dataKey="task" name="Tarefas" stackId="activity" fill="#139b6b" /><Bar dataKey="whatsapp" name="WhatsApp" stackId="activity" fill="#2f80ed" /><Bar dataKey="email" name="E-mails" stackId="activity" fill="#7c3aed" /><Bar dataKey="note" name="Notas" stackId="activity" fill="#94a3b8" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="popover-empty">Ainda não há atividades neste período.</p>}
        </div>
        {data.activitySummary.byUser.length > 1 && <div className="activity-by-user"><strong>Por responsável</strong>{data.activitySummary.byUser.slice(0, 6).map((item) => <div key={item.userId}><span>{item.userName}</span><b>{item.count}</b></div>)}</div>}
      </div>
    </section>

    <section className="panel funnel-panel">
      <header className="panel-header">
        <div><h2>Saúde do funil</h2><p>Distribuição das oportunidades abertas</p></div>
        <Link className="text-button dashboard-text-link" to="/pipeline">Ver pipeline <MoveRight size={14} /></Link>
      </header>
      <div className="funnel-bars">
        {data.stageDistribution.map((stage, index) => <Link className="funnel-row dashboard-row-link" to="/pipeline" key={stage.id} aria-label={`Abrir etapa ${stage.name} na pipeline`}>
          <div className="funnel-label"><i style={{ background: stage.color }} /><span>{stage.name}</span><b>{stage.count}</b></div>
          <div className="funnel-track"><div style={{ width: `${Math.max((stage.count / maxStage) * 100, 5)}%`, background: stage.color }} /></div>
          <small>{index ? `${Math.round((stage.count / Math.max(data.stageDistribution[index - 1].count, 1)) * 100)}%` : '100%'}</small>
        </Link>)}
      </div>
    </section>

    <section className="panel focus-panel">
      <header className="panel-header"><div><h2>Foco de hoje</h2><p>Prioridades para manter o ritmo</p></div><Sparkles size={17} className="sparkle" /></header>
      <div className="focus-list">
        <Link to="/inbox">
          <span className="focus-number violet">{data.openConversations}</span>
          <p><strong>Conversas aguardando resposta</strong><small>Na fila compartilhada agora</small></p>
          <MoveRight size={16} />
        </Link>
        <Link to="/tarefas">
          <span className="focus-number amber">{data.overdueTasks}</span>
          <p><strong>Tarefas precisam de atenção</strong><small>Organizadas por vencimento</small></p>
          <MoveRight size={16} />
        </Link>
        <Link to="/pipeline">
          <span className="focus-number green">{data.wonLast30Days}</span>
          <p><strong>Oportunidades ganhas</strong><small>{money(data.wonValueCents)} no período</small></p>
          <MoveRight size={16} />
        </Link>
      </div>
    </section>

    <section className="panel activity-panel">
      <header className="panel-header">
        <div><h2>Atividade recente</h2><p>O que aconteceu na operação</p></div>
        <Link className="text-button dashboard-text-link" to="/atividades">Ver tudo</Link>
      </header>
      <div className="activity-list">
        {data.recentActivities.length
          ? data.recentActivities.map((item) => {
            const visual = activityVisual(item.category || item.type);
            return <Link to={activityDestination(item)} key={item.id}>
              <span className={`activity-icon ${visual.tone}`}><visual.icon size={15} /></span>
              <p><strong>{item.title}</strong><small>{[item.entityName, item.userName, dateTime(item.occurredAt)].filter(Boolean).join(' · ')}</small></p>
              <MoveRight className="dashboard-row-arrow" size={15} />
            </Link>;
          })
          : <p className="popover-empty">As próximas alterações aparecerão aqui.</p>}
      </div>
    </section>

    <section className="panel channel-panel">
      <header className="panel-header">
        <div><h2>Atendimento</h2><p>Desempenho das caixas hoje</p></div>
        <Link className="live-indicator dashboard-live-link" to="/inbox"><i /> Abrir inbox</Link>
      </header>
      <Link className="channel-main dashboard-section-link" to="/inbox">
        <div className="channel-score"><strong>{data.openConversations}</strong><span>conversas abertas</span></div>
        <div className="channel-stats">
          <div><span>Tempo de 1ª resposta</span><strong>{data.inbox.averageFirstResponseMinutes === null ? '—' : `${data.inbox.averageFirstResponseMinutes} min`}</strong></div>
          <div><span>Resolvidas hoje</span><strong>{data.inbox.resolvedToday}</strong></div>
          <div><span>Taxa de resposta</span><strong>{data.inbox.responseRate}%</strong></div>
        </div>
      </Link>
      <Link className="channel-footer dashboard-section-link" to="/conexoes">
        <span><i className={data.inbox.connectedInstances ? 'green-dot' : ''} />Instâncias WhatsApp</span>
        <b>{data.inbox.connectedInstances} conectadas</b>
      </Link>
    </section>
  </div>;
}
