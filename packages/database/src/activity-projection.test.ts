import { describe, expect, it, vi } from 'vitest';
import { projectNoteActivity, projectWhatsappMessageActivity } from './activity-projection.js';

describe('projeção de atividades comerciais', () => {
  it('usa a mesma chave de origem em retries do envio de WhatsApp', async () => {
    const messageId = '55555555-5555-4555-8555-555555555555';
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const upsert = vi.fn().mockResolvedValue({ id: 'activity-1', organizationId });
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue({
        id: messageId, conversationId: 'conversation-1', direction: 'OUTBOUND', sentAt: new Date('2026-08-28T12:00:00Z'),
        status: 'SENT', type: 'text', text: 'Olá', payload: { authorId: '33333333-3333-4333-8333-333333333333' },
        conversation: { organizationId, teamId: '22222222-2222-4222-8222-222222222222', contactId: '44444444-4444-4444-8444-444444444444', contact: { companies: [] } },
      }) },
      campaign: { findUnique: vi.fn() },
      activity: { upsert },
    };
    await projectWhatsappMessageActivity(db as never, messageId);
    await projectWhatsappMessageActivity(db as never, messageId);
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const call of upsert.mock.calls) {
      expect(call[0].where.organizationId_sourceType_sourceId).toEqual({ organizationId, sourceType: 'WHATSAPP_MESSAGE', sourceId: messageId });
    }
  });

  it('projeta notas legadas com upsert idempotente', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const noteId = '55555555-5555-4555-8555-555555555555';
    const upsert = vi.fn().mockResolvedValue({ id: 'activity-note' });
    const db = {
      note: { findUnique: vi.fn().mockResolvedValue({
        id: noteId,
        authorId: '33333333-3333-4333-8333-333333333333',
        companyId: null,
        contactId: '44444444-4444-4444-8444-444444444444',
        opportunityId: null,
        body: 'Nota de qualificação',
        createdAt: new Date('2026-08-28T12:00:00Z'),
        author: { organizationId, teamId: null },
      }) },
      activity: { upsert },
    };
    await projectNoteActivity(db as never, noteId);
    await projectNoteActivity(db as never, noteId);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].where.organizationId_sourceType_sourceId).toEqual({ organizationId, sourceType: 'NOTE', sourceId: noteId });
  });
});
