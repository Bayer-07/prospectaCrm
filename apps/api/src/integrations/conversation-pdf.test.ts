import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildConversationPdf } from './conversation-pdf.js';

describe('exportacao de conversa em PDF', () => {
  it('gera um documento valido e pagina historicos longos', async () => {
    const buffer = await buildConversationPdf({
      organizationName: 'Comercial BZS',
      contactName: 'Adriana Bayer',
      contactPhone: '+55 45 99922-5389',
      instanceName: 'Comercial BZS',
      assigneeName: 'Gabriel Bayer',
      status: 'OPEN',
      createdAt: '2026-07-20T12:00:00Z',
      exportedAt: '2026-07-20T16:00:00Z',
      items: Array.from({ length: 80 }, (_, index) => ({
        kind: index % 9 === 0 ? 'event' as const : 'message' as const,
        direction: index % 2 ? 'INBOUND' as const : 'OUTBOUND' as const,
        text: index % 9 === 0 ? 'Gabriel Bayer transferiu o atendimento' : `Mensagem de homologacao ${index + 1} com conteudo suficiente para validar quebra de linha e paginacao.`,
        createdAt: new Date(Date.UTC(2026, 6, 20, 12, index)),
      })),
    });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});
