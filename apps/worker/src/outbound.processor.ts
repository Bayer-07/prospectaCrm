import type { Job, Queue } from 'bullmq';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FollowUpAlertEmailJob } from '@prospecta/contracts';
import { normalizeWhatsappDocumentMetadata } from '@prospecta/contracts/whatsapp-document';
import { EvolutionClient } from './evolution-client.js';
import { signedMediaUrl, storedMediaBase64 } from './storage.js';

type FollowUpStepContext = {
  id: string;
  position: number;
  status: string;
  followUp: {
    id: string;
    revision: number;
    status: string;
    organizationId: string;
    conversationId: string;
    taskId: string;
    responsibleId: string;
  };
};

const OUTBOUND_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  providerMessageId: true,
  type: true,
  text: true,
  status: true,
  payload: true,
  media: { select: { key: true, filename: true, contentType: true } },
  instance: { select: { instanceKey: true } },
  conversation: {
    select: {
      remoteJid: true,
      assigneeId: true,
      firstResponseAt: true,
      contact: { select: { phone: true } },
      chatbotSession: { select: { status: true } },
    },
  },
  followUpStep: {
    select: {
      id: true,
      position: true,
      status: true,
      followUp: {
        select: {
          id: true,
          revision: true,
          status: true,
          organizationId: true,
          conversationId: true,
          taskId: true,
          responsibleId: true,
        },
      },
    },
  },
} satisfies Prisma.MessageSelect;

type OutboundMessage = Prisma.MessageGetPayload<{ select: typeof OUTBOUND_MESSAGE_SELECT }>;

