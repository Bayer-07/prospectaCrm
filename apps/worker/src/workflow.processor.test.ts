import { describe, expect, it, vi } from 'vitest';
import { WorkflowProcessor, workflowWaitDelayMs, workflowWhatsappBlockReason } from './workflow.processor.js';

describe('tempo de espera das automações', () => {
  it('agenda os novos nós em segundos', () => {
    expect(workflowWaitDelayMs({ seconds: 1 })).toBe(1_000);
    expect(workflowWaitDelayMs({ seconds: 15 })).toBe(15_000);
  });

  it('mantém compatibilidade com versões antigas salvas em minutos', () => {
    expect(workflowWaitDelayMs({ minutes: 1 })).toBe(60_000);
  });
});

describe('permissão de envio das automações', () => {
  const conversationContext = {
    source: 'conversation',
    conversationId: 'conversation-1',
    instanceId: 'instance-1',
    initiatedByUserId: 'user-1',
  };

  it('permite o envio iniciado manualmente no chat quando o consentimento ainda não foi informado', () => {
    expect(workflowWhatsappBlockReason({ consentStatus: 'UNKNOWN', suppressions: [] }, conversationContext)).toBeUndefined();
  });

  it('mantém o consentimento obrigatório fora do atendimento manual', () => {
    expect(workflowWhatsappBlockReason({ consentStatus: 'UNKNOWN', suppressions: [] }, {})).toBe('Envio bloqueado: consentimento ausente');
    expect(workflowWhatsappBlockReason({ consentStatus: 'GRANTED', suppressions: [] }, {})).toBeUndefined();
  });

  it('bloqueia consentimento revogado ou supressão mesmo quando o operador inicia pelo chat', () => {
    const reason = 'Envio bloqueado: contato sem permissão para receber mensagens no WhatsApp';
    expect(workflowWhatsappBlockReason({ consentStatus: 'REVOKED', suppressions: [] }, conversationContext)).toBe(reason);
    expect(workflowWhatsappBlockReason({ consentStatus: 'GRANTED', suppressions: [{ channel: 'WHATSAPP' }] }, conversationContext)).toBe(reason);
  });
});

describe('execução contextual de automações', () => {
  it('executa as ações somente no contato inscrito pela conversa', async () => {
    const enrollment = {
      id: 'enrollment-1',
      status: 'ACTIVE',
      currentNodeId: 'update-1',
      contactId: 'contact-from-chat',
      context: {
        source: 'conversation',
        conversationId: 'conversation-1',
        instanceId: 'instance-1',
        initiatedByUserId: 'user-1',
      },
      contact: { id: 'contact-from-chat', customFields: { origem: 'WhatsApp' } },
      workflow: { id: 'workflow-1', name: 'Qualificação', status: 'PUBLISHED', organizationId: 'organization-1' },
      version: {
        graph: {
          nodes: [
            { id: 'update-1', type: 'update_record', data: { field: 'qualificado', value: true } },
            { id: 'end-1', type: 'end' },
          ],
          edges: [{ source: 'update-1', target: 'end-1' }],
        },
      },
    };
    const db = {
      workflowEnrollment: {
        findUnique: vi.fn().mockResolvedValue(enrollment),
        update: vi.fn().mockResolvedValue(enrollment),
      },
      workflowStepExecution: {
        create: vi.fn().mockResolvedValue({ id: 'step-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contact: { update: vi.fn().mockResolvedValue({ id: 'contact-from-chat' }) },
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const processor = new WorkflowProcessor(db as never, queue as never, { add: vi.fn() } as never);

    await processor.process({ data: { enrollmentId: 'enrollment-1' } } as never);

    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-from-chat' },
      data: { customFields: { origem: 'WhatsApp', qualificado: true } },
    });
    expect(db.workflowStepExecution.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      enrollmentId: 'enrollment-1',
      input: {
        contactId: 'contact-from-chat',
        context: expect.objectContaining({ conversationId: 'conversation-1' }),
      },
    }) });
    expect(queue.add).toHaveBeenCalledWith('execute-workflow', { enrollmentId: 'enrollment-1' }, expect.any(Object));
  });
});

describe('envio contextual de WhatsApp', () => {
  it('enfileira a mensagem configurada quando o operador inicia pela conversa', async () => {
    const enrollment = {
      id: 'enrollment-message',
      status: 'ACTIVE',
      currentNodeId: 'send-1',
      contactId: 'contact-from-chat',
      context: {
        source: 'conversation',
        conversationId: 'conversation-1',
        instanceId: 'instance-1',
        initiatedByUserId: 'user-1',
      },
      contact: {
        id: 'contact-from-chat',
        name: 'Bayer',
        phone: '+5545999225389',
        consentStatus: 'UNKNOWN',
        suppressions: [],
      },
      workflow: { id: 'workflow-1', name: 'Bot', status: 'PUBLISHED', organizationId: 'organization-1' },
      version: {
        graph: {
          nodes: [
            { id: 'send-1', type: 'send_whatsapp', data: { text: 'Olá {{nome}}, tudo bem?' } },
            { id: 'end-1', type: 'end' },
          ],
          edges: [{ source: 'send-1', target: 'end-1' }],
        },
      },
    };
    const db = {
      workflowEnrollment: {
        findUnique: vi.fn().mockResolvedValue(enrollment),
        update: vi.fn().mockResolvedValue(enrollment),
      },
      workflowStepExecution: {
        create: vi.fn().mockResolvedValue({ id: 'step-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      whatsappInstance: { findFirst: vi.fn().mockResolvedValue({ id: 'instance-1' }) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', contactId: 'contact-from-chat', instanceId: 'instance-1' }),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      conversationEvent: { create: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Gabriel Bayer', messageSignatureEnabled: true }) },
      message: { create: vi.fn().mockResolvedValue({ id: 'message-1' }) },
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const processor = new WorkflowProcessor(db as never, queue as never, outboundQueue as never);

    await processor.process({ data: { enrollmentId: 'enrollment-message' } } as never);

    expect(db.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      conversationId: 'conversation-1',
      text: '*Gabriel Bayer:*\nOlá Bayer, tudo bem?',
      status: 'QUEUED',
      payload: expect.objectContaining({
        authorId: 'user-1',
        signature: { userId: 'user-1', name: 'Gabriel Bayer' },
      }),
    }) });
    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send-message',
      { messageId: 'message-1' },
      expect.objectContaining({ attempts: 5 }),
    );
  });
});

