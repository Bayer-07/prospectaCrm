import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildReportPdf, type ReportPdfSummary } from './report-pdf.js';

const summary: ReportPdfSummary = {
  period: { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z' },
  sales: { open: 8, openValueCents: 320_000, won: 4, wonValueCents: 180_000, lost: 2, conversionRate: 66.7 },
  funnel: [
    { name: 'Prospeccao', color: '#2da6dc', count: 8, valueCents: 320_000 },
    { name: 'Proposta enviada', color: '#139b6b', count: 3, valueCents: 150_000 },
  ],
  inbox: { opened: 22, currentlyOpen: 5, averageFirstResponseMinutes: 7 },
  campaigns: { total: 2, recipients: { sent: 100, delivered: 92, replied: 13 } },
  activities: [{ _count: { _all: 17 } }],
  tasks: [{ status: 'OPEN', _count: { _all: 6 } }, { status: 'COMPLETED', _count: { _all: 12 } }],
};

describe('relatorio gerencial em PDF', () => {
  it('gera um PDF valido com o resumo do periodo', async () => {
    const buffer = await buildReportPdf({
      summary,
      generatedAt: '2026-07-28T12:00:00Z',
      generatedBy: 'Gabriel Bayer',
    });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBe(1);
  });

  it('pagina o documento quando o funil possui muitas etapas', async () => {
    const buffer = await buildReportPdf({
      summary: {
        ...summary,
        funnel: Array.from({ length: 34 }, (_, index) => ({
          name: `Etapa comercial ${index + 1}`,
          color: '#2da6dc',
          count: 35 - index,
          valueCents: (35 - index) * 10_000,
        })),
      },
      generatedAt: '2026-07-28T12:00:00Z',
      generatedBy: 'Gabriel Bayer',
    });

    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});

