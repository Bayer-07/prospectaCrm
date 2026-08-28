import type { Prisma, PrismaClient } from '@prisma/client';
import { contactTemplateVariables, renderTemplateVariables, type FollowUpAlertEmailJob } from '@prospecta/contracts';
import { projectTaskActivity } from '@prospecta/database';
import type { Job, Queue } from 'bullmq';

export type FollowUpJob = { followUpId: string; revision: number; stepId?: string };

const ACTIVE_STATUSES = ['SCHEDULED', 'RUNNING'] as const;
const MAX_LATE_MS = 30 * 60_000;

export class FollowUpProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly followUpQueue: Queue,
    private readonly outboundQueue: Queue,
    private readonly automationQueue: Queue,
    private readonly transactionalEmailQueue: Queue,
  ) {}

  async process(job: Job<FollowUpJob>) {
    const followUp = await this.load(job.data.followUpId);
    if (!followUp || followUp.revision !== job.data.revision || !ACTIVE_STATUSES.includes(followUp.status as (typeof ACTIVE_STATUSES)[number])) {
      return { skipped: true, reason: 'follow-up inativo ou substituído' };
    }
    const dueAt = job.data.stepId
      ? followUp.steps.find((step) => step.id === job.data.stepId)?.scheduledAt
      : followUp.scheduledAt;
    if (!dueAt) return { skipped: true, reason: 'etapa ainda não agendada' };
    if (Date.now() - dueAt.getTime() > MAX_LATE_MS) {
      await this.fail(followUp.id, job.data.stepId, 'O horário venceu durante uma indisponibilidade superior a 30 minutos');
      return { failed: true, reason: 'janela de tolerância expirada' };
    }

    const blocked = followUp.conversation.contact.consentStatus === 'REVOKED'
      || followUp.conversation.contact.suppressions.some((item) => item.channel === 'WHATSAPP');
    if (blocked) {
      await this.fail(followUp.id, job.data.stepId, 'Envio bloqueado por descadastro ou supressão do WhatsApp');
      return { failed: true, reason: 'contato bloqueado' };
    }
    if (followUp.conversation.instance.status !== 'CONNECTED') {
      throw new Error('A conexão do WhatsApp está desconectada; nova tentativa em um minuto');
    }

    const prepared = await this.prepareConversation(followUp);
    if (!prepared) return { skipped: true, reason: 'responsável indisponível' };
    await this.startIfScheduled(followUp.id, followUp.conversationId, followUp.organizationId);
    if (followUp.mode === 'WORKFLOW') return this.startWorkflow(followUp.id);
    if (!job.data.stepId) return { skipped: true, reason: 'etapa ausente' };
    return this.queueMessage(followUp.id, job.data.stepId);
  }

  async reconcile(reference = new Date()) {
    const horizon = new Date(reference.getTime() + 24 * 60 * 60_000);
    const scheduled = await this.db.conversationFollowUp.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: horizon } },
      select: {
        id: true,
        revision: true,
        scheduledAt: true,
        mode: true,
        steps: { where: { position: 0 }, select: { id: true }, take: 1 },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 1_000,
    });
    const runningSteps = await this.db.conversationFollowUpStep.findMany({
      where: { status: 'PENDING', scheduledAt: { not: null, lte: horizon }, followUp: { status: 'RUNNING' } },
      select: { id: true, scheduledAt: true, followUp: { select: { id: true, revision: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 1_000,
    });
    await Promise.all([
      ...scheduled.map((item) => this.enqueue(item.id, item.revision, item.scheduledAt, item.steps[0]?.id)),
      ...runningSteps.map((step) => this.enqueue(step.followUp.id, step.followUp.revision, step.scheduledAt!, step.id)),
    ]);
    return { scheduled: scheduled.length, runningSteps: runningSteps.length };
  }

  private load(followUpId: string) {
    return this.db.conversationFollowUp.findUnique({
      where: { id: followUpId },
      include: {
        responsible: { select: { id: true, name: true, email: true, teamId: true, status: true, messageSignatureEnabled: true } },
        workflowVersion: { include: { workflow: true } },
        steps: { orderBy: { position: 'asc' } },
        conversation: {
          include: {
            instance: { select: { id: true, status: true } },
            assignee: { select: { id: true, name: true, email: true, teamId: true, status: true, messageSignatureEnabled: true } },
            contact: {
              include: {
                suppressions: { where: { channel: 'WHATSAPP' } },
                companies: { where: { isPrimary: true }, include: { company: { select: { name: true } } }, take: 1 },
              },
            },
          },
        },
      },
    });
  }

  private async prepareConversation(followUp: NonNullable<Awaited<ReturnType<FollowUpProcessor['load']>>>) {
    const current = followUp.conversation.assignee?.status === 'ACTIVE' ? followUp.conversation.assignee : null;
    const fallback = followUp.responsible.status === 'ACTIVE' ? followUp.responsible : null;
    const responsible = current || fallback;
    if (!responsible) {
      await this.fail(followUp.id, undefined, 'O responsável pelo follow-up não está mais ativo');
      return null;
    }
    const needsConversationUpdate = followUp.conversation.status !== 'OPEN'
      || followUp.conversation.assigneeId !== responsible.id;
    const needsResponsibilityUpdate = followUp.responsibleId !== responsible.id;
    if (!needsConversationUpdate && !needsResponsibilityUpdate) return responsible;

    await this.db.$transaction(async (tx) => {
      if (needsConversationUpdate) {
        await tx.conversation.update({
          where: { id: followUp.conversationId },
          data: { status: 'OPEN', assigneeId: responsible.id, closedAt: null },
        });
        await tx.conversationEvent.create({ data: {
          organizationId: followUp.organizationId,
          conversationId: followUp.conversationId,
          actorId: responsible.id,
          type: 'follow_up_reopened',
          text: `O follow-up automático reabriu e atribuiu o atendimento a ${responsible.name}`,
          metadata: { followUpId: followUp.id, responsibleId: responsible.id },
        } });
      }
      if (needsResponsibilityUpdate) {
        await tx.conversationFollowUp.update({ where: { id: followUp.id }, data: { responsibleId: responsible.id } });
      }
      await tx.task.update({
        where: { id: followUp.taskId },
        data: { assigneeId: responsible.id, teamId: responsible.teamId },
      });
    });
    return responsible;
  }

  private async startIfScheduled(followUpId: string, conversationId: string, organizationId: string) {
    const claimed = await this.db.conversationFollowUp.updateMany({
      where: { id: followUpId, status: 'SCHEDULED' },
      data: { status: 'RUNNING', startedAt: new Date(), failureReason: null },
    });
    if (!claimed.count) return;
    await this.db.conversationEvent.create({ data: {
      organizationId,
      conversationId,
      type: 'follow_up_started',
      text: 'O follow-up automático foi iniciado',
      metadata: { followUpId },
    } });
  }

  private async queueMessage(followUpId: string, stepId: string) {
    const followUp = await this.load(followUpId);
    const step = followUp?.steps.find((item) => item.id === stepId);
    if (!followUp || followUp.status !== 'RUNNING' || !step || !['PENDING', 'QUEUED'].includes(step.status)) {
      return { skipped: true, reason: 'etapa inativa' };
    }
    if (step.messageId) {
      await this.enqueueOutbound(step.messageId);
      return { queued: true, messageId: step.messageId };
    }
    const responsible = followUp.conversation.assignee?.status === 'ACTIVE'
      ? followUp.conversation.assignee
      : followUp.responsible;
    const rawText = step.text || '';
    const rendered = rawText
      ? renderTemplateVariables(rawText, contactTemplateVariables(followUp.conversation.contact))
      : '';
    const signature = responsible.messageSignatureEnabled && rendered
      ? { userId: responsible.id, name: responsible.name }
      : null;
    const text = signature ? `*${signature.name.trim()}:*\n${rendered}` : rendered || null;
    const media = step.mediaKey
      ? await this.db.mediaAsset.findUnique({ where: { key: step.mediaKey }, select: { id: true } })
      : null;
    if (step.mediaKey && !media) {
      await this.fail(followUpId, stepId, 'O anexo agendado não está mais disponível');
      return { failed: true, reason: 'anexo ausente' };
    }

    const message = await this.db.$transaction(async (tx) => {
      const claimed = await tx.conversationFollowUpStep.updateMany({
        where: { id: stepId, status: 'PENDING', messageId: null, followUp: { status: 'RUNNING' } },
        data: { status: 'QUEUED' },
      });
      if (!claimed.count) return null;
      const created = await tx.message.create({ data: {
        instanceId: followUp.conversation.instanceId,
        conversationId: followUp.conversationId,
        providerMessageId: `followup:${followUp.id}:${step.id}`,
        direction: 'OUTBOUND',
        type: step.messageType,
        text,
        status: 'QUEUED',
        payload: {
          source: 'follow_up',
          followUpId: followUp.id,
          followUpStepId: step.id,
          mediaKey: step.mediaKey,
          authorId: responsible.id,
          signature,
        },
        ...(media ? { media: { connect: { id: media.id } } } : {}),
      } });
      await tx.conversationFollowUpStep.update({ where: { id: step.id }, data: { messageId: created.id } });
      return created;
    });
    const resolved = message || await this.db.message.findFirst({ where: { followUpStep: { id: stepId } } });
    if (!resolved) return { skipped: true, reason: 'etapa já processada' };
    await this.enqueueOutbound(resolved.id);
    return { queued: true, messageId: resolved.id };
  }

  private async startWorkflow(followUpId: string) {
    let followUp = await this.load(followUpId);
    if (!followUp || followUp.status !== 'RUNNING' || followUp.mode !== 'WORKFLOW') return { skipped: true };
    if (!followUp.workflowVersion || followUp.workflowVersion.workflow.status !== 'PUBLISHED') {
      await this.fail(followUpId, undefined, 'A automação selecionada foi pausada ou arquivada');
      return { failed: true };
    }
    let enrollmentId = followUp.workflowEnrollmentId;
    if (!enrollmentId) {
      enrollmentId = await this.db.$transaction(async (tx) => {
        const enrollment = await tx.workflowEnrollment.upsert({
          where: { id: followUp!.id },
          create: {
            id: followUp!.id,
            workflowId: followUp!.workflowVersion!.workflowId,
            versionId: followUp!.workflowVersion!.id,
            contactId: followUp!.conversation.contactId,
            context: {
              source: 'conversation',
              conversationId: followUp!.conversationId,
              instanceId: followUp!.conversation.instanceId,
              initiatedByUserId: followUp!.responsibleId,
              followUpId: followUp!.id,
            } as Prisma.InputJsonObject,
          },
          update: {},
        });
        await tx.conversationFollowUp.update({ where: { id: followUp!.id }, data: { workflowEnrollmentId: enrollment.id } });
        return enrollment.id;
      });
    }
    await this.automationQueue.add('execute-workflow', { enrollmentId }, {
      jobId: `workflow-${enrollmentId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: 1_000,
    });
    followUp = await this.load(followUpId);
    if (!followUp || followUp.status !== 'RUNNING') return { skipped: true };
    const now = new Date();
    await this.db.$transaction([
      this.db.conversationFollowUp.update({ where: { id: followUpId }, data: { status: 'COMPLETED', completedAt: now } }),
      this.db.task.update({ where: { id: followUp.taskId }, data: { status: 'COMPLETED', completedAt: now } }),
      this.db.conversationEvent.create({ data: {
        organizationId: followUp.organizationId,
        conversationId: followUp.conversationId,
        type: 'follow_up_completed',
        text: `O follow-up iniciou a automação “${followUp.workflowVersion!.workflow.name}”`,
        metadata: { followUpId, enrollmentId, workflowVersionId: followUp.workflowVersionId },
      } }),
    ]);
    await projectTaskActivity(this.db, followUp.taskId, 'AUTOMATION');
    return { completed: true, enrollmentId, organizationId: followUp.organizationId, conversationId: followUp.conversationId };
  }

  private async fail(followUpId: string, stepId: string | undefined, reason: string) {
    const followUp = await this.db.conversationFollowUp.findUnique({
      where: { id: followUpId },
      select: { id: true, status: true, organizationId: true, conversationId: true, taskId: true, responsibleId: true },
    });
    if (!followUp || !ACTIVE_STATUSES.includes(followUp.status as (typeof ACTIVE_STATUSES)[number])) return;
    const changed = await this.db.conversationFollowUp.updateMany({
      where: { id: followUpId, status: { in: [...ACTIVE_STATUSES] } },
      data: { status: 'FAILED', failureReason: reason },
    });
    if (!changed.count) return;
    await this.db.$transaction(async (tx) => {
      if (stepId) await tx.conversationFollowUpStep.updateMany({ where: { id: stepId, status: { in: ['PENDING', 'QUEUED'] } }, data: { status: 'FAILED', failureReason: reason } });
      await tx.conversationFollowUpStep.updateMany({ where: { followUpId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await tx.notification.create({ data: {
        organizationId: followUp.organizationId,
        userId: followUp.responsibleId,
        type: 'follow_up.failed',
        title: 'Falha no follow-up automático',
        body: reason.slice(0, 180),
        actionUrl: `/inbox/${followUp.conversationId}`,
      } });
      await tx.conversationEvent.create({ data: {
        organizationId: followUp.organizationId,
        conversationId: followUp.conversationId,
        type: 'follow_up_failed',
        text: `O follow-up automático falhou: ${reason}`,
        metadata: { followUpId, reason },
      } });
    });
    const email: FollowUpAlertEmailJob = { followUpId, reason: 'execution_failed' };
    await this.transactionalEmailQueue.add('send-follow-up-alert', email, {
      jobId: `follow-up-alert-${followUpId}-failed`,
      attempts: 6,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 1_000,
    });
  }

  private enqueueOutbound(messageId: string) {
    return this.outboundQueue.add('send-message', { messageId }, {
      jobId: `message-${messageId}`,
      // Follow-ups tolerate a disconnected Evolution instance for 30 minutes.
      // The message remains QUEUED between attempts and the outbound processor
      // marks the sequence as failed only after the final retry.
      attempts: 31,
      backoff: { type: 'fixed', delay: 60_000 },
      removeOnComplete: 1_000,
    });
  }

  private enqueue(followUpId: string, revision: number, dueAt: Date, stepId?: string) {
    return this.followUpQueue.add('execute-follow-up', { followUpId, revision, stepId }, {
      jobId: `follow-up-${followUpId}-r${revision}-${stepId || 'workflow'}`,
      delay: Math.max(0, dueAt.getTime() - Date.now()),
      attempts: 40,
      backoff: { type: 'fixed', delay: 60_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }
}