describe('logs da automação na conversa', () => {
  it('registra e publica a finalização sem criar mensagem para o cliente', async () => {
    const enrollment = {
      id: 'enrollment-completed',
      workflowId: 'workflow-1',
      status: 'ACTIVE',
      currentNodeId: 'end-1',
      contactId: 'contact-from-chat',
      context: {
        source: 'conversation',
        conversationId: 'conversation-1',
        instanceId: 'instance-1',
        initiatedByUserId: 'user-1',
      },
      contact: { id: 'contact-from-chat', consentStatus: 'UNKNOWN', suppressions: [] },
      workflow: { id: 'workflow-1', name: 'Bot', status: 'PUBLISHED', organizationId: 'organization-1' },
      version: { graph: { nodes: [{ id: 'end-1', type: 'end' }], edges: [] } },
    };
    const db = {
      workflowEnrollment: {
        findUnique: vi.fn().mockResolvedValue(enrollment),
        update: vi.fn().mockResolvedValue({ ...enrollment, status: 'COMPLETED' }),
      },
      workflowStepExecution: {
        create: vi.fn().mockResolvedValue({ id: 'step-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1' }) },
      conversationEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
      message: { create: vi.fn() },
    };
    const processor = new WorkflowProcessor(db as never, { add: vi.fn() } as never, { add: vi.fn() } as never);

    const event = await processor.process({ data: { enrollmentId: 'enrollment-completed' } } as never);

    expect(db.conversationEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      conversationId: 'conversation-1',
      actorId: 'user-1',
      type: 'workflow_completed',
      text: 'Automação “Bot” foi finalizada',
    }) });
    expect(db.message.create).not.toHaveBeenCalled();
    expect(event).toEqual({
      organizationId: 'organization-1',
      event: 'inbox.updated',
      payload: { conversationId: 'conversation-1' },
    });
  });
});

describe('atribuição de fila pela automação', () => {
  const enrollment = (context: object) => ({
    id: 'enrollment-queue', workflowId: 'workflow-1', status: 'ACTIVE', currentNodeId: 'queue-1', contactId: 'contact-1', context,
    contact: { id: 'contact-1' },
    workflow: { id: 'workflow-1', name: 'Roteamento', status: 'PUBLISHED', organizationId: 'organization-1' },
    version: { graph: { nodes: [{ id: 'queue-1', type: 'assign_queue', data: { teamId: 'team-2' } }, { id: 'end-1', type: 'end' }], edges: [{ source: 'queue-1', target: 'end-1' }] } },
  });

  it('atribui a fila, remove atendente incompatível e continua o fluxo', async () => {
    const item = enrollment({ conversationId: 'conversation-1' });
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const db = {
      workflowEnrollment: { findUnique: vi.fn().mockResolvedValue(item), update: vi.fn().mockResolvedValue(item) },
      workflowStepExecution: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-2', name: 'Gerência' }) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', teamId: 'team-1', assigneeId: 'user-1', status: 'OPEN', team: { name: 'Geral' } }),
        update: conversationUpdate,
      },
      userTeam: { findUnique: vi.fn().mockResolvedValue(null) },
      conversationEvent: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new WorkflowProcessor(db as never, queue as never, { add: vi.fn() } as never);
    await expect(processor.process({ data: { enrollmentId: item.id } } as never)).resolves.toEqual({ organizationId: 'organization-1', event: 'inbox.updated', payload: { conversationId: 'conversation-1' } });
    expect(conversationUpdate).toHaveBeenCalledWith({ where: { id: 'conversation-1' }, data: { teamId: 'team-2', assigneeId: null, status: 'WAITING' } });
    expect(queue.add).toHaveBeenCalledWith('execute-workflow', { enrollmentId: item.id }, expect.any(Object));
  });

  it('falha explicitamente quando não existe ticket no contexto', async () => {
    const item = enrollment({ source: 'manual' });
    const failed = { ...item, status: 'FAILED', stopReason: 'Atribuir fila exige uma conversa no contexto' };
    const db = {
      workflowEnrollment: { findUnique: vi.fn().mockResolvedValue(item), update: vi.fn().mockResolvedValue(failed) },
      workflowStepExecution: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const processor = new WorkflowProcessor(db as never, { add: vi.fn() } as never, { add: vi.fn() } as never);
    await expect(processor.process({ data: { enrollmentId: item.id } } as never)).rejects.toThrow('Atribuir fila exige uma conversa no contexto');
  });
});
