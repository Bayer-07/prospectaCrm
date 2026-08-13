import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { FollowUpsService } from './follow-ups.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel Bayer',
  permissions: [
    { resource: 'conversations', action: 'write', scope: 'ALL' },
    { resource: 'tasks', action: 'write', scope: 'ALL' },
    { resource: 'workflows', action: 'write', scope: 'ALL' },
  ],
};

function setup(options: { assignee?: boolean; transactionError?: unknown; queueError?: unknown } = {}) {
  const hasAssignee = options.assignee ?? true;
  const scheduledAt = new Date(Date.now() + 60_000);
  const conversation = {
    id: 'conversation-1',
    contactId: 'contact-1',
    contact: { id: 'contact-1', name: 'Maria' },
    assigneeId: hasAssignee ? 'user-1' : null,
    assignee: hasAssignee ? { id: 'user-1', name: 'Gabriel', teamId: 'team-1' } : null,
  };
  const followUp = {
    id: 'follow-up-1',
    conversationId: conversation.id,
    revision: 1,
    status: 'SCHEDULED',
    scheduledAt,
    steps: [{ id: 'step-1', position: 0 }],
  };
  const tx = {
    task: { create: vi.fn().mockResolvedValue({ id: 'task-1' }) },
    conversationFollowUp: { create: vi.fn().mockResolvedValue(followUp) },
    conversationEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    conversation: { findFirst: vi.fn().mockResolvedValue(conversation) },
    mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
    workflow: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
      if (options.transactionError) throw options.transactionError;
      return callback(tx);
    }),
  };
  const queue = { add: options.queueError ? vi.fn().mockRejectedValue(options.queueError) : vi.fn().mockResolvedValue({}) };
  const realtime = { notifyOrganization: vi.fn() };
  return { service: new FollowUpsService(db as never, realtime as never, queue as never), db, tx, queue, realtime, scheduledAt };
}

describe('follow-up automático', () => {
  it('cria tarefa e follow-up na mesma transação e agenda um job idempotente', async () => {
    const context = setup();
    const result = await context.service.create(auth, 'conversation-1', {
      mode: 'message_sequence',
      scheduledAt: context.scheduledAt.toISOString(),
      messages: [{ text: 'Olá {{nome}}', delaySeconds: 0 }],
    });

    expect(result.id).toBe('follow-up-1');
    expect(context.tx.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      title: 'Follow-up · Maria',
      assigneeId: 'user-1',
      dueAt: context.scheduledAt,
    }) });
    expect(context.tx.conversationFollowUp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ conversationId: 'conversation-1', mode: 'MESSAGE_SEQUENCE' }),
    }));
    expect(context.queue.add).toHaveBeenCalledWith('execute-follow-up', expect.objectContaining({ followUpId: 'follow-up-1', revision: 1 }), expect.objectContaining({
      jobId: 'follow-up-follow-up-1-r1-step-1',
      attempts: 40,
    }));
    expect(context.realtime.notifyOrganization).toHaveBeenCalledWith('organization-1', 'tasks.updated', { conversationId: 'conversation-1' });
  });

  it('exige que a conversa tenha sido assumida antes do agendamento', async () => {
    const context = setup({ assignee: false });
    await expect(context.service.create(auth, 'conversation-1', {
      mode: 'message_sequence',
      scheduledAt: context.scheduledAt.toISOString(),
      messages: [{ text: 'Retorno', delaySeconds: 0 }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(context.queue.add).not.toHaveBeenCalled();
  });

  it('traduz a restrição única do banco ao haver dois agendamentos simultâneos', async () => {
    const context = setup({ transactionError: { code: 'P2002' } });
    await expect(context.service.create(auth, 'conversation-1', {
      mode: 'message_sequence',
      scheduledAt: context.scheduledAt.toISOString(),
      messages: [{ text: 'Retorno', delaySeconds: 0 }],
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('exige permissão de escrita em tarefas além da permissão da conversa', async () => {
    const context = setup();
    const restricted = { ...auth, permissions: auth.permissions.filter((permission) => permission.resource !== 'tasks') };
    await expect(context.service.create(restricted, 'conversation-1', {
      mode: 'message_sequence',
      scheduledAt: context.scheduledAt.toISOString(),
      messages: [{ text: 'Retorno', delaySeconds: 0 }],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.db.conversation.findFirst).not.toHaveBeenCalled();
  });

  it('fixa a versão publicada da automação no momento do agendamento', async () => {
    const context = setup();
    context.db.workflow.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Retomar negociação',
      status: 'PUBLISHED',
      publishedVersion: 3,
      versions: [{ id: 'version-2', version: 2 }, { id: 'version-3', version: 3 }],
    });
    await context.service.create(auth, 'conversation-1', {
      mode: 'workflow',
      scheduledAt: context.scheduledAt.toISOString(),
      workflowId: '11111111-1111-4111-8111-111111111111',
    });
    expect(context.tx.conversationFollowUp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mode: 'WORKFLOW', workflowVersionId: 'version-3' }),
    }));
  });

  it('mantém o agendamento persistido quando a fila fica temporariamente indisponível', async () => {
    const context = setup({ queueError: new Error('Redis indisponível') });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(context.service.create(auth, 'conversation-1', {
      mode: 'message_sequence',
      scheduledAt: context.scheduledAt.toISOString(),
      messages: [{ text: 'Retorno', delaySeconds: 0 }],
    })).resolves.toMatchObject({ id: 'follow-up-1' });
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('reconciliador'), expect.any(Error));
    consoleError.mockRestore();
  });

  it('permite concluir manualmente a tarefa que permaneceu aberta após uma falha terminal', async () => {
    const task = { id: 'task-1', status: 'COMPLETED' };
    const db = {
      conversationFollowUp: {
        findFirst: vi.fn().mockResolvedValue({ id: 'follow-up-1', conversationId: 'conversation-1', status: 'FAILED' }),
      },
      task: { update: vi.fn().mockResolvedValue(task) },
    };
    const service = new FollowUpsService(db as never, { notifyOrganization: vi.fn() } as never, { add: vi.fn() } as never);

    await expect(service.finishFromTask(auth, 'task-1', true)).resolves.toEqual(task);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
  });
});
