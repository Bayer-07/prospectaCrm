import { describe, expect, it, vi } from 'vitest';
import { OutboundProcessor } from './outbound.processor.js';

vi.mock('@prospecta/database', () => ({
  projectTaskActivity: vi.fn().mockResolvedValue(null),
  projectWhatsappMessageActivity: vi.fn().mockResolvedValue(null),
}));

vi.mock('./storage.js', () => ({
  signedMediaUrl: vi.fn().mockResolvedValue('http://minio.local/proposta-assinada'),
  storedMediaBase64: vi.fn().mockResolvedValue('audio-base64'),
}));

describe('sequência de mensagens do follow-up', () => {
  it('agenda a próxima mensagem somente depois do envio bem-sucedido da anterior', async () => {
    const followUp = { id: 'follow-up-1', revision: 3, status: 'RUNNING', organizationId: 'organization-1', conversationId: 'conversation-1', taskId: 'task-1', responsibleId: 'user-1' };
    const message = {
      id: 'message-1',
      instanceId: 'instance-1',
      conversationId: 'conversation-1',
      providerMessageId: 'local-id',
      type: 'text',
      text: 'Primeira mensagem',
      status: 'QUEUED',
      payload: {},
      media: [],
      replyTo: null,
      instance: { instanceKey: 'comercial' },
      conversation: { remoteJid: '5545999999999@s.whatsapp.net', phoneJid: null, assigneeId: 'user-1', firstResponseAt: null, contact: { phone: '+5545999999999' }, chatbotSession: null },
      followUpStep: { id: 'step-1', position: 0, status: 'QUEUED', followUp },
    };
    const nextStep = { id: 'step-2', delaySeconds: 120, position: 1, status: 'PENDING' };
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(message), update: vi.fn().mockResolvedValue({}) },
      conversation: { update: vi.fn().mockResolvedValue({}) },
      conversationFollowUpStep: { findFirst: vi.fn().mockResolvedValue(nextStep), update: vi.fn().mockResolvedValue({}) },
      conversationFollowUp: { update: vi.fn() },
      task: { update: vi.fn() },
      conversationEvent: { create: vi.fn() },
      $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const evolution = { send: vi.fn().mockResolvedValue({ key: { id: 'provider-id' } }) };
    const followUpQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new OutboundProcessor(db as never, evolution as never, followUpQueue as never, { add: vi.fn() } as never);
    const before = Date.now();

    await expect(processor.process({ data: { messageId: 'message-1' }, attemptsMade: 0, opts: { attempts: 5 } } as never)).resolves.toMatchObject({ tasksUpdated: true });
    const queueOptions = followUpQueue.add.mock.calls[0]?.[2];
    expect(followUpQueue.add).toHaveBeenCalledWith('execute-follow-up', { followUpId: 'follow-up-1', revision: 3, stepId: 'step-2' }, expect.objectContaining({ jobId: 'follow-up-follow-up-1-r3-step-2' }));
    expect(queueOptions.delay).toBeGreaterThanOrEqual(119_000);
    expect(queueOptions.delay).toBeLessThanOrEqual((before + 121_000) - Date.now());
    expect(db.conversationFollowUpStep.update).toHaveBeenCalledWith({ where: { id: 'step-2' }, data: { scheduledAt: expect.any(Date) } });
  });

  it('preserva nome e MIME do documento ao enviar uma etapa agendada', async () => {
    const followUp = { id: 'follow-up-2', revision: 1, status: 'RUNNING', organizationId: 'organization-1', conversationId: 'conversation-1', taskId: 'task-1', responsibleId: 'user-1' };
    const message = {
      id: 'message-document',
      conversationId: 'conversation-1',
      providerMessageId: 'followup:follow-up-2:step-document',
      type: 'document',
      text: 'Segue a proposta',
      status: 'QUEUED',
      payload: { mediaKey: 'organization-1/2026-08-24/proposta.pdf' },
      media: [{
        key: 'organization-1/2026-08-24/proposta.pdf',
        filename: 'Proposta comercial.PDF',
        contentType: 'application/pdf',
      }],
      instance: { instanceKey: 'comercial' },
      conversation: {
        remoteJid: '5545999999999@s.whatsapp.net',
        assigneeId: 'user-1',
        firstResponseAt: new Date(),
        contact: { phone: '+5545999999999' },
        chatbotSession: null,
      },
      followUpStep: { id: 'step-document', position: 0, status: 'QUEUED', followUp },
    };
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(message), update: vi.fn().mockResolvedValue({}) },
      conversation: { update: vi.fn().mockResolvedValue({}) },
      conversationFollowUpStep: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
      conversationFollowUp: { update: vi.fn().mockResolvedValue({}) },
      task: { update: vi.fn().mockResolvedValue({}) },
      conversationEvent: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const evolution = { send: vi.fn().mockResolvedValue({ key: { id: 'provider-document' } }) };
    const processor = new OutboundProcessor(db as never, evolution as never, { add: vi.fn() } as never);

    await processor.process({ data: { messageId: message.id }, attemptsMade: 0, opts: { attempts: 5 } } as never);

    expect(evolution.send).toHaveBeenCalledWith('comercial', expect.objectContaining({
      type: 'document',
      mediaUrl: 'http://minio.local/proposta-assinada',
      fileName: 'Proposta comercial.PDF',
      mimeType: 'application/pdf',
    }));
  });

  it('recupera os metadados pelo mediaKey ao reenviar uma mensagem legada', async () => {
    const mediaKey = 'organization-1/2026-08-24/contrato.docx';
    const message = {
      id: 'message-retry',
      conversationId: 'conversation-1',
      providerMessageId: 'local:retry',
      type: 'document',
      text: null,
      status: 'QUEUED',
      payload: { mediaKey },
      media: [],
      instance: { instanceKey: 'comercial' },
      conversation: {
        remoteJid: '5545999999999@s.whatsapp.net',
        assigneeId: 'user-1',
        firstResponseAt: new Date(),
        contact: { phone: '+5545999999999' },
        chatbotSession: null,
      },
      followUpStep: null,
    };
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(message), update: vi.fn().mockResolvedValue({}) },
      mediaAsset: { findUnique: vi.fn().mockResolvedValue({ key: mediaKey, filename: 'Contrato', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) },
      conversation: { update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const evolution = { send: vi.fn().mockResolvedValue({ key: { id: 'provider-retry' } }) };
    const processor = new OutboundProcessor(db as never, evolution as never);

    await processor.process({ data: { messageId: message.id }, attemptsMade: 0, opts: { attempts: 5 } } as never);

    expect(db.mediaAsset.findUnique).toHaveBeenCalledWith({
      where: { key: mediaKey },
      select: { key: true, filename: true, contentType: true },
    });
    expect(evolution.send).toHaveBeenCalledWith('comercial', expect.objectContaining({
      fileName: 'Contrato.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
  });
});
