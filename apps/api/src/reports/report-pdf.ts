import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type ReportPdfSummary = {
  period: { from: Date | string; to: Date | string };
  sales: {
    open: number;
    openValueCents: number;
    won: number;
    wonValueCents: number;
    lost: number;
    conversionRate: number;
  };
  funnel: Array<{ name: string; color: string; count: number; valueCents: number }>;
  inbox: { opened: number; currentlyOpen: number; averageFirstResponseMinutes: number | null };
  campaigns: { total: number; recipients: Record<string, number> };
  activities: Array<{ _count: unknown }>;
  tasks: Array<{ status: string; _count: unknown }>;
  activitySummary?: null | {
    totals: { calls: number; connectedCalls: number; connectionRate: number; whatsapp: number; emails: number; meetings: number; notes: number; completedTasks: number };
    origins: Record<string, number>;
  };
};

export type ReportPdfInput = {
  summary: ReportPdfSummary;
  generatedAt: Date | string;
  generatedBy?: string | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE = rgb(0.18, 0.65, 0.86);
const BLUE_DARK = rgb(0.08, 0.36, 0.5);
const INK = rgb(0.12, 0.15, 0.18);
const MUTED = rgb(0.39, 0.44, 0.49);
const LINE = rgb(0.85, 0.88, 0.9);
const SURFACE = rgb(0.97, 0.98, 0.985);
const GREEN = rgb(0.08, 0.61, 0.42);
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const reportFonts = Promise.all([
  readFile(new URL('../../assets/fonts/Poppins-Regular.ttf', import.meta.url)),
  readFile(new URL('../../assets/fonts/Poppins-Bold.ttf', import.meta.url)),
]);

function pdfText(value: unknown) {
  const raw = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
  const normalized = raw
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
  return [...normalized]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      const printableLatin = (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff);
      const layoutWhitespace = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
      return printableLatin || layoutWhitespace;
    })
    .join('')
    .trim();
}

function money(cents: number) {
  return pdfText(moneyFormatter.format(cents / 100));
}

function countGroup(value: unknown) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return 0;
  const count = value as Record<string, unknown>;
  if (typeof count._all === 'number') return count._all;
  return Math.max(0, ...Object.values(count).filter((item): item is number => typeof item === 'number'));
}

