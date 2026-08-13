import { describe, expect, it, vi } from 'vitest';
import { FollowUpProcessor } from './follow-up.processor.js';

function followUp(status = 'SCHEDULED') {
  const scheduledAt = new Date(Date.now() - 1_000);
  return {
    id: 'follow-up-1',
    organizationId: 'organization-1',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    responsibleId: 'user-1',
    revision: 1,
    mode: 'MESSAGE_SEQUENCE',
    status,
    scheduledAt,
    workflowVersion: null,
    workflowEnrollmentId: null,
    steps: [{ id: 'step-1', position: 0, status: 'PENDING', scheduledAt, messageId: null, text: 'Olá {{nome}}', messageType: 'text', mediaKey: null }],
    responsible: { id: 'user-1', name: 'Gabriel Bayer', email: 'gabriel@example.com', teamId: 'team-1', status: 'ACTIVE', messageSignatureEnabled: true },
    conversation: {
      id: 'conversation-1',
      status: 'OPEN',
      assigneeId: 'user-1',
      instanceId: 'instance-1',
      contactId: 'contact-1',
      instance: { id: 'instance-1', status: 'CONNECTED' },
      assignee: { id: 'user-1', name: 'Gabriel Bayer', email: 'gabriel@example.com', teamId: 'team-1', status: 'ACTIVE', messageSignatureEnabled: true },
      contact: { id: 'contact-1', name: 'Maria', consentStatus: 'GRANTED', suppressions: [], companies: [] },
    },
  };
}

describe('processador de follow-ups', () => {
  it('renderiza variáveis, aplica a assinatura atual e enfileira a mensagem uma única vez', async () => {
    const scheduled = followUp('SCHEDULED');
    const running = followUp('RUNNING');
    const createdMessage = { id: 'message-1' };
    const tx = {
      conversationFollowUpStep: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      message: { create: vi.fn().mockResolvedValue(createdMessage) },
    };
    const db = {
      conversationFollowUp: {
        findUnique: vi.fn().mockResolvedValueOnce(scheduled).mockResolvedValue(running),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      conversationEvent: { create: vi.fn().mockResolvedValue({}) },
      mediaAsset: { findUnique: vi.fn() },
      message: { findFirst: vi.fn() },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const outboundQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new FollowUpProcessor(db as never, { add: vi.fn() } as never, outboundQueue as never, { add: vi.fn() } as never, { add: vi.fn() } as never);

    await expect(processor.process({ data: { followUpId: scheduled.id, revision: 1, stepId: 'step-1' } } as never)).resolves.toEqual({ queued: true, messageId: 'message-1' });
    expect(tx.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      text: '*Gabriel Bayer:*\nOlá Maria',
      providerMessageId: 'followup:follow-up-1:step-1',
      payload: expect.objectContaining({ source: 'follow_up', authorId: 'user-1' }),
    }) });
    expect(outboundQueue.add).toHaveBeenCalledWith('send-message', { messageId: 'message-1' }, expect.objectContaining({
      jobId: 'message-message-1',
      attempts: 31,
      backoff: { type: 'fixed', delay: 60_000 },
    }));
  });

  it('não envia e solicita nova tentativa enquanto a conexão estiver desconectada', async () => {
    const disconnected = followUp();
    disconnected.conversation.instance.status = 'DISCONNECTED';
    const db = { conversationFollowUp: { findUnique: vi.fn().mockResolvedValue(disconnected) } };
    const outboundQueue = { add: vi.fn() };
    const processor = new FollowUpProcessor(db as never, { add: vi.fn() } as never, outboundQueue as never, { add: vi.fn() } as never, { add: vi.fn() } as never);

    await expect(processor.process({ data: { followUpId: disconnected.id, revision: 1, stepId: 'step-1' } } as never)).rejects.toThrow('nova tentativa em um minuto');
    expect(outboundQueue.add).not.toHaveBeenCalled();
  });

  it('recupera somente agendamentos no horizonte indexado', async () => {
    const dueAt = new Date(Date.now() + 5 * 60_000);
    const add = vi.fn().mockResolvedValue({});
    const db = {
      conversationFollowUp: { findMany: vi.fn().mockResolvedValue([{ id: 'follow-up-1', revision: 2, scheduledAt: dueAt, mode: 'MESSAGE_SEQUENCE', steps: [{ id: 'step-1' }] }]) },
      conversationFollowUpStep: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const processor = new FollowUpProcessor(db as never, { add } as never, { add: vi.fn() } as never, { add: vi.fn() } as never, { add: vi.fn() } as never);

    await expect(processor.reconcile()).resolves.toEqual({ scheduled: 1, runningSteps: 0 });
    expect(add).toHaveBeenCalledWith('execute-follow-up', { followUpId: 'follow-up-1', revision: 2, stepId: 'step-1' }, expect.objectContaining({ jobId: 'follow-up-follow-up-1-r2-step-1' }));
  });

  it('não envia uma mensagem atrasada mais de 30 minutos e mantém a tarefa vencida aberta', async () => {
    const overdue = followUp();
    overdue.scheduledAt = new Date(Date.now() - (31 * 60_000));
    overdue.steps[0].scheduledAt = overdue.scheduledAt;
    const tx = {
      conversationFollowUpStep: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      notification: { create: vi.fn().mockResolvedValue({}) },
      conversationEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      conversationFollowUp: {
        findUnique: vi.fn().mockResolvedValueOnce(overdue).mockResolvedValue({
          id: overdue.id,
          status: overdue.status,
          organizationId: overdue.organizationId,
          conversationId: overdue.conversationId,
          taskId: overdue.taskId,
          responsibleId: overdue.responsibleId,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const emailQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new FollowUpProcessor(db as never, { add: vi.fn() } as never, { add: vi.fn() } as never, { add: vi.fn() } as never, emailQueue as never);

    await expect(processor.process({ data: { followUpId: overdue.id, revision: 1, stepId: 'step-1' } } as never)).resolves.toMatchObject({ failed: true });
    expect(db.conversationFollowUp.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(emailQueue.add).toHaveBeenCalledWith('send-follow-up-alert', expect.objectContaining({ followUpId: overdue.id }), expect.any(Object));
    expect(db).not.toHaveProperty('task.update');
  });
});
