import { describe, expect, it, vi } from 'vitest';
import { OutboundProcessor } from './outbound.processor.js';

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
});
