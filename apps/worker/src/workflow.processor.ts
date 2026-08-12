import type { Job, Queue } from 'bullmq';
import type { Prisma, PrismaClient } from '@prisma/client';
import { contactTemplateVariables, renderTemplateVariables } from '@prospecta/contracts';

type Node = { id: string; type: string; data?: Record<string, any> };
type Edge = { source: string; target: string; sourceHandle?: string };
type Graph = { nodes: Node[]; edges: Edge[] };
type WorkflowContext = { source?: string; conversationId?: string; instanceId?: string; initiatedByUserId?: string };
type WorkflowWhatsappContact = { consentStatus?: string; suppressions?: Array<{ channel?: string }> };
type RealtimeEvent = { organizationId: string; event: 'inbox.updated'; payload: { conversationId: string } };
type WorkflowTerminalStatus = 'COMPLETED' | 'STOPPED' | 'FAILED';

const normalizedConditionValue = (value: unknown) => {
  if (typeof value === 'string') return value.toLocaleLowerCase('pt-BR');
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).toLocaleLowerCase('pt-BR');
  }
  if (value && typeof value === 'object') return (JSON.stringify(value) ?? '').toLocaleLowerCase('pt-BR');
  return '';
};

const conditionMatches = (actual: unknown, expected: unknown, operator: unknown) => {
  const normalizedActual = normalizedConditionValue(actual);
  const normalizedExpected = normalizedConditionValue(expected);
  switch (operator) {
    case 'not_equals': return normalizedActual !== normalizedExpected;
    case 'contains': return normalizedActual.includes(normalizedExpected);
    case 'is_empty': return !normalizedActual.trim();
    default: return normalizedActual === normalizedExpected;
  }
};

const opportunityStatus = (stage: { isWon: boolean; isLost: boolean }) => {
  if (stage.isWon) return 'WON' as const;
  if (stage.isLost) return 'LOST' as const;
  return 'OPEN' as const;
};

const workflowStopText = (name: string, status: WorkflowTerminalStatus, reason?: string) => {
  if (status === 'COMPLETED') return `Automação “${name}” foi finalizada`;
  const suffix = reason ? `: ${reason}` : '';
  if (status === 'FAILED') return `Automação “${name}” foi interrompida por erro${suffix}`;
  return `Automação “${name}” foi interrompida${suffix}`;
};

const workflowStopEventType = (status: WorkflowTerminalStatus) => {
  if (status === 'COMPLETED') return 'workflow_completed';
  if (status === 'FAILED') return 'workflow_failed';
  return 'workflow_stopped';
};

export function workflowWhatsappBlockReason(contact: WorkflowWhatsappContact, context: WorkflowContext) {
  const whatsappSuppressed = contact.suppressions?.some((item) => item.channel === 'WHATSAPP');
  if (contact.consentStatus === 'REVOKED' || whatsappSuppressed) {
    return 'Envio bloqueado: contato sem permissão para receber mensagens no WhatsApp';
  }

  const startedManuallyFromConversation = context.source === 'conversation'
    && Boolean(context.conversationId)
    && Boolean(context.instanceId)
    && Boolean(context.initiatedByUserId);
  if (!startedManuallyFromConversation && contact.consentStatus !== 'GRANTED') {
    return 'Envio bloqueado: consentimento ausente';
  }

  return undefined;
}

export function workflowWaitDelayMs(data: Record<string, any>) {
  if (data.seconds !== undefined) return Math.max(1, Number(data.seconds) || 1) * 1_000;
  return Math.max(1, Number(data.minutes) || 1) * 60_000;
}

export class WorkflowProcessor {
  constructor(private readonly db: PrismaClient, private readonly queue: Queue, private readonly outboundQueue: Queue) {}

