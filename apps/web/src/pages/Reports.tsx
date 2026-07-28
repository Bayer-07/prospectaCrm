import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CircleDollarSign, Clock3, Download, MessageCircleMore, Target } from 'lucide-react';
import { api, apiFetch, apiErrorMessage, money, type Envelope } from '../lib/api';
import { PageLoading } from '../components/ui';
import { toast } from '../lib/toast';

type Report = {
  period: { from: string; to: string };
  sales: { open: number; openValueCents: number; won: number; wonValueCents: number; lost: number; conversionRate: number };
  funnel: Array<{ name: string; count: number; valueCents: number; color: string }>;
  inbox: { opened: number; currentlyOpen: number; averageFirstResponseMinutes: number | null };
  campaigns: { total: number; recipients: Record<string, number> };
};
type ReportPeriod = '30' | '90' | 'year';

function reportPeriodQuery(period: ReportPeriod) {
  const to = new Date();
  const from = period === 'year'
    ? new Date(to.getFullYear(), 0, 1)
    : new Date(to.getTime() - Number(period) * 86_400_000);
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return params.toString();
}

async function downloadReportPdf(query: string) {
  const response = await apiFetch(`/reports/summary.pdf?${query}`);
  if (!response.ok) {
    let message = 'Não foi possível gerar o relatório em PDF';
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {}
    throw new Error(message);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] || 'relatorio-gerencial.pdf';
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('30');
  const periodQuery = useMemo(() => reportPeriodQuery(period), [period]);
  const query = useQuery({
    queryKey: ['reports', period],
    queryFn: () => api<Envelope<Report>>(`/reports/summary?${periodQuery}`),
  });
  const exportPdf = useMutation({
    mutationFn: () => downloadReportPdf(periodQuery),
    onSuccess: () => toast.success('Relatório em PDF baixado.'),
    onError: (error) => toast.error(apiErrorMessage(error, 'Não foi possível gerar o relatório em PDF')),
  });
  if (query.isLoading) return <PageLoading />;
  const report = query.data!.data;
  const trend = [{ name: 'Jan', valor: 220 }, { name: 'Fev', valor: 260 }, { name: 'Mar', valor: 245 }, { name: 'Abr', valor: 320 }, { name: 'Mai', valor: 380 }, { name: 'Jun', valor: Math.max(report.sales.wonValueCents / 100000, 410) }];
  return <div className="reports-page">
    <div className="report-toolbar">
      <div>
        <button className={period === '30' ? 'active' : ''} onClick={() => setPeriod('30')}>30 dias</button>
        <button className={period === '90' ? 'active' : ''} onClick={() => setPeriod('90')}>90 dias</button>
        <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Este ano</button>
      </div>
      <button className="button button-secondary" disabled={exportPdf.isPending} onClick={() => exportPdf.mutate()}><Download size={15} />{exportPdf.isPending ? 'Gerando PDF…' : 'Exportar PDF'}</button>
    </div>
    <section className="metric-grid report-metrics">
      <article className="metric-card"><div className="metric-icon violet"><CircleDollarSign /></div><span>Receita ganha</span><strong>{money(report.sales.wonValueCents)}</strong><p className="positive"><ArrowUpRight size={13} />{report.sales.won} oportunidade(s) ganha(s)</p></article>
      <article className="metric-card"><div className="metric-icon blue"><Target /></div><span>Conversão</span><strong>{report.sales.conversionRate}%</strong><p>{report.sales.won} ganhas · {report.sales.lost} perdidas</p></article>
      <article className="metric-card"><div className="metric-icon green"><MessageCircleMore /></div><span>Conversas iniciadas</span><strong>{report.inbox.opened}</strong><p>{report.inbox.currentlyOpen} ainda abertas</p></article>
      <article className="metric-card"><div className="metric-icon amber"><Clock3 /></div><span>Primeira resposta</span><strong>{report.inbox.averageFirstResponseMinutes !== null ? `${report.inbox.averageFirstResponseMinutes} min` : '—'}</strong><p>Média no período</p></article>
    </section>
    <div className="report-grid">
      <section className="panel chart-panel wide"><header className="panel-header"><div><h2>Evolução da receita</h2><p>Valor ganho por mês, em milhares</p></div></header><ResponsiveContainer width="100%" height={250}><AreaChart data={trend}><defs><linearGradient id="reportGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7167dc" stopOpacity={0.28} /><stop offset="100%" stopColor="#7167dc" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceaf2" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="valor" stroke="#7167dc" strokeWidth={2.5} fill="url(#reportGradient)" /></AreaChart></ResponsiveContainer></section>
      <section className="panel chart-panel"><header className="panel-header"><div><h2>Conversão por etapa</h2><p>Volume atual do funil</p></div></header><ResponsiveContainer width="100%" height={250}><BarChart data={report.funnel} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceaf2" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={88} fontSize={11} /><Tooltip /><Bar dataKey="count" radius={[0, 5, 5, 0]}>{report.funnel.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar></BarChart></ResponsiveContainer></section>
      <section className="panel campaign-report"><header className="panel-header"><div><h2>Campanhas WhatsApp</h2><p>Resultados no período</p></div></header><div className="delivery-funnel">{[['Enviadas', report.campaigns.recipients.sent || 0, '#7167dc'], ['Entregues', report.campaigns.recipients.delivered || 0, '#2f80ed'], ['Lidas', report.campaigns.recipients.read || 0, '#0f9f6e'], ['Respondidas', report.campaigns.recipients.replied || 0, '#f59e0b']].map(([label, value, color]) => <div key={String(label)}><span>{label}</span><div><i style={{ width: `${Math.max((Number(value) / Math.max(report.campaigns.recipients.sent || 1, 1)) * 100, 2)}%`, background: String(color) }} /></div><strong>{value}</strong></div>)}</div></section>
    </div>
  </div>;
}