export class OutboundProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly evolution: EvolutionClient,
    private readonly followUpQueue?: Queue,
    private readonly transactionalEmailQueue?: Queue,
  ) {}

  async process(job: Job<{ messageId: string }>) {
    const message = await this.loadMessage(job.data.messageId);
    if (message?.status !== 'QUEUED' || !message.conversation.contact.phone) return;
    if (await this.shouldSkip(message)) return;
    try {
      const payload = message.payload as Record<string, any>;
      const request = await this.deliveryRequest(message, payload);
      const result = await this.evolution.send(message.instance.instanceKey, request);
      return this.markSent(message, payload, result);
    } catch (error) {
      await this.markFailed(message, job, error);
      throw error;
    }
  }

  private loadMessage(messageId: string) {
    return this.db.message.findUnique({ where: { id: messageId }, select: OUTBOUND_MESSAGE_SELECT });
  }

  private async shouldSkip(message: OutboundMessage) {
    const followUpInactive = message.followUpStep
      && (message.followUpStep.status !== 'QUEUED' || message.followUpStep.followUp.status !== 'RUNNING');
    if (followUpInactive) {
      await this.db.message.update({ where: { id: message.id }, data: { status: 'SKIPPED' } });
      return true;
    }
    const payload = message.payload as Record<string, any>;
    const automatedStopped = payload.automated
      && (message.conversation.assigneeId || message.conversation.chatbotSession?.status === 'STOPPED');
    if (!automatedStopped) return false;
    await this.db.message.update({
      where: { id: message.id },
      data: { status: 'SKIPPED', payload: { ...payload, skipReason: 'Atendimento humano assumido ou chatbot interrompido' } },
    });
    return true;
  }

  private async deliveryRequest(message: OutboundMessage, payload: Record<string, any>) {
    const mediaKey = payload.mediaKey ? String(payload.mediaKey) : undefined;
    const mediaBase64 = message.type === 'audio' && mediaKey ? await storedMediaBase64(mediaKey) : undefined;
    const mediaUrl = mediaKey && !mediaBase64 ? await signedMediaUrl(mediaKey) : undefined;
    const documentAsset = message.type === 'document' && mediaKey
      ? message.media.find((media) => media.key === mediaKey)
        || await this.db.mediaAsset.findUnique({
          where: { key: mediaKey },
          select: { key: true, filename: true, contentType: true },
        })
      : null;
    if (message.type === 'document' && mediaKey && !documentAsset) {
      throw new Error('O anexo da mensagem não está mais disponível');
    }
    const documentMetadata = documentAsset
      ? normalizeWhatsappDocumentMetadata(documentAsset)
      : null;
    if (message.type === 'document' && documentAsset && !documentMetadata) {
      throw new Error('O anexo da mensagem possui um tipo de documento inválido');
    }
    const replyTarget = payload.replyToMessageId ? await this.db.message.findFirst({
      where: { id: String(payload.replyToMessageId), conversationId: message.conversationId },
      select: { providerMessageId: true, direction: true, type: true, text: true, payload: true },
    }) : null;
    const quoted = replyTarget && !replyTarget.providerMessageId.startsWith('local:') ? {
      key: {
        remoteJid: message.conversation.remoteJid,
        fromMe: replyTarget.direction === 'OUTBOUND',
        id: replyTarget.providerMessageId,
      },
      message: this.quotedMessageContent(replyTarget),
    } : undefined;
    return {
      number: message.conversation.remoteJid.includes('@lid') ? message.conversation.remoteJid : message.conversation.contact.phone!,
      type: message.type,
      text: message.text || undefined,
      mediaUrl,
      mediaBase64,
      fileName: documentMetadata?.fileName,
      mimeType: documentMetadata?.mimeType,
      quoted,
    };
  }

  private async markSent(message: OutboundMessage, payload: Record<string, any>, result: Record<string, any>) {
    const providerMessageId = String(result.key?.id || result.messageId || message.providerMessageId);
    const now = new Date();
    const nextStep = await this.nextFollowUpStep(message);
    const nextScheduledAt = nextStep ? new Date(now.getTime() + (nextStep.delaySeconds * 1_000)) : null;
    await this.db.$transaction([
      this.db.message.update({ where: { id: message.id }, data: { providerMessageId, status: 'SENT', sentAt: now, payload: { ...payload, provider: { key: result.key || null, message: result.message || null } } } }),
      this.db.conversation.update({ where: { id: message.conversationId }, data: { lastMessageAt: now, firstResponseAt: message.conversation.firstResponseAt || now } }),
      ...this.followUpSentOperations(message, nextStep, nextScheduledAt, now),
    ]);
    await this.enqueueNextFollowUpStep(message, nextStep, nextScheduledAt);
    return {
      organizationId: message.followUpStep?.followUp.organizationId,
      conversationId: message.conversationId,
      tasksUpdated: Boolean(message.followUpStep),
    };
  }

  private nextFollowUpStep(message: OutboundMessage) {
    if (!message.followUpStep) return null;
    return this.db.conversationFollowUpStep.findFirst({
      where: {
        followUpId: message.followUpStep.followUp.id,
        position: { gt: message.followUpStep.position },
        status: 'PENDING',
      },
      orderBy: { position: 'asc' },
    });
  }

  private followUpSentOperations(
    message: OutboundMessage,
    nextStep: Awaited<ReturnType<OutboundProcessor['nextFollowUpStep']>>,
    nextScheduledAt: Date | null,
    now: Date,
  ) {
    if (!message.followUpStep) return [];
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.db.conversationFollowUpStep.update({
        where: { id: message.followUpStep.id },
        data: { status: 'SENT', sentAt: now, failureReason: null },
      }),
    ];
    if (nextStep && nextScheduledAt) {
      operations.push(this.db.conversationFollowUpStep.update({ where: { id: nextStep.id }, data: { scheduledAt: nextScheduledAt } }));
      return operations;
    }
    const followUp = message.followUpStep.followUp;
    operations.push(
      this.db.conversationFollowUp.update({ where: { id: followUp.id }, data: { status: 'COMPLETED', completedAt: now } }),
      this.db.task.update({ where: { id: followUp.taskId }, data: { status: 'COMPLETED', completedAt: now } }),
      this.db.conversationEvent.create({ data: {
        organizationId: followUp.organizationId,
        conversationId: followUp.conversationId,
        type: 'follow_up_completed',
        text: 'O follow-up automático foi concluído',
        metadata: { followUpId: followUp.id },
      } }),
    );
    return operations;
  }

  private async enqueueNextFollowUpStep(
    message: OutboundMessage,
    nextStep: Awaited<ReturnType<OutboundProcessor['nextFollowUpStep']>>,
    nextScheduledAt: Date | null,
  ) {
    if (!message.followUpStep || !nextStep || !nextScheduledAt || !this.followUpQueue) return;
    const followUp = message.followUpStep.followUp;
    try {
      await this.followUpQueue.add('execute-follow-up', {
        followUpId: followUp.id,
        revision: followUp.revision,
        stepId: nextStep.id,
      }, {
        jobId: `follow-up-${followUp.id}-r${followUp.revision}-${nextStep.id}`,
        delay: Math.max(0, nextScheduledAt.getTime() - Date.now()),
        attempts: 40,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
    } catch (queueError) {
      console.error(`[follow-up:${followUp.id}] A próxima etapa será recuperada pelo reconciliador.`, queueError);
    }
  }

  private async markFailed(message: OutboundMessage, job: Job, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 1);
    await this.db.message.update({
      where: { id: message.id },
      data: {
        status: finalAttempt ? 'FAILED' : 'QUEUED',
        payload: { ...(message.payload as object), error: reason },
      },
    });
    if (finalAttempt && message.followUpStep) await this.failFollowUp(message.followUpStep, reason);
  }

  private async failFollowUp(
    step: FollowUpStepContext,
    reason: string,
  ) {
    const followUp = step.followUp;
    const changed = await this.db.conversationFollowUp.updateMany({
      where: { id: followUp.id, status: 'RUNNING' },
      data: { status: 'FAILED', failureReason: reason },
    });
    if (!changed.count) return;
    await this.db.$transaction([
      this.db.conversationFollowUpStep.update({ where: { id: step.id }, data: { status: 'FAILED', failureReason: reason } }),
      this.db.conversationFollowUpStep.updateMany({ where: { followUpId: followUp.id, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
      this.db.notification.create({ data: {
        organizationId: followUp.organizationId,
        userId: followUp.responsibleId,
        type: 'follow_up.failed',
        title: 'Falha no follow-up automático',
        body: reason.slice(0, 180),
        actionUrl: `/inbox/${followUp.conversationId}`,
      } }),
      this.db.conversationEvent.create({ data: {
        organizationId: followUp.organizationId,
        conversationId: followUp.conversationId,
        type: 'follow_up_failed',
        text: `O follow-up automático falhou: ${reason}`,
        metadata: { followUpId: followUp.id, reason },
      } }),
    ]);
    if (this.transactionalEmailQueue) {
      const data: FollowUpAlertEmailJob = { followUpId: followUp.id, reason: 'execution_failed' };
      await this.transactionalEmailQueue.add('send-follow-up-alert', data, {
        jobId: `follow-up-alert-${followUp.id}-failed`,
        attempts: 6,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 1_000,
      });
    }
  }

  private quotedMessageContent(message: { type: string; text: string | null; payload: unknown }) {
    const payload = (message.payload || {}) as Record<string, any>;
    const providerMessage = payload.provider?.message;
    if (providerMessage && typeof providerMessage === 'object') return providerMessage as Record<string, unknown>;
    const inboundMessage = payload.message;
    if (inboundMessage && typeof inboundMessage === 'object') return inboundMessage as Record<string, unknown>;
    const text = message.text || `[${message.type}]`;
    if (message.type === 'image') return { imageMessage: { caption: text } };
    if (message.type === 'video') return { videoMessage: { caption: text } };
    if (message.type === 'document') return { documentMessage: { fileName: text } };
    return { conversation: text };
  }
}