  async process(job: Job<{ enrollmentId: string }>) {
    const enrollment = await this.db.workflowEnrollment.findUnique({
      where: { id: job.data.enrollmentId },
      include: {
        contact: { include: {
          suppressions: { where: { channel: 'WHATSAPP' } },
          companies: {
            where: { isPrimary: true },
            include: { company: { select: { name: true } } },
            take: 1,
          },
        } },
        workflow: true,
        version: true,
      },
    });
    if (!enrollment || !['ACTIVE', 'WAITING'].includes(enrollment.status) || enrollment.workflow.status !== 'PUBLISHED') return;
    const graph = enrollment.version.graph as unknown as Graph;
    const current = enrollment.currentNodeId ? graph.nodes.find((node) => node.id === enrollment.currentNodeId) : graph.nodes.find((node) => node.type === 'trigger');
    if (!current) return this.stop(enrollment.id, 'FAILED', 'Bloco atual não encontrado');
    const context = this.workflowContext(enrollment.context);
    await this.db.workflowStepExecution.create({ data: {
      enrollmentId: enrollment.id,
      nodeId: current.id,
      status: 'running',
      input: { contactId: enrollment.contactId, context } as Prisma.InputJsonValue,
    } });
    try {
      const nextHandle = await this.executeNode(enrollment, current);
      if (current.type === 'end') return this.stop(enrollment.id, 'COMPLETED');
      if (current.type === 'wait') return;
      const nextEdge = graph.edges.find((edge) => edge.source === current.id && (!nextHandle || edge.sourceHandle === nextHandle || !edge.sourceHandle));
      if (!nextEdge) return this.stop(enrollment.id, 'COMPLETED', 'Fluxo finalizado');
      await this.db.workflowEnrollment.update({ where: { id: enrollment.id }, data: { currentNodeId: nextEdge.target, status: 'ACTIVE' } });
      await this.queue.add('execute-workflow', { enrollmentId: enrollment.id }, { jobId: `workflow-${enrollment.id}-${nextEdge.target}-${Date.now()}`, removeOnComplete: 1000 });
      await this.completeStep(enrollment.id, current.id, { nextNodeId: nextEdge.target });
    } catch (error) {
      await this.completeStep(enrollment.id, current.id, {}, error instanceof Error ? error.message : String(error));
      await this.stop(enrollment.id, 'FAILED', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async executeNode(enrollment: any, node: Node): Promise<string | undefined> {
    const data = node.data || {};
    const context = this.workflowContext(enrollment.context);
    if (node.type === 'trigger' || node.type === 'end') return;
    if (node.type === 'condition') return this.executeCondition(enrollment, data);
    if (node.type === 'wait') await this.executeWait(enrollment, node, data);
    else if (node.type === 'send_whatsapp') await this.executeWhatsapp(enrollment, node, data, context);
    else if (node.type === 'add_tag' || node.type === 'remove_tag') await this.executeTagChange(enrollment, node.type, data);
    else if (node.type === 'assign') await this.executeAssignment(enrollment, data);
    else if (node.type === 'update_record') await this.executeRecordUpdate(enrollment, data);
    else if (node.type === 'move_stage') await this.executeMoveStage(enrollment, data);
    else if (node.type === 'create_task') await this.executeCreateTask(enrollment, data, context);
    else if (node.type === 'notify') await this.executeNotification(enrollment, data, context);
    return undefined;
  }

  private executeCondition(enrollment: any, data: Record<string, any>) {
    const actual = this.getValue(enrollment.contact, String(data.field || ''));
    return conditionMatches(actual, data.value ?? '', data.operator) ? 'true' : 'false';
  }

  private async executeWait(enrollment: any, node: Node, data: Record<string, any>) {
    const delay = workflowWaitDelayMs(data);
    const graph = enrollment.version.graph as Graph;
    const next = graph.edges.find((edge) => edge.source === node.id)?.target;
    if (!next) {
      await this.stop(enrollment.id, 'COMPLETED');
      return;
    }
    const wakeAt = new Date(Date.now() + delay);
    await this.db.workflowEnrollment.update({ where: { id: enrollment.id }, data: { status: 'WAITING', currentNodeId: next, wakeAt } });
    await this.queue.add('execute-workflow', { enrollmentId: enrollment.id }, { delay, jobId: `workflow-${enrollment.id}-wake-${Date.now()}`, removeOnComplete: 1000 });
    await this.completeStep(enrollment.id, node.id, { wakeAt, nextNodeId: next });
  }

  private async executeWhatsapp(enrollment: any, node: Node, data: Record<string, any>, context: WorkflowContext) {
    const blockReason = workflowWhatsappBlockReason(enrollment.contact, context);
    if (blockReason) throw new Error(blockReason);
    const instanceId = String(data.instanceId || context.instanceId || '');
    const instance = await this.db.whatsappInstance.findFirst({ where: { id: instanceId, organizationId: enrollment.workflow.organizationId } });
    if (!instance || !enrollment.contact.phone) throw new Error('Instância ou telefone não disponível');
    const remoteJid = `${enrollment.contact.phone.replace(/\D/g, '')}@s.whatsapp.net`;
    const conversation = await this.workflowConversation(enrollment, context, instanceId, remoteJid);
    const initiatingUser = await this.workflowInitiatingUser(enrollment, context);
    const rawText = renderTemplateVariables(String(data.text || ''), contactTemplateVariables(enrollment.contact));
    const signature = initiatingUser?.messageSignatureEnabled
      ? { userId: initiatingUser.id, name: initiatingUser.name }
      : null;
    const text = signature ? `*${signature.name.trim()}:*\n${rawText}` : rawText;
    const message = await this.db.message.create({ data: {
      instanceId,
      conversationId: conversation.id,
      providerMessageId: `workflow:${enrollment.id}:${node.id}`,
      direction: 'OUTBOUND',
      type: 'text',
      text,
      status: 'QUEUED',
      payload: { enrollmentId: enrollment.id, nodeId: node.id, authorId: initiatingUser?.id || null, signature },
    } });
    await this.outboundQueue.add('send-message', { messageId: message.id }, { jobId: `message-${message.id}`, attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
  }

  private async workflowConversation(enrollment: any, context: WorkflowContext, instanceId: string, remoteJid: string) {
    const contextualConversation = context.conversationId
      ? await this.db.conversation.findFirst({ where: {
        id: context.conversationId,
        organizationId: enrollment.workflow.organizationId,
        instanceId,
        contactId: enrollment.contactId,
      } })
      : null;
    const remoteConversation = contextualConversation
      ? null
      : await this.db.conversation.findUnique({ where: { instanceId_remoteJid: { instanceId, remoteJid } } });
    if (remoteConversation && remoteConversation.contactId !== enrollment.contactId) {
      throw new Error('O número está vinculado a outro contato nesta instância');
    }
    const existing = contextualConversation || remoteConversation;
    if (existing) return existing;
    const conversation = await this.db.conversation.create({ data: {
      organizationId: enrollment.workflow.organizationId,
      instanceId,
      contactId: enrollment.contactId,
      remoteJid,
    } });
    await this.db.conversationEvent.create({ data: {
      organizationId: enrollment.workflow.organizationId,
      conversationId: conversation.id,
      type: 'workflow_started',
      text: `Automação “${enrollment.workflow.name}” iniciou a conversa`,
      metadata: { workflowId: enrollment.workflow.id, enrollmentId: enrollment.id },
    } });
    return conversation;
  }

  private workflowInitiatingUser(enrollment: any, context: WorkflowContext) {
    if (!context.initiatedByUserId) return null;
    return this.db.user.findFirst({
      where: { id: context.initiatedByUserId, organizationId: enrollment.workflow.organizationId, status: 'ACTIVE' },
      select: { id: true, name: true, messageSignatureEnabled: true },
    });
  }

  private async executeTagChange(enrollment: any, operation: 'add_tag' | 'remove_tag', data: Record<string, any>) {
    const tagId = String(data.tagId || '');
    const tag = await this.db.tag.findFirst({ where: { id: tagId, organizationId: enrollment.workflow.organizationId }, select: { id: true } });
    if (!tag) throw new Error('Tag configurada não encontrada');
    if (operation === 'add_tag') {
      await this.db.contactTag.upsert({ where: { contactId_tagId: { contactId: enrollment.contactId, tagId } }, update: {}, create: { contactId: enrollment.contactId, tagId } });
      return;
    }
    await this.db.contactTag.deleteMany({ where: { contactId: enrollment.contactId, tagId } });
  }

  private async executeAssignment(enrollment: any, data: Record<string, any>) {
    const ownerId = data.userId ? String(data.userId) : undefined;
    const teamId = data.teamId ? String(data.teamId) : undefined;
    if (ownerId) {
      const owner = await this.db.user.findFirst({ where: { id: ownerId, organizationId: enrollment.workflow.organizationId }, select: { id: true } });
      if (!owner) throw new Error('Usuário configurado não encontrado');
    }
    if (teamId) {
      const team = await this.db.team.findFirst({ where: { id: teamId, organizationId: enrollment.workflow.organizationId }, select: { id: true } });
      if (!team) throw new Error('Equipe configurada não encontrada');
    }
    await this.db.contact.update({ where: { id: enrollment.contactId }, data: { ownerId, teamId } });
  }

  private async executeRecordUpdate(enrollment: any, data: Record<string, any>) {
    const field = String(data.field || '').trim();
    if (!field) throw new Error('Campo do contato não configurado');
    if (['name', 'email', 'jobTitle', 'source'].includes(field)) {
      await this.db.contact.update({ where: { id: enrollment.contactId }, data: { [field]: data.value } });
      return;
    }
    const customFields = { ...(enrollment.contact.customFields as object), [field]: data.value };
    await this.db.contact.update({ where: { id: enrollment.contactId }, data: { customFields } });
  }

  private async executeMoveStage(enrollment: any, data: Record<string, any>) {
    const stageId = String(data.stageId || '');
    const stage = await this.db.pipelineStage.findFirst({ where: { id: stageId, pipeline: { organizationId: enrollment.workflow.organizationId } } });
    if (!stage) throw new Error('Etapa configurada não encontrada');
    const links = await this.db.opportunityContact.findMany({
      where: { contactId: enrollment.contactId, opportunity: { pipelineId: stage.pipelineId, archivedAt: null } },
      select: { opportunityId: true },
    });
    if (!links.length) throw new Error('O contato não possui oportunidade neste funil');
    await this.db.opportunity.updateMany({
      where: { id: { in: links.map((link) => link.opportunityId) }, organizationId: enrollment.workflow.organizationId },
      data: {
        stageId: stage.id,
        probability: stage.probability,
        status: opportunityStatus(stage),
        wonAt: stage.isWon ? new Date() : null,
        lostAt: stage.isLost ? new Date() : null,
      },
    });
  }

  private async executeCreateTask(enrollment: any, data: Record<string, any>, context: WorkflowContext) {
    const initiatingUser = context.initiatedByUserId
      ? await this.db.user.findFirst({ where: { id: context.initiatedByUserId, organizationId: enrollment.workflow.organizationId } })
      : null;
    const creator = initiatingUser || await this.db.user.findFirst({ where: { organizationId: enrollment.workflow.organizationId, role: { key: 'admin' } } });
    if (!creator) throw new Error('Usuário responsável pela tarefa não encontrado');
    const assigneeId = String(data.assigneeId || enrollment.contact.ownerId || creator.id);
    const assignee = await this.db.user.findFirst({ where: { id: assigneeId, organizationId: enrollment.workflow.organizationId }, select: { id: true } });
    if (!assignee) throw new Error('Responsável configurado para a tarefa não encontrado');
    await this.db.task.create({ data: {
      organizationId: enrollment.workflow.organizationId,
      createdById: creator.id,
      assigneeId,
      teamId: enrollment.contact.teamId,
      contactId: enrollment.contactId,
      title: String(data.title || 'Acompanhar contato'),
      dueAt: new Date(Date.now() + Number(data.dueInHours || 24) * 3_600_000),
    } });
  }

  private async executeNotification(enrollment: any, data: Record<string, any>, context: WorkflowContext) {
    const userId = String(data.userId || enrollment.contact.ownerId || context.initiatedByUserId || '');
    if (!userId) return;
    const recipient = await this.db.user.findFirst({ where: { id: userId, organizationId: enrollment.workflow.organizationId }, select: { id: true } });
    if (!recipient) throw new Error('Destinatário da notificação não encontrado');
    await this.db.notification.create({ data: {
      organizationId: enrollment.workflow.organizationId,
      userId,
      type: 'workflow.notification',
      title: String(data.title || `Automação: ${enrollment.workflow.name}`),
      body: String(data.body || ''),
      actionUrl: `/contatos/${enrollment.contactId}`,
    } });
  }

  private async stop(id: string, status: WorkflowTerminalStatus, reason?: string): Promise<RealtimeEvent | undefined> {
    const enrollment = await this.db.workflowEnrollment.update({
      where: { id },
      data: { status, stopReason: reason, completedAt: new Date(), wakeAt: null },
      include: { workflow: { select: { name: true, organizationId: true } } },
    });
    const context = this.workflowContext(enrollment.context);
    if (!context.conversationId) return;
    const conversation = await this.db.conversation.findFirst({
      where: {
        id: context.conversationId,
        organizationId: enrollment.workflow.organizationId,
        contactId: enrollment.contactId,
      },
      select: { id: true },
    });
    if (!conversation) return;

    const text = workflowStopText(enrollment.workflow.name, status, reason);
    await this.db.conversationEvent.create({ data: {
      organizationId: enrollment.workflow.organizationId,
      conversationId: conversation.id,
      actorId: context.initiatedByUserId,
      type: workflowStopEventType(status),
      text,
      metadata: { workflowId: enrollment.workflowId, enrollmentId: enrollment.id, status, ...(reason ? { reason } : {}) },
    } });
    return { organizationId: enrollment.workflow.organizationId, event: 'inbox.updated', payload: { conversationId: conversation.id } };
  }

  private completeStep(enrollmentId: string, nodeId: string, output: object, error?: string) {
    return this.db.workflowStepExecution.updateMany({ where: { enrollmentId, nodeId, status: 'running' }, data: { status: error ? 'failed' : 'completed', output: output as Prisma.InputJsonValue, error, completedAt: new Date() } });
  }

  private workflowContext(value: unknown): WorkflowContext {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as WorkflowContext : {};
  }

  private getValue(value: Record<string, any>, path: string) { return path.split('.').reduce((current, key) => current?.[key], value); }
}
