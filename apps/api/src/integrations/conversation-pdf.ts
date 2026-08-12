import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type ConversationPdfItem = {
  kind: 'message' | 'event';
  createdAt: Date | string;
  direction?: 'INBOUND' | 'OUTBOUND';
  text: string;
  transcription?: string;
  status?: string;
};

export type ConversationPdfData = {
  organizationName: string;
  contactName: string;
  contactPhone?: string | null;
  instanceName: string;
  assigneeName?: string | null;
  status: string;
  createdAt: Date | string;
  exportedAt: Date | string;
  items: ConversationPdfItem[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE = rgb(0.16, 0.55, 0.76);
const INK = rgb(0.12, 0.15, 0.18);
const MUTED = rgb(0.39, 0.44, 0.49);
const LINE = rgb(0.86, 0.88, 0.9);
const INBOUND = rgb(0.95, 0.96, 0.97);
const OUTBOUND = rgb(0.88, 0.96, 0.99);
const EVENT = rgb(0.93, 0.96, 0.98);
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo',
});

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

function dateTime(value: Date | string) {
  return dateTimeFormatter.format(new Date(value));
}

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number) {
  const parts: string[] = [];
  let part = '';
  for (const character of word) {
    if (part && font.widthOfTextAtSize(`${part}${character}`, size) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part += character;
    }
  }
  return { parts, remainder: part };
}

function wrapLine(value: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }
    const split = splitLongWord(word, font, size, maxWidth);
    lines.push(...split.parts);
    line = split.remainder;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number) {
  return pdfText(value).split(/\r?\n/).flatMap((line) => wrapLine(line, font, size, maxWidth));
}

export async function buildConversationPdf(data: ConversationPdfData) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const addPage = (continuation = false) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 70, width: PAGE_WIDTH, height: 70, color: BLUE });
    page.drawText(continuation ? 'Histórico do atendimento' : 'Histórico de atendimento', { x: MARGIN, y: PAGE_HEIGHT - 38, size: continuation ? 16 : 19, font: bold, color: rgb(1, 1, 1) });
    page.drawText(pdfText(data.contactName), { x: MARGIN, y: PAGE_HEIGHT - 56, size: 9.5, font: regular, color: rgb(0.9, 0.97, 1) });
    y = PAGE_HEIGHT - 94;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 48) addPage(true);
  };

  addPage();
  const status: Record<string, string> = { WAITING: 'Aguardando', OPEN: 'Aberto', CLOSED: 'Encerrado' };
  const metadata = [
    ['Empresa', data.organizationName],
    ['Contato', data.contactName],
    ['Telefone', data.contactPhone || 'Não informado'],
    ['Conexão', data.instanceName],
    ['Atendente', data.assigneeName || 'Sem atendente'],
    ['Status', status[data.status] || data.status],
    ['Início', dateTime(data.createdAt)],
    ['Exportado em', dateTime(data.exportedAt)],
  ];
  metadata.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * (CONTENT_WIDTH / 2 + 4);
    const rowY = y - row * 35;
    page.drawText(label.toUpperCase(), { x, y: rowY, size: 7.5, font: bold, color: BLUE });
    page.drawText(pdfText(value), { x, y: rowY - 14, size: 10, font: regular, color: INK, maxWidth: CONTENT_WIDTH / 2 - 16 });
  });
  y -= 4 * 35 + 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LINE });
  y -= 22;

  const drawEvent = (item: ConversationPdfItem) => {
    const lines = wrapText(`${item.text} - ${dateTime(item.createdAt)}`, regular, 8.5, CONTENT_WIDTH - 24);
    const height = 17 + lines.length * 11;
    ensureSpace(height + 9);
    page.drawRectangle({ x: MARGIN + 34, y: y - height, width: CONTENT_WIDTH - 68, height, color: EVENT, borderColor: LINE, borderWidth: .6 });
    lines.forEach((line, index) => page.drawText(line, { x: MARGIN + 46, y: y - 16 - index * 11, size: 8.5, font: regular, color: MUTED }));
    y -= height + 9;
  };

  const drawMessage = (item: ConversationPdfItem) => {
    const outbound = item.direction === 'OUTBOUND';
    const author = outbound ? (data.assigneeName || 'Atendente') : data.contactName;
    const label = `${author} - ${dateTime(item.createdAt)}`;
    const body = [
      item.text || '[Mensagem sem texto]',
      item.transcription ? `Transcrição do áudio:\n${item.transcription}` : '',
    ].filter(Boolean).join('\n\n');
    const bodyLines = wrapText(body, regular, 9.5, CONTENT_WIDTH - 28);
    let offset = 0;
    let continuation = false;
    while (offset < bodyLines.length) {
      if (y < 110) addPage(true);
      const availableLines = Math.max(1, Math.floor((y - 74) / 13));
      const chunk = bodyLines.slice(offset, offset + availableLines);
      const height = 31 + chunk.length * 13;
      ensureSpace(height + 10);
      const blockY = y - height;
      page.drawRectangle({ x: MARGIN, y: blockY, width: CONTENT_WIDTH, height, color: outbound ? OUTBOUND : INBOUND, borderColor: outbound ? BLUE : LINE, borderWidth: .65 });
      page.drawText(pdfText(continuation ? `${label} (continuação)` : label), { x: MARGIN + 14, y: y - 16, size: 7.8, font: bold, color: outbound ? BLUE : MUTED });
      chunk.forEach((line, index) => page.drawText(line, { x: MARGIN + 14, y: y - 32 - index * 13, size: 9.5, font: regular, color: INK }));
      y -= height + 10;
      offset += chunk.length;
      continuation = true;
    }
  };

  for (const item of [...data.items].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())) {
    if (item.kind === 'event') drawEvent(item);
    else drawMessage(item);
  }

  if (!data.items.length) {
    page.drawText('Nenhuma mensagem registrada neste atendimento.', { x: MARGIN, y, size: 10, font: regular, color: MUTED });
  }

  pages.forEach((current, index) => {
    const footer = `Página ${index + 1} de ${pages.length}`;
    current.drawLine({ start: { x: MARGIN, y: 35 }, end: { x: PAGE_WIDTH - MARGIN, y: 35 }, thickness: .6, color: LINE });
    current.drawText('Documento interno - CRM', { x: MARGIN, y: 20, size: 7.5, font: regular, color: MUTED });
    current.drawText(footer, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footer, 7.5), y: 20, size: 7.5, font: regular, color: MUTED });
  });

  return Buffer.from(await document.save());
}
