import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { followUpInputSchema, type FollowUpInput } from '@prospecta/contracts';
import type { Queue } from 'bullmq';
import type { AuthContext } from '../auth/types.js';
import { authTeamIds } from '../auth/data-scope.js';
import { conversationVisibilityWhere } from '../integrations/conversation-visibility.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FOLLOW_UP_QUEUE } from '../queue/queue.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const ACTIVE_STATUSES = ['SCHEDULED', 'RUNNING'] as const;
const FOLLOW_UP_INCLUDE = {
  responsible: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  task: { select: { id: true, status: true, dueAt: true } },
  workflowVersion: { include: { workflow: { select: { id: true, name: true, status: true } } } },
  steps: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.ConversationFollowUpInclude;

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly db: PrismaService,
    private readonly realtime: RealtimeGateway,
    @Inject(FOLLOW_UP_QUEUE) private readonly queue: Queue,
  ) {}

  async active(auth: AuthContext, conversationId: string) {
    await this.assertConversation(auth, conversationId, false);
    return this.db.conversationFollowUp.findFirst({
      where: { organizationId: auth.organizationId, conversationId, status: { in: [...ACTIVE_STATUSES] } },
      include: FOLLOW_UP_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(auth: AuthContext, conversationId: string, followUpId: string) {
    await this.assertConversation(auth, conversationId, false);
    const followUp = await this.db.conversationFollowUp.findFirst({
      where: { id: followUpId, organizationId: auth.organizationId, conversationId },
      include: FOLLOW_UP_INCLUDE,
    });
    if (!followUp) throw new NotFoundException('Follow-up não encontrado');
    return followUp;
  }

  async create(auth: AuthContext, conversationId: string, raw: unknown) {
    this.assertPermission(auth, 'tasks', 'write');
    const input = this.parseInput(raw);
    if (input.mode === 'workflow') this.assertPermission(auth, 'workflows', 'write');
    this.assertFuture(input.scheduledAt);
    if (!auth.userId) throw new BadRequestException('O follow-up exige um usuário responsável');

    const conversation = await this.assertConversation(auth, conversationId, true);
    if (!conversation.assigneeId || !conversation.assignee) {
      throw new BadRequestException('Assuma a conversa antes de agendar o follow-up');
    }
    const assignee = conversation.assignee;
    const prepared = await this.prepareAction(auth, input);
    try {
      const followUp = await this.db.$transaction(async (tx) => {
        const task = await tx.task.create({ data: {
          organizationId: auth.organizationId,
          teamId: assignee.teamId,
          assigneeId: assignee.id,
          createdById: auth.userId!,
          contactId: conversation.contactId,
          title: `Follow-up · ${conversation.contact.name}`,
          description: prepared.description,
          dueAt: input.scheduledAt,
          priority: 'MEDIUM',
        } });
        const created = await tx.conversationFollowUp.create({
          data: {
            organizationId: auth.organizationId,
            conversationId,
            taskId: task.id,
            createdById: auth.userId!,
            responsibleId: assignee.id,
            workflowVersionId: prepared.workflowVersionId,
            mode: input.mode === 'workflow' ? 'WORKFLOW' : 'MESSAGE_SEQUENCE',
            scheduledAt: input.scheduledAt,
            ...(prepared.steps.length ? { steps: { create: prepared.steps } } : {}),
          },
          include: FOLLOW_UP_INCLUDE,
        });
        await tx.conversationEvent.create({ data: {
          organizationId: auth.organizationId,
          conversationId,
          actorId: auth.userId,
          type: 'follow_up_scheduled',
          text: `${auth.name} agendou um follow-up automático para ${formatSchedule(input.scheduledAt)}`,
          metadata: { followUpId: created.id, taskId: task.id, mode: input.mode },
        } });
        await tx.auditLog.create({ data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'follow_up.created',
          entityType: 'ConversationFollowUp',
          entityId: created.id,
          after: { conversationId, scheduledAt: input.scheduledAt, mode: input.mode },
        } });
        return created;
      });
      await this.enqueue(followUp.id, followUp.revision, input.scheduledAt, followUp.steps[0]?.id);
      this.notify(auth.organizationId, conversationId);
      return followUp;
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ConflictException('Esta conversa já possui um follow-up automático pendente');
      throw error;
    }
  }

  async update(auth: AuthContext, conversationId: string, followUpId: string, raw: unknown) {
    this.assertPermission(auth, 'tasks', 'write');
    const input = this.parseInput(raw);
    if (input.mode === 'workflow') this.assertPermission(auth, 'workflows', 'write');
    this.assertFuture(input.scheduledAt);
    await this.assertConversation(auth, conversationId, true);
    const existing = await this.db.conversationFollowUp.findFirst({
      where: { id: followUpId, organizationId: auth.organizationId, conversationId },
      include: { steps: true, task: true },
    });
    if (!existing) throw new NotFoundException('Follow-up não encontrado');
    if (existing.status !== 'SCHEDULED') throw new BadRequestException('Somente follow-ups ainda não iniciados podem ser editados');
    const prepared = await this.prepareAction(auth, input);
    const revision = existing.revision + 1;
    const updated = await this.db.$transaction(async (tx) => {
      await tx.conversationFollowUpStep.deleteMany({ where: { followUpId } });
      await tx.task.update({ where: { id: existing.taskId }, data: { dueAt: input.scheduledAt, description: prepared.description } });
      const record = await tx.conversationFollowUp.update({
        where: { id: followUpId },
        data: {
          mode: input.mode === 'workflow' ? 'WORKFLOW' : 'MESSAGE_SEQUENCE',
          scheduledAt: input.scheduledAt,
          workflowVersionId: prepared.workflowVersionId,
          revision,
          failureReason: null,
          ...(prepared.steps.length ? { steps: { create: prepared.steps } } : {}),
        },
        include: FOLLOW_UP_INCLUDE,
      });
      await tx.conversationEvent.create({ data: {
        organizationId: auth.organizationId,
        conversationId,
        actorId: auth.userId,
        type: 'follow_up_rescheduled',
        text: `${auth.name} reagendou o follow-up automático para ${formatSchedule(input.scheduledAt)}`,
        metadata: { followUpId, previousScheduledAt: existing.scheduledAt, scheduledAt: input.scheduledAt },
      } });
      return record;
    });
    await this.enqueue(updated.id, revision, input.scheduledAt, updated.steps[0]?.id);
    this.notify(auth.organizationId, conversationId);
    return updated;
  }

  async cancel(auth: AuthContext, conversationId: string, followUpId: string) {
    this.assertPermission(auth, 'tasks', 'write');
    await this.assertConversation(auth, conversationId, true);
    return this.cancelRecord(auth, followUpId, 'Cancelado manualmente', 'CANCELLED');
  }

  async rescheduleFromTask(auth: AuthContext, taskId: string, dueAt: Date) {
    this.assertFuture(dueAt);
    const existing = await this.db.conversationFollowUp.findFirst({
      where: { taskId, organizationId: auth.organizationId },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!existing) return null;
    if (existing.status !== 'SCHEDULED') throw new BadRequestException('Este follow-up já foi iniciado e não pode ser reagendado');
    const revision = existing.revision + 1;
    const updated = await this.db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { dueAt } });
      await tx.conversationFollowUp.update({ where: { id: existing.id }, data: { scheduledAt: dueAt, revision } });
      if (existing.steps[0]) await tx.conversationFollowUpStep.update({ where: { id: existing.steps[0].id }, data: { scheduledAt: dueAt } });
      await tx.conversationEvent.create({ data: {
        organizationId: auth.organizationId,
        conversationId: existing.conversationId,
        actorId: auth.userId,
        type: 'follow_up_rescheduled',
        text: `${auth.name} reagendou o follow-up automático para ${formatSchedule(dueAt)}`,
        metadata: { followUpId: existing.id, previousScheduledAt: existing.scheduledAt, scheduledAt: dueAt },
      } });
      return tx.task.findUnique({ where: { id: taskId } });
    });
    await this.enqueue(existing.id, revision, dueAt, existing.steps[0]?.id);
    this.notify(auth.organizationId, existing.conversationId);
    return updated;
  }

  async finishFromTask(auth: AuthContext, taskId: string, completed: boolean) {
    const existing = await this.db.conversationFollowUp.findFirst({
      where: { taskId, organizationId: auth.organizationId },
      select: { id: true, conversationId: true, status: true },
    });
    if (!existing) return null;
    if (ACTIVE_STATUSES.includes(existing.status as (typeof ACTIVE_STATUSES)[number])) {
      return this.cancelRecord(auth, existing.id, completed ? 'Tarefa concluída manualmente' : 'Tarefa cancelada manualmente', completed ? 'COMPLETED' : 'CANCELLED');
    }
    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: completed ? 'COMPLETED' : 'CANCELLED',
        completedAt: completed ? new Date() : null,
      },
    });
  }

  private async cancelRecord(auth: AuthContext, followUpId: string, reason: string, taskStatus: 'COMPLETED' | 'CANCELLED') {
    const existing = await this.db.conversationFollowUp.findFirst({
      where: { id: followUpId, organizationId: auth.organizationId },
      include: { task: true },
    });
    if (!existing) throw new NotFoundException('Follow-up não encontrado');
    if (!ACTIVE_STATUSES.includes(existing.status as (typeof ACTIVE_STATUSES)[number])) return existing.task;
    const now = new Date();
    const [task] = await this.db.$transaction([
      this.db.task.update({ where: { id: existing.taskId }, data: { status: taskStatus, completedAt: taskStatus === 'COMPLETED' ? now : null } }),
      this.db.conversationFollowUp.update({ where: { id: existing.id }, data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: reason } }),
      this.db.conversationFollowUpStep.updateMany({ where: { followUpId: existing.id, status: { in: ['PENDING', 'QUEUED'] } }, data: { status: 'CANCELLED' } }),
      this.db.message.updateMany({ where: { followUpStep: { followUpId: existing.id }, status: 'QUEUED' }, data: { status: 'SKIPPED' } }),
      this.db.conversationEvent.create({ data: {
        organizationId: auth.organizationId,
        conversationId: existing.conversationId,
        actorId: auth.userId,
        type: 'follow_up_cancelled',
        text: `${auth.name} cancelou o follow-up automático`,
        metadata: { followUpId: existing.id, reason },
      } }),
    ]);
    this.notify(auth.organizationId, existing.conversationId);
    return task;
  }

  private async prepareAction(auth: AuthContext, input: FollowUpInput) {
    if (input.mode === 'workflow') {
      const scope = permissionScope(auth, 'workflows', 'write');
      const workflow = await this.db.workflow.findFirst({
        where: {
          id: input.workflowId,
          organizationId: auth.organizationId,
          status: 'PUBLISHED',
          ...workflowAccessWhere(auth, scope),
        },
        include: { versions: true },
      });
      const version = workflow?.versions.find((item) => item.version === workflow.publishedVersion);
      if (!workflow || !version) throw new BadRequestException('Selecione uma automação publicada');
      return { workflowVersionId: version.id, description: `Iniciar automação: ${workflow.name}`, steps: [] };
    }
    const media = await this.mediaByKey(auth.organizationId, input.messages.map((message) => message.mediaKey).filter(Boolean) as string[]);
    const steps = input.messages.map((message, position) => {
      const asset = message.mediaKey ? media.get(message.mediaKey) : undefined;
      return {
        position,
        text: message.text?.trim() || null,
        messageType: followUpMessageType(asset),
        mediaKey: asset?.key || null,
        mediaName: asset?.filename || null,
        mediaType: asset?.contentType || null,
        delaySeconds: position === 0 ? 0 : message.delaySeconds,
        scheduledAt: position === 0 ? input.scheduledAt : null,
      };
    });
    const count = steps.length;
    return { workflowVersionId: null, description: `${count} mensagem${count === 1 ? '' : 's'} agendada${count === 1 ? '' : 's'}`, steps };
  }

  private async mediaByKey(organizationId: string, keys: string[]) {
    if (!keys.length) return new Map<string, { key: string; filename: string; contentType: string }>();
    const uniqueKeys = [...new Set(keys)];
    const assets = await this.db.mediaAsset.findMany({
      where: { key: { in: uniqueKeys } },
      select: { key: true, filename: true, contentType: true },
    });
    const allowed = assets.filter((asset) => asset.key.startsWith(`${organizationId}/`) && isFollowUpMedia(asset.contentType));
    if (allowed.length !== uniqueKeys.length) throw new BadRequestException('Um dos anexos do follow-up é inválido');
    return new Map(allowed.map((asset) => [asset.key, asset]));
  }

  private async assertConversation(auth: AuthContext, conversationId: string, write: boolean) {
    if (write) this.assertPermission(auth, 'conversations', 'write');
    const conversation = await this.db.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId: auth.organizationId,
        ...conversationVisibilityWhere(auth, auth.roleKey === 'admin'),
      },
      include: {
        assignee: { select: { id: true, name: true, teamId: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  private parseInput(raw: unknown) {
    const parsed = followUpInputSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message || 'Follow-up inválido');
    return parsed.data;
  }

  private assertFuture(value: Date) {
    if (Number.isNaN(value.getTime()) || value.getTime() <= Date.now()) throw new BadRequestException('Escolha uma data e horário futuros');
  }

  private assertPermission(auth: AuthContext, resource: string, action: string) {
    const allowed = auth.permissions.some((permission) =>
      (permission.resource === '*' || permission.resource === resource)
      && (permission.action === '*' || permission.action === action));
    if (!allowed) throw new ForbiddenException('Você não possui permissão para esta ação');
  }

  private async enqueue(followUpId: string, revision: number, dueAt: Date, stepId?: string) {
    const delay = Math.max(0, dueAt.getTime() - Date.now());
    try {
      await this.queue.add('execute-follow-up', { followUpId, revision, stepId }, {
        jobId: `follow-up-${followUpId}-r${revision}-${stepId || 'workflow'}`,
        delay,
        attempts: 40,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
    } catch (error) {
      console.error(`[follow-up:${followUpId}] A fila está indisponível; o reconciliador recuperará o agendamento.`, error);
    }
  }

  private notify(organizationId: string, conversationId: string) {
    this.realtime.notifyOrganization(organizationId, 'inbox.updated', { conversationId });
    this.realtime.notifyOrganization(organizationId, 'tasks.updated', { conversationId });
  }
}

function permissionScope(auth: AuthContext, resource: string, action: string) {
  return auth.permissions.find((permission) =>
    (permission.resource === '*' || permission.resource === resource)
    && (permission.action === '*' || permission.action === action))?.scope || 'OWN';
}

function workflowAccessWhere(auth: AuthContext, scope: 'ALL' | 'TEAM' | 'OWN'): Prisma.WorkflowWhereInput {
  if (scope === 'ALL') return {};
  if (scope === 'TEAM') {
    const teamIds = authTeamIds(auth);
    return teamIds.length ? { createdBy: { teamMemberships: { some: { teamId: { in: teamIds } } } } } : { id: '__none__' };
  }
  return auth.userId ? { createdById: auth.userId } : { id: '__none__' };
}

function formatSchedule(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function isFollowUpMedia(contentType: string) {
  return contentType.startsWith('image/') || [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ].includes(contentType);
}

function followUpMessageType(asset?: { contentType: string }) {
  if (!asset) return 'text';
  return asset.contentType.startsWith('image/') ? 'image' : 'document';
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
