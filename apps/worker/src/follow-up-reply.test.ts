import { describe, expect, it, vi } from 'vitest';
import { InboundProcessor } from './inbound.processor.js';

function setup(status: 'SCHEDULED' | 'RUNNING') {
  const active = { id: 'follow-up-1', status, taskId: 'task-1', responsibleId: 'user-1' };
  const tx = {
    conversationFollowUp: { findFirst: vi.fn().mockResolvedValue(active), update: vi.fn().mockResolvedValue({}) },
    conversationFollowUpStep: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    message: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    task: { update: vi.fn().mockResolvedValue({}) },
    conversationEvent: { create: vi.fn().mockResolvedValue({}) },
    notification: { create: vi.fn().mockResolvedValue({}) },
    campaignRecipient: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    conversationAiGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    workflowEnrollment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    contact: { update: vi.fn() },
    consentEvent: { create: vi.fn() },
    suppression: { upsert: vi.fn() },
  };
  const db = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
  const emailQueue = { add: vi.fn().mockResolvedValue({}) };
  const processor = new InboundProcessor(db as never, undefined, {} as never, undefined, emailQueue as never);
  const run = () => (processor as unknown as {
    handleInboundEffects(instance: object, conversation: object, contact: object, messageId: string, text: string): Promise<boolean>;
  }).handleInboundEffects(
    { organizationId: 'organization-1' },
    { id: 'conversation-1', assigneeId: 'user-1' },
    { id: 'contact-1', name: 'Maria' },
    'message-1',
    'Retorno do cliente',
  );
  return { run, tx, emailQueue };
}

describe('resposta do contato durante follow-up', () => {
  it('cancela antes do início, fecha a tarefa e avisa o responsável por e-mail', async () => {
    const context = setup('SCHEDULED');
    await expect(context.run()).resolves.toBe(true);
    expect(context.tx.conversationFollowUp.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(context.tx.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: 'CANCELLED', completedAt: null } });
    expect(context.emailQueue.add).toHaveBeenCalledWith('send-follow-up-alert', { followUpId: 'follow-up-1', reason: 'contact_replied_before_start' }, expect.any(Object));
  });

  it('interrompe apenas as mensagens restantes durante a sequência e não envia e-mail', async () => {
    const context = setup('RUNNING');
    await expect(context.run()).resolves.toBe(true);
    expect(context.tx.conversationFollowUp.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'INTERRUPTED' }) }));
    expect(context.tx.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    expect(context.emailQueue.add).not.toHaveBeenCalled();
  });
});
