import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MessageCircleMore,
  MoveRight,
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
    title: string;
    occurredAt: string;
    userName?: string;
    entityName?: string;
  }>;
  inbox: {
    averageFirstResponseMinutes: number | null;
    resolvedToday: number;
    responseRate: number;
    connectedInstances: number;
  };
};

const activityVisual = (type: string) => type.includes('stage')
  ? { icon: MoveRight, tone: 'blue' }
  : type.includes('task')
    ? { icon: CheckCircle2, tone: 'green' }
    : type.includes('company')
      ? { icon: Building2, tone: 'amber' }
      : { icon: MessageCircleMore, tone: 'violet' };

const activityDestination = (type: string) => type.includes('stage') || type.includes('opportunity')
  ? '/pipeline'
  : type.includes('task')
    ? '/tarefas'
    : type.includes('company')
      ? '/empresas'
      : type.includes('contact')
        ? '/contatos'
        : type.includes('campaign')
          ? '/campanhas'
          : '/inbox';

export function DashboardPage() {
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Envelope<Dashboard>>('/dashboard') });
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
    inbox: { ...fallback.inbox, ...(response?.inbox || {}) },
  };
  const maxStage = Math.max(...data.stageDistribution.map((item) => item.count), 1);

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
        <Link className="text-button dashboard-text-link" to="/relatorios">Ver tudo</Link>
      </header>
      <div className="activity-list">
        {data.recentActivities.length
          ? data.recentActivities.map((item) => {
            const visual = activityVisual(item.type);
            return <Link to={activityDestination(item.type)} key={item.id}>
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
