import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { EvolutionService } from './evolution.service.js';

const { buildConversationPdf } = vi.hoisted(() => ({
  buildConversationPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')),
}));

vi.mock('./conversation-pdf.js', () => ({ buildConversationPdf }));

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('exportação do atendimento em PDF', () => {
  it('exporta somente o último atendimento e aguarda a transcrição dos áudios', async () => {
    const previousClosedAt = new Date('2026-08-09T12:00:00Z');
    const attendanceStartedAt = new Date('2026-08-10T09:00:00Z');
    const audioCreatedAt = new Date('2026-08-10T09:01:00Z');
    const messageFindMany = vi.fn()
      .mockResolvedValueOnce([{
        id: 'audio-1',
        direction: 'INBOUND',
        type: 'audio',
        text: null,
        status: 'DELIVERED',
        payload: {},
        createdAt: audioCreatedAt,
        transcriptionStatus: null,
        transcriptionText: null,
        transcriptionError: null,
        media: [{ filename: 'audio.ogg', contentType: 'audio/ogg' }],
      }])
      .mockResolvedValueOnce([{
        id: 'audio-1',
        transcriptionStatus: 'COMPLETED',
        transcriptionText: 'Olá, preciso de ajuda com o sistema.',
        transcriptionError: null,
      }]);
    const eventFindFirst = vi.fn()
      .mockResolvedValueOnce({ id: 'start-2', createdAt: attendanceStartedAt })
      .mockResolvedValueOnce({ createdAt: previousClosedAt });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        status: 'OPEN',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        organization: { name: 'BZS Tecnologia' },
        contact: { name: 'Cliente Teste', phone: '+5545999999999' },
        instance: { name: 'Comercial' },
        assignee: { name: 'Gabriel' },
      }) },
      conversationEvent: {
        findFirst: eventFindFirst,
        findMany: vi.fn().mockResolvedValue([{
          id: 'start-2', type: 'started', text: 'Novo atendimento iniciado', createdAt: attendanceStartedAt,
        }]),
      },
      message: { findMany: messageFindMany },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const transcriptions = { request: vi.fn().mockResolvedValue({ status: 'PROCESSING' }) };
    const service = new EvolutionService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      transcriptions as never,
    );

    const result = await service.exportConversationPdf(auth, 'conversation-1');

    expect(result.buffer.toString()).toBe('%PDF-test');
    expect(eventFindFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        conversationId: 'conversation-1',
        type: 'closed',
        createdAt: { lt: attendanceStartedAt },
      }),
    }));
    expect(messageFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        conversationId: 'conversation-1',
        createdAt: { gt: previousClosedAt },
      }),
    }));
    expect(transcriptions.request).toHaveBeenCalledWith(auth, 'conversation-1', 'audio-1');
    expect(buildConversationPdf).toHaveBeenCalledWith(expect.objectContaining({
      createdAt: attendanceStartedAt,
      items: expect.arrayContaining([
        expect.objectContaining({
          kind: 'message',
          createdAt: audioCreatedAt,
          transcription: 'Olá, preciso de ajuda com o sistema.',
        }),
      ]),
    }));
  });
});
