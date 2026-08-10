import { describe, expect, it, vi } from 'vitest';
import { WorkflowsService } from './workflows.service.js';

const service = new WorkflowsService({} as never, {} as never);

describe('validação do grafo de automação', () => {
  it('aceita um DAG conectado com gatilho e fim', () => {
    expect(() => service.validateShape({ nodes: [{ id: 'start', type: 'trigger' }, { id: 'end', type: 'end' }], edges: [{ source: 'start', target: 'end' }] }, true)).not.toThrow();
  });

  it('rejeita ciclos e blocos desconectados', () => {
    expect(() => service.validateShape({ nodes: [{ id: 'start', type: 'trigger' }, { id: 'wait', type: 'wait', data: { minutes: 1 } }, { id: 'end', type: 'end' }], edges: [{ source: 'start', target: 'wait' }, { source: 'wait', target: 'start' }] }, true)).toThrow(/Ciclos/);
    expect(() => service.validateShape({ nodes: [{ id: 'start', type: 'trigger' }, { id: 'end', type: 'end' }, { id: 'orphan', type: 'notify' }], edges: [{ source: 'start', target: 'end' }] }, true)).toThrow(/conectados/);
  });

  it('exige uma mensagem antes de publicar um bloco de WhatsApp', () => {
    expect(() => service.validateShape({
      nodes: [{ id: 'start', type: 'trigger' }, { id: 'message', type: 'send_whatsapp', data: { text: '  ' } }, { id: 'end', type: 'end' }],
      edges: [{ source: 'start', target: 'message' }, { source: 'message', target: 'end' }],
    }, true)).toThrow(/Configure a mensagem/);
  });

  it('valida o tempo de espera configurado em segundos', () => {
    const graph = (seconds: number) => ({
      nodes: [{ id: 'start', type: 'trigger' }, { id: 'wait', type: 'wait', data: { seconds } }, { id: 'end', type: 'end' }],
      edges: [{ source: 'start', target: 'wait' }, { source: 'wait', target: 'end' }],
    });
    expect(() => service.validateShape(graph(1), true)).not.toThrow();
    expect(() => service.validateShape(graph(0), true)).toThrow(/tempo de espera válido/);
  });
});

describe('inscrição manual em automações', () => {
  it('cria uma nova execução toda vez que a automação é iniciada pelo chat', async () => {
    const db = {
      workflow: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'workflow-1',
          status: 'PUBLISHED',
          publishedVersion: 2,
          versions: [{ id: 'version-2', version: 2 }],
          enrollments: [],
        }),
      },
      contact: { findMany: vi.fn().mockResolvedValue([{ id: 'contact-allowed' }]) },
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', contactId: 'contact-allowed', instanceId: 'instance-1' }) },
      conversationEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
      workflowEnrollment: {
        findMany: vi.fn(),
        create: vi.fn()
          .mockResolvedValueOnce({ id: 'enrollment-1', contactId: 'contact-allowed' })
          .mockResolvedValueOnce({ id: 'enrollment-2', contactId: 'contact-allowed' }),
        createMany: vi.fn(),
      },
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const workflowService = new WorkflowsService(db as never, queue as never);

    const auth = {
      type: 'session' as const,
      organizationId: 'organization-1',
      userId: 'user-1',
      name: 'Operador',
      permissions: [{ resource: '*', action: '*', scope: 'ALL' as const }],
    };
    const first = await workflowService.enroll(auth, 'workflow-1', ['contact-allowed', 'contact-from-another-organization'], { conversationId: 'conversation-1' });
    const second = await workflowService.enroll(auth, 'workflow-1', ['contact-allowed', 'contact-from-another-organization'], { conversationId: 'conversation-1' });

    expect(db.contact.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['contact-allowed', 'contact-from-another-organization'] },
        organizationId: 'organization-1',
        archivedAt: null,
      },
      select: { id: true },
    });
    expect(db.workflowEnrollment.create).toHaveBeenCalledWith({
      data: {
        workflowId: 'workflow-1',
        versionId: 'version-2',
        contactId: 'contact-allowed',
        currentNodeId: null,
        context: {
          source: 'conversation',
          conversationId: 'conversation-1',
          instanceId: 'instance-1',
          initiatedByUserId: 'user-1',
        },
      },
    });
    expect(db.workflowEnrollment.create).toHaveBeenCalledTimes(2);
    expect(db.workflowEnrollment.findMany).not.toHaveBeenCalled();
    expect(db.workflowEnrollment.createMany).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith('execute-workflow', { enrollmentId: 'enrollment-1' }, expect.any(Object));
    expect(queue.add).toHaveBeenCalledWith('execute-workflow', { enrollmentId: 'enrollment-2' }, expect.any(Object));
    expect(db.conversationEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      conversationId: 'conversation-1',
      actorId: 'user-1',
      type: 'workflow_started',
      metadata: expect.objectContaining({ contactId: 'contact-allowed' }),
    }) });
    expect(first).toEqual({ requested: 2, enrolled: 1, skipped: 1 });
    expect(second).toEqual({ requested: 2, enrolled: 1, skipped: 1 });
  });
});

describe('exclusão de automação', () => {
  it('arquiva a automação e interrompe inscrições ativas sem apagar o histórico', async () => {
    const updateEnrollments = vi.fn().mockResolvedValue({ count: 3 });
    const updateWorkflow = vi.fn().mockResolvedValue({ id: 'workflow-1', status: 'ARCHIVED' });
    const audit = vi.fn().mockResolvedValue({});
    const db = {
      workflow: {
        findFirst: vi.fn().mockResolvedValue({ id: 'workflow-1', status: 'PUBLISHED', publishedVersion: 1, versions: [] }),
        update: updateWorkflow,
      },
      workflowEnrollment: { updateMany: updateEnrollments },
      auditLog: { create: audit },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const workflowService = new WorkflowsService(db as never, {} as never);
    const auth = {
      type: 'session' as const,
      organizationId: 'organization-1',
      userId: 'user-1',
      name: 'Gabriel',
      permissions: [{ resource: '*', action: '*', scope: 'ALL' as const }],
    };

    await expect(workflowService.remove(auth, 'workflow-1')).resolves.toEqual({ id: 'workflow-1', status: 'ARCHIVED' });
    expect(updateEnrollments).toHaveBeenCalledWith({
      where: { workflowId: 'workflow-1', status: { in: ['ACTIVE', 'WAITING'] } },
      data: { status: 'STOPPED', stopReason: 'Automação excluída', completedAt: expect.any(Date) },
    });
    expect(updateWorkflow).toHaveBeenCalledWith({ where: { id: 'workflow-1' }, data: { status: 'ARCHIVED' } });
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'workflow.deleted', entityType: 'Workflow', entityId: 'workflow-1',
    }) });
  });
});