function stageColor(value: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return BLUE;
  const number = Number.parseInt(match[1], 16);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

function fitText(value: string, font: PDFFont, initialSize: number, maxWidth: number) {
  let size = initialSize;
  while (size > 7 && font.widthOfTextAtSize(value, size) > maxWidth) size -= .5;
  return size;
}

export async function buildReportPdf({ summary, generatedAt, generatedBy }: ReportPdfInput) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await reportFonts;
  const regular = await document.embedFont(regularBytes, { subset: true });
  const bold = await document.embedFont(boldBytes, { subset: true });
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const addPage = (continuation = false) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 78, width: PAGE_WIDTH, height: 78, color: BLUE_DARK });
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 78, width: 9, height: 78, color: BLUE });
    page.drawText(continuation ? 'Relatório gerencial - continuação' : 'Relatório gerencial', {
      x: MARGIN,
      y: PAGE_HEIGHT - 42,
      size: continuation ? 16 : 21,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText('BZS One', {
      x: MARGIN,
      y: PAGE_HEIGHT - 60,
      size: 9,
      font: regular,
      color: rgb(.83, .94, .98),
    });
    y = PAGE_HEIGHT - 101;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 52) addPage(true);
  };

  const sectionTitle = (title: string, description?: string) => {
    ensureSpace(description ? 44 : 30);
    page.drawText(pdfText(title).toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: BLUE_DARK });
    if (description) page.drawText(pdfText(description), { x: MARGIN, y: y - 14, size: 8, font: regular, color: MUTED });
    y -= description ? 31 : 20;
  };

  addPage();
  const period = `${dateFormatter.format(new Date(summary.period.from))} a ${dateFormatter.format(new Date(summary.period.to))}`;
  page.drawText('PERÍODO ANALISADO', { x: MARGIN, y, size: 7.5, font: bold, color: BLUE });
  page.drawText(period, { x: MARGIN, y: y - 15, size: 10.5, font: bold, color: INK });
  page.drawText('GERADO EM', { x: 250, y, size: 7.5, font: bold, color: BLUE });
  page.drawText(dateTimeFormatter.format(new Date(generatedAt)), { x: 250, y: y - 15, size: 10, font: regular, color: INK });
  page.drawText('RESPONSÁVEL', { x: 407, y, size: 7.5, font: bold, color: BLUE });
  page.drawText(pdfText(generatedBy || 'Sistema'), { x: 407, y: y - 15, size: fitText(pdfText(generatedBy || 'Sistema'), regular, 10, 146), font: regular, color: INK });
  y -= 49;

  sectionTitle('Visão geral');
  const metrics = [
    ['Receita ganha', money(summary.sales.wonValueCents), `${summary.sales.won} oportunidade(s)`],
    ['Conversão', `${summary.sales.conversionRate}%`, `${summary.sales.lost} perdida(s)`],
    ['Conversas iniciadas', String(summary.inbox.opened), `${summary.inbox.currentlyOpen} aberta(s)`],
    ['Primeira resposta', summary.inbox.averageFirstResponseMinutes === null ? 'Não calculada' : `${summary.inbox.averageFirstResponseMinutes} min`, 'Média do período'],
  ];
  const gap = 8;
  const cardWidth = (CONTENT_WIDTH - gap * 3) / 4;
  metrics.forEach(([label, value, detail], index) => {
    const x = MARGIN + index * (cardWidth + gap);
    page.drawRectangle({ x, y: y - 69, width: cardWidth, height: 69, color: SURFACE, borderColor: LINE, borderWidth: .7 });
    page.drawRectangle({ x, y: y - 69, width: 3.5, height: 69, color: index === 2 ? GREEN : BLUE });
    page.drawText(pdfText(label).toUpperCase(), { x: x + 11, y: y - 16, size: 6.8, font: bold, color: MUTED });
    page.drawText(pdfText(value), { x: x + 11, y: y - 38, size: fitText(pdfText(value), bold, 13, cardWidth - 20), font: bold, color: INK });
    page.drawText(pdfText(detail), { x: x + 11, y: y - 55, size: fitText(pdfText(detail), regular, 7.2, cardWidth - 20), font: regular, color: MUTED });
  });
  y -= 92;

  sectionTitle('Pipeline comercial', 'Volume e valor atual em cada etapa');
  const maxStageCount = Math.max(1, ...summary.funnel.map((stage) => stage.count));
  if (!summary.funnel.length) {
    page.drawText('Nenhuma etapa encontrada no período.', { x: MARGIN, y, size: 9, font: regular, color: MUTED });
    y -= 24;
  } else {
    for (const stage of summary.funnel) {
      ensureSpace(34);
      const name = pdfText(stage.name);
      const barWidth = Math.max(4, (stage.count / maxStageCount) * 190);
      page.drawText(name, { x: MARGIN, y, size: fitText(name, regular, 8.5, 148), font: regular, color: INK });
      page.drawRectangle({ x: MARGIN + 157, y: y - 1, width: 190, height: 8, color: SURFACE });
      page.drawRectangle({ x: MARGIN + 157, y: y - 1, width: barWidth, height: 8, color: stageColor(stage.color) });
      page.drawText(`${stage.count}`, { x: MARGIN + 358, y, size: 8.5, font: bold, color: INK });
      const value = money(stage.valueCents);
      page.drawText(value, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(value, 8.5), y, size: 8.5, font: bold, color: INK });
      y -= 24;
    }
  }
  y -= 8;

  sectionTitle('Resultados operacionais');
  ensureSpace(126);
  const panelWidth = (CONTENT_WIDTH - 10) / 2;
  const drawPanel = (x: number, title: string, items: Array<[string, string]>) => {
    page.drawRectangle({ x, y: y - 111, width: panelWidth, height: 111, color: SURFACE, borderColor: LINE, borderWidth: .7 });
    page.drawText(title.toUpperCase(), { x: x + 13, y: y - 18, size: 8, font: bold, color: BLUE_DARK });
    items.forEach(([label, value], index) => {
      const rowY = y - 40 - index * 20;
      page.drawText(pdfText(label), { x: x + 13, y: rowY, size: 8.2, font: regular, color: MUTED });
      page.drawText(pdfText(value), { x: x + panelWidth - 13 - bold.widthOfTextAtSize(pdfText(value), 8.5), y: rowY, size: 8.5, font: bold, color: INK });
      if (index < items.length - 1) page.drawLine({ start: { x: x + 13, y: rowY - 8 }, end: { x: x + panelWidth - 13, y: rowY - 8 }, thickness: .4, color: LINE });
    });
  };
  const activityTotals = summary.activitySummary?.totals;
  drawPanel(MARGIN, 'Atividade comercial', [
    ['Ligações', String(activityTotals?.calls || 0)],
    ['Taxa de atendimento', `${activityTotals?.connectionRate || 0}%`],
    ['WhatsApp enviados', String(activityTotals?.whatsapp || 0)],
    ['E-mails enviados', String(activityTotals?.emails || 0)],
  ]);
  drawPanel(MARGIN + panelWidth + 10, 'Agenda e atendimento', [
    ['Reuniões realizadas', String(activityTotals?.meetings || 0)],
    ['Tarefas concluídas', String(activityTotals?.completedTasks || 0)],
    ['Conversas iniciadas', String(summary.inbox.opened)],
    ['Primeira resposta', summary.inbox.averageFirstResponseMinutes === null ? 'Não calculada' : `${summary.inbox.averageFirstResponseMinutes} min`],
  ]);
  y -= 130;

  const taskTotal = summary.tasks.reduce((total, item) => total + countGroup(item._count), 0);
  const openTasks = summary.tasks.filter((item) => item.status === 'OPEN').reduce((total, item) => total + countGroup(item._count), 0);
  ensureSpace(48);
  page.drawRectangle({ x: MARGIN, y: y - 39, width: CONTENT_WIDTH, height: 39, color: rgb(.93, .97, .99), borderColor: LINE, borderWidth: .7 });
  page.drawText('TAREFAS NO PERÍODO', { x: MARGIN + 13, y: y - 16, size: 7.5, font: bold, color: BLUE_DARK });
  page.drawText(`${taskTotal} registradas`, { x: MARGIN + 13, y: y - 30, size: 8.5, font: regular, color: INK });
  const taskStatus = `${openTasks} abertas`;
  page.drawText(taskStatus, { x: PAGE_WIDTH - MARGIN - 13 - bold.widthOfTextAtSize(taskStatus, 9), y: y - 24, size: 9, font: bold, color: INK });

  pages.forEach((current, index) => {
    const footer = `Página ${index + 1} de ${pages.length}`;
    current.drawLine({ start: { x: MARGIN, y: 35 }, end: { x: PAGE_WIDTH - MARGIN, y: 35 }, thickness: .6, color: LINE });
    current.drawText('Documento interno - BZS One', { x: MARGIN, y: 20, size: 7.5, font: regular, color: MUTED });
    current.drawText(footer, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footer, 7.5), y: 20, size: 7.5, font: regular, color: MUTED });
  });

  return Buffer.from(await document.save());
}
