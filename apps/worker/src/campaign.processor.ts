import type { Job, Queue } from 'bullmq';
import type { Prisma, PrismaClient } from '@prisma/client';
import { contactTemplateVariables, renderTemplateVariables } from '@prospecta/contracts';
import { normalizeWhatsappDocumentMetadata } from '@prospecta/contracts/whatsapp-document';
import { projectEmailRecipientActivity, projectWhatsappMessageActivity } from '@prospecta/database';
import { randomInt, randomUUID } from 'node:crypto';
import { EvolutionClient } from './evolution-client.js';
import { CampaignEmailError, SmtpCampaignClient } from './smtp-campaign-client.js';
import { normalizeMailgunMessageId } from './mailgun-client.js';
import { signedMediaUrl, storedMediaBase64 } from './storage.js';

const randomBetween = (min: number, max: number) => randomInt(min, max + 1);
const sendingWindowFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

type CampaignMessage = { id?: string; type: string; content: string; mediaKey?: string | null };
type MailgunEventData = Record<string, unknown> & {
  id?: string;
  event?: string;
  severity?: string;
  timestamp?: number;
  recipient?: string;
  'user-variables'?: Record<string, unknown>;
  message?: { headers?: { 'message-id'?: string } };
};

export function campaignMessageSequence(recipientMessages: Prisma.JsonValue, campaignBubbles: CampaignMessage[]): CampaignMessage[] {
  const customMessages = Array.isArray(recipientMessages)
    ? recipientMessages
      .filter((message): message is Prisma.JsonObject => Boolean(message && typeof message === 'object' && !Array.isArray(message)))
      .map((message) => ({
        type: typeof message.type === 'string' ? message.type : 'text',
        content: typeof message.content === 'string' ? message.content : '',
        mediaKey: typeof message.mediaKey === 'string' ? message.mediaKey : null,
      }))
      .filter((message) => Boolean(message.content))
    : [];
  return customMessages.length ? customMessages : campaignBubbles;
}

export function campaignContactVariables(contact: Record<string, any>) {
  return {
    ...contact,
    ...contactTemplateVariables(contact),
  };
}

export class CampaignProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: Queue,
    private readonly evolution: EvolutionClient,
    private readonly campaignEmail = new SmtpCampaignClient(),
  ) {}

  async process(job: Job<{ campaignId?: string; recipientId?: string; position?: number; eventData?: MailgunEventData }>) {
    if (job.name === 'dispatch-campaign') return this.dispatch(job.data.campaignId!);
    if (job.name === 'send-campaign-bubble') return this.sendBubble(job.data.recipientId!, job.data.position || 0, job);
    if (job.name === 'send-campaign-email') return this.sendEmail(job.data.recipientId!, job);
    if (job.name === 'mailgun-event') return this.processMailgunEvent(job.data.eventData!);
  }

  async reconcileActiveCampaigns() {
    const completed = await this.db.campaign.updateMany({
      where: {
        status: 'RUNNING',
        recipients: { none: { status: { in: ['PENDING', 'QUEUED'] } } },
      },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    const waitingCampaigns = await this.db.campaign.findMany({
      where: {
        status: 'RUNNING',
        recipients: {
          some: { status: 'PENDING' },
          none: { status: 'QUEUED' },
        },
      },
      select: { id: true },
    });
    if (!waitingCampaigns.length) return { completed: completed.count, requeued: 0 };

    const queuedJobs = await this.queue.getJobs(
      ['wait', 'waiting', 'active', 'delayed', 'prioritized', 'paused', 'waiting-children'],
      0,
      -1,
      false,
    );
    const scheduledCampaignIds = new Set(
      queuedJobs
        .filter((job) => job.name === 'dispatch-campaign' && typeof job.data?.campaignId === 'string')
        .map((job) => job.data.campaignId as string),
    );
    const missing = waitingCampaigns.filter((campaign) => !scheduledCampaignIds.has(campaign.id));
    const recoveryBucket = Math.floor(Date.now() / 300_000);
    await Promise.all(missing.map((campaign) => this.queue.add(
      'dispatch-campaign',
      { campaignId: campaign.id },
      { jobId: `campaign-${campaign.id}-recovery-${recoveryBucket}`, removeOnComplete: 1000 },
    )));
    return { completed: completed.count, requeued: missing.length };
  }

  private async dispatch(campaignId: string) {
    const campaign = await this.db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        instance: {
          select: {
            status: true,
            warmupProfile: { select: { sentToday: true, currentDailyCap: true } },
          },
        },
      },
    });
    if (!campaign || !['RUNNING', 'SCHEDULED'].includes(campaign.status)) return;
    if (campaign.channel === 'WHATSAPP' && campaign.instance?.status !== 'CONNECTED') {
      await this.db.campaign.updateMany({
        where: { id: campaignId, status: { in: ['RUNNING', 'SCHEDULED'] } },
        data: { status: 'PAUSED' },
      });
      return;
    }
    if (campaign.channel === 'WHATSAPP' && !campaign.instance?.warmupProfile) return;
    if (campaign.status === 'SCHEDULED') await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING', startedAt: new Date() } });
    if (!this.withinWindow(campaign.sendingWindowStart, campaign.sendingWindowEnd, campaign.sendingDays as number[])) {
      await this.queue.add('dispatch-campaign', { campaignId }, { delay: 15 * 60_000, jobId: `campaign-${campaignId}-window-${Math.floor(Date.now() / 900_000)}` });
      return;
    }
    const profile = campaign.instance?.warmupProfile;
    if (campaign.channel === 'WHATSAPP' && profile && profile.sentToday >= profile.currentDailyCap) {
      await this.queue.add('dispatch-campaign', { campaignId }, { delay: 60 * 60_000, jobId: `campaign-${campaignId}-cap-${Math.floor(Date.now() / 3_600_000)}` });
      return;
    }
    const recipient = await this.db.campaignRecipient.findFirst({
      where: { campaignId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, lastBubblePosition: true },
    });
    if (!recipient) {
      const active = await this.db.campaignRecipient.count({ where: { campaignId, status: 'QUEUED' } });
      if (!active) await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      return;
    }
    await this.db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'QUEUED', scheduledAt: new Date() } });
    const jobName = campaign.channel === 'EMAIL' ? 'send-campaign-email' : 'send-campaign-bubble';
    const position = campaign.channel === 'EMAIL' ? 0 : Math.max(0, recipient.lastBubblePosition + 1);
    await this.queue.add(jobName, { recipientId: recipient.id, position }, {
      jobId: campaign.channel === 'EMAIL' ? `recipient-${recipient.id}-email` : `recipient-${recipient.id}-bubble-${position}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  private async sendEmail(recipientId: string, job: Job) {
    const recipient = await this.db.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: {
        contact: {
          include: {
            suppressions: { where: { channel: 'EMAIL' }, select: { channel: true } },
            companies: { where: { isPrimary: true }, include: { company: { select: { name: true } } }, take: 1 },
          },
        },
        campaign: { include: { bubbles: { orderBy: { position: 'asc' } } } },
      },
    });
    if (recipient?.campaign.channel !== 'EMAIL' || recipient.campaign.status !== 'RUNNING' || recipient.status !== 'QUEUED') return;

    const { campaign, contact } = recipient;
    if (contact.campaignsBlocked || !contact.email || contact.suppressions.length) {
      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: 'SKIPPED',
          exclusionReason: contact.campaignsBlocked
            ? 'Campanhas bloqueadas para este contato'
            : 'Contato sem e-mail ou descadastrado',
        },
      });
      return this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    }

    const template = campaign.bubbles[0]?.content;
    if (!template || !campaign.emailSubject) {
      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'FAILED', failedAt: new Date(), exclusionReason: 'Campanha sem assunto ou conteúdo de e-mail' },
      });
      return this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    }

    const variables = campaignContactVariables(contact);
    const subject = this.render(campaign.emailSubject, variables);
    const renderedHtml = this.render(template, variables);
    const html = this.withUnsubscribeFooter(renderedHtml);
    const text = this.withUnsubscribeText(this.htmlToText(renderedHtml));

    try {
      const result = await this.campaignEmail.send({
        to: contact.email,
        subject,
        html,
        text,
        campaignId: campaign.id,
        recipientId,
        contactId: contact.id,
      });
      const completion = await this.db.$transaction(async (tx) => {
        const updated = await tx.campaignRecipient.updateMany({
          where: { id: recipientId, status: 'QUEUED' },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            providerMessageId: result.id,
            lastBubblePosition: 0,
            exclusionReason: result.sentCopyError || null,
          },
        });
        if (!updated.count) return null;
        return tx.campaign.update({
          where: { id: campaign.id },
          data: { sentRecipientCount: { increment: 1 } },
          select: { sentRecipientCount: true },
        });
      });
      if (!completion) return;
      if (result.sentCopyError) {
        console.error(`Campanha ${campaign.id}, destinatário ${recipientId}: ${result.sentCopyError}`);
      }

      const batchPause = completion.sentRecipientCount > 0
        && completion.sentRecipientCount % campaign.batchSize === 0;
      const activity = await projectEmailRecipientActivity(this.db, recipientId);
      await this.continueOrComplete(
        campaign.id,
        batchPause ? campaign.batchPauseMinSeconds : campaign.contactDelayMinSeconds,
        batchPause ? campaign.batchPauseMaxSeconds : campaign.contactDelayMaxSeconds,
      );
      return activity ? { organizationId: activity.organizationId, campaignId: campaign.id, activityUpdated: true } : undefined;
    } catch (error) {
      const retryable = !(error instanceof CampaignEmailError) || error.retryable;
      const maximumAttempts = Number(job.opts.attempts || 1);
      if (retryable && job.attemptsMade + 1 < maximumAttempts) throw error;
      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          exclusionReason: error instanceof Error ? error.message.slice(0, 500) : 'Falha de envio pelo SMTP',
        },
      });
      await this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
      throw error;
    }
  }

  private async sendBubble(recipientId: string, position: number, job: Job) {
    const recipient = await this.db.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: {
        contact: {
          include: {
            suppressions: { where: { channel: 'WHATSAPP' }, select: { channel: true } },
            companies: {
              where: { isPrimary: true },
              include: { company: { select: { name: true } } },
              take: 1,
            },
          },
        },
        campaign: {
          include: {
            bubbles: { orderBy: { position: 'asc' } },
            instance: { select: { instanceKey: true, status: true } },
          },
        },
      },
    });
    if (recipient?.campaign.status !== 'RUNNING') return;
    const { campaign, contact } = recipient;
    if (recipient.status !== 'QUEUED') {
      if (['REPLIED', 'OPTED_OUT'].includes(recipient.status)) {
        return this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
      }
      return;
    }
    if (await this.pauseDisconnectedCampaign(recipientId, campaign)) return;
    if (await this.skipBlockedWhatsappRecipient(recipientId, campaign, contact)) return;
    const sequence = campaignMessageSequence(recipient.messages, campaign.bubbles);
    const bubble = sequence[position];
    if (!bubble) {
      return this.completeWhatsappRecipient(recipientId, position, campaign, Boolean(recipient.repliedAt));
    }
    try {
      if (!await this.verifyWhatsappRecipient(recipientId, position, recipient, campaign, contact)) return;
      return await this.deliverWhatsappBubble(recipientId, position, bubble, campaign, contact);
    } catch (error) {
      if (await this.handleWhatsappSendError(recipientId, campaign, job, error)) return;
      throw error;
    }
  }

  private async verifyWhatsappRecipient(recipientId: string, position: number, recipient: any, campaign: any, contact: any) {
    const verificationExpired = !recipient.whatsappVerifiedAt
      || recipient.whatsappVerifiedAt.getTime() < Date.now() - 24 * 60 * 60_000;
    if (position !== 0 || !verificationExpired) return true;
    const [verification] = await this.evolution.checkWhatsappNumbers(campaign.instance.instanceKey, [contact.phone]);
    if (verification?.exists) {
      await this.db.campaignRecipient.update({ where: { id: recipientId }, data: { whatsappVerifiedAt: new Date() } });
      return true;
    }
    await this.db.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SKIPPED', exclusionReason: 'Número não possui WhatsApp', whatsappVerifiedAt: null },
    });
    await this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    return false;
  }

  private async deliverWhatsappBubble(recipientId: string, position: number, bubble: any, campaign: any, contact: any) {
    const text = this.render(bubble.content, campaignContactVariables(contact));
    const documentAsset = bubble.type === 'document' && bubble.mediaKey
      ? await this.db.mediaAsset.findUnique({
        where: { key: bubble.mediaKey },
        select: { key: true, filename: true, contentType: true },
      })
      : null;
    if (bubble.type === 'document' && bubble.mediaKey && (!documentAsset || !documentAsset.key.startsWith(`${campaign.organizationId}/`))) {
      throw new Error('O anexo da campanha não está mais disponível');
    }
    const documentMetadata = documentAsset
      ? normalizeWhatsappDocumentMetadata(documentAsset)
      : null;
    if (bubble.type === 'document' && documentAsset && !documentMetadata) {
      throw new Error('O anexo da campanha possui um tipo de documento inválido');
    }
    const mediaBase64 = bubble.type === 'audio' && bubble.mediaKey ? await storedMediaBase64(bubble.mediaKey) : undefined;
    const mediaUrl = bubble.mediaKey && !mediaBase64 ? await signedMediaUrl(bubble.mediaKey) : undefined;
    let conversation = await this.db.conversation.findFirst({
      where: { instanceId: campaign.instanceId, contactId: contact.id },
      select: { id: true, remoteJid: true, teamId: true },
    });
    if (conversation?.teamId === null) {
      const teamId = await this.defaultTeamId(campaign.organizationId);
      conversation = await this.db.conversation.update({
        where: { id: conversation.id },
        data: { teamId },
        select: { id: true, remoteJid: true, teamId: true },
      });
    }
    const result = await this.evolution.send(campaign.instance.instanceKey, {
      number: conversation?.remoteJid.includes('@lid') ? conversation.remoteJid : contact.phone,
      type: bubble.type,
      text,
      mediaUrl,
      mediaBase64,
      fileName: documentMetadata?.fileName,
      mimeType: documentMetadata?.mimeType,
    });
    const providerId = String(result.key?.id || result.messageId || randomUUID());
    if (!conversation) conversation = await this.createCampaignConversation(campaign, contact);
    const message = await this.db.message.create({ data: {
      instanceId: campaign.instanceId, conversationId: conversation.id, providerMessageId: providerId,
      direction: 'OUTBOUND', type: bubble.type, text, status: 'SENT', sentAt: new Date(),
      payload: { campaignId: campaign.id, recipientId, bubbleId: bubble.id || null },
    } });
    await this.db.campaignRecipient.update({ where: { id: recipientId }, data: { lastBubblePosition: position } });
    const activity = await projectWhatsappMessageActivity(this.db, message.id);
    const delay = randomBetween(campaign.bubbleDelayMinSeconds, campaign.bubbleDelayMaxSeconds) * 1000;
    await this.queue.add('send-campaign-bubble', { recipientId, position: position + 1 }, { delay, jobId: `recipient-${recipientId}-bubble-${position + 1}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    return activity ? { organizationId: activity.organizationId, campaignId: campaign.id, activityUpdated: true } : undefined;
  }

  private async createCampaignConversation(campaign: any, contact: any) {
    const teamId = await this.defaultTeamId(campaign.organizationId);
    const conversation = await this.db.conversation.create({
      data: {
        organizationId: campaign.organizationId, instanceId: campaign.instanceId, contactId: contact.id,
        remoteJid: `${contact.phone.replace(/\D/g, '')}@s.whatsapp.net`, lastMessageAt: new Date(), teamId,
      },
      select: { id: true, remoteJid: true, teamId: true },
    });
    await this.db.conversationEvent.create({ data: {
      organizationId: campaign.organizationId,
      conversationId: conversation.id,
      type: 'campaign_started',
      text: `Campanha “${campaign.name}” iniciou a conversa`,
      metadata: { campaignId: campaign.id },
    } });
    return conversation;
  }

  private async defaultTeamId(organizationId: string) {
    const team = await this.db.team.findFirst({ where: { organizationId, isDefault: true }, select: { id: true } });
    if (!team) throw new Error('A equipe Geral não está configurada');
    return team.id;
  }

  private async handleWhatsappSendError(recipientId: string, campaign: any, job: Job, error: unknown) {
    if (/connection closed/i.test(errorText(error))) {
      await this.db.$transaction([
        this.db.campaignRecipient.updateMany({
          where: { id: recipientId, status: 'QUEUED' },
          data: { status: 'PENDING', scheduledAt: null, exclusionReason: null },
        }),
        this.db.campaign.updateMany({
          where: { id: campaign.id, status: 'RUNNING' },
          data: { status: 'PAUSED' },
        }),
        this.db.whatsappInstance.updateMany({
          where: { id: campaign.instanceId },
          data: { status: 'DISCONNECTED', connectedAt: null },
        }),
      ]);
      return true;
    }
    const maximumAttempts = Number(job.opts.attempts || 1);
    if (job.attemptsMade + 1 < maximumAttempts) return false;
    await this.db.$transaction([
      this.db.campaignRecipient.update({ where: { id: recipientId }, data: { status: 'FAILED', exclusionReason: error instanceof Error ? error.message.slice(0, 500) : 'Falha de envio' } }),
      this.db.warmupProfile.update({ where: { instanceId: campaign.instanceId }, data: { failedToday: { increment: 1 } } }),
    ]);
    await this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    return false;
  }

  private async pauseDisconnectedCampaign(recipientId: string, campaign: any) {
    if (campaign.instance?.status === 'CONNECTED') return false;
    await this.db.$transaction([
      this.db.campaignRecipient.updateMany({
        where: { id: recipientId, status: 'QUEUED' },
        data: { status: 'PENDING', scheduledAt: null },
      }),
      this.db.campaign.updateMany({
        where: { id: campaign.id, status: 'RUNNING' },
        data: { status: 'PAUSED' },
      }),
    ]);
    return true;
  }

  private async skipBlockedWhatsappRecipient(recipientId: string, campaign: any, contact: any) {
    const blocked = contact.campaignsBlocked
      || contact.suppressions.some((item: { channel: string }) => item.channel === 'WHATSAPP')
      || !contact.phone;
    if (!blocked) return false;
    const exclusionReason = contact.campaignsBlocked
      ? 'Campanhas bloqueadas para este contato'
      : 'Contato bloqueado, descadastrado ou sem telefone';
    await this.db.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SKIPPED', exclusionReason },
    });
    await this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    return true;
  }

  private async completeWhatsappRecipient(recipientId: string, position: number, campaign: any, replied: boolean) {
    const completion = await this.db.$transaction(async (tx) => {
      const updated = await tx.campaignRecipient.updateMany({
        where: { id: recipientId, status: 'QUEUED' },
        data: { status: replied ? 'REPLIED' : 'SENT', sentAt: new Date(), lastBubblePosition: position - 1 },
      });
      if (!updated.count) return null;
      await tx.warmupProfile.update({ where: { instanceId: campaign.instanceId }, data: { sentToday: { increment: 1 } } });
      return tx.campaign.update({
        where: { id: campaign.id },
        data: { sentRecipientCount: { increment: 1 } },
        select: { sentRecipientCount: true },
      });
    });
    if (!completion) return this.continueOrComplete(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    const completed = completion.sentRecipientCount;
    const batchPause = completed > 0 && completed % campaign.batchSize === 0;
    return this.continueOrComplete(
      campaign.id,
      batchPause ? campaign.batchPauseMinSeconds : campaign.contactDelayMinSeconds,
      batchPause ? campaign.batchPauseMaxSeconds : campaign.contactDelayMaxSeconds,
    );
  }

  private async continueOrComplete(campaignId: string, min: number, max: number) {
    const [campaign, activeRecipients] = await Promise.all([
      this.db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } }),
      this.db.campaignRecipient.count({
        where: { campaignId, status: { in: ['PENDING', 'QUEUED'] } },
      }),
    ]);
    if (campaign?.status !== 'RUNNING') return;
    if (!activeRecipients) {
      return this.db.campaign.updateMany({
        where: { id: campaignId, status: 'RUNNING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
    return this.scheduleNext(campaignId, min, max);
  }

  private scheduleNext(campaignId: string, min: number, max: number) {
    const delay = randomBetween(min, max) * 1000;
    return this.queue.add('dispatch-campaign', { campaignId }, { delay, jobId: `campaign-${campaignId}-next-${Date.now()}` });
  }

  private async processMailgunEvent(eventData: MailgunEventData) {
    const providerEventId = eventData.id?.trim() || '';
    const eventType = eventData.event?.trim().toLowerCase() || '';
    if (!providerEventId || !eventType) return;

    const variables = eventData['user-variables'];
    const recipientId = typeof variables?.['recipient-id'] === 'string'
      ? variables['recipient-id']
      : null;
    const providerMessageId = normalizeMailgunMessageId(eventData.message?.headers?.['message-id']);
    const recipient = await this.db.campaignRecipient.findFirst({
      where: {
        campaign: { channel: 'EMAIL' },
        OR: [
          ...(recipientId ? [{ id: recipientId }] : []),
          ...(providerMessageId ? [{ providerMessageId }] : []),
        ],
      },
      select: { id: true, campaignId: true, contactId: true, status: true },
    });
    if (!recipient) return;

    const severity = eventData.severity?.toLowerCase() || '';
    const permanentFailure = eventType === 'permanent_fail'
      || (eventType === 'failed' && severity === 'permanent');
    const optedOut = eventType === 'unsubscribed' || eventType === 'complained';
    const optOutReason = eventType === 'complained'
      ? 'Destinatário marcou o e-mail como spam'
      : 'Destinatário cancelou a inscrição';
    const occurredAt = new Date(Number(eventData.timestamp || Date.now() / 1000) * 1000);
    const update = mailgunRecipientUpdate({
      eventType,
      currentStatus: recipient.status,
      occurredAt,
      permanentFailure,
      failureReason: this.mailgunFailureReason(eventData),
      optedOut,
      optOutReason,
    });

    try {
      await this.db.$transaction(async (tx) => {
        await tx.emailDeliveryEvent.create({
          data: {
            recipientId: recipient.id,
            providerEventId,
            eventType,
            severity: severity || null,
            recipientEmail: typeof eventData.recipient === 'string' ? eventData.recipient : null,
            payload: eventData as Prisma.InputJsonValue,
            occurredAt,
          },
        });
        if (Object.keys(update).length) {
          await tx.campaignRecipient.update({ where: { id: recipient.id }, data: update });
        }
        if (optedOut) {
          await tx.suppression.upsert({
            where: { contactId_channel: { contactId: recipient.contactId, channel: 'EMAIL' } },
            update: { reason: optOutReason },
            create: { contactId: recipient.contactId, channel: 'EMAIL', reason: optOutReason },
          });
        }
      });
    } catch (error) {
      const duplicateEvent = error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
      if (!duplicateEvent) throw error;
    }
    const activity = await projectEmailRecipientActivity(this.db, recipient.id);
    return activity ? { organizationId: activity.organizationId, campaignId: recipient.campaignId, activityUpdated: true } : undefined;
  }

  private render(content: string, contact: Record<string, unknown>) {
    return renderTemplateVariables(content, contact);
  }

  private withUnsubscribeFooter(html: string) {
    if (html.includes('%unsubscribe_url%')) return html;
    return `${html}<p style="margin-top:24px;font-size:12px;color:#6b7280">Não deseja mais receber estes e-mails? <a href="%unsubscribe_url%">Cancelar inscrição</a>.</p>`;
  }

  private withUnsubscribeText(text: string) {
    if (text.includes('%unsubscribe_url%')) return text;
    return `${text}\n\nCancelar inscrição: %unsubscribe_url%`;
  }

  private htmlToText(html: string) {
    const withoutNonContent = html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<([a-z][\w:-]*)\b[^>]*data-email-preheader=["']true["'][^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n');
    return stripHtmlTags(withoutNonContent)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private mailgunFailureReason(eventData: MailgunEventData) {
    const deliveryStatus = eventData['delivery-status'];
    if (deliveryStatus && typeof deliveryStatus === 'object') {
      const detail = deliveryStatus as Record<string, unknown>;
      return firstText(detail.message, detail.description, detail.code) || 'Falha permanente no Mailgun';
    }
    return 'Falha permanente no Mailgun';
  }

  private withinWindow(start: string, end: string, days: number[]) {
    const parts = sendingWindowFormatter.formatToParts(new Date());
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value || '');
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    const current = `${hour}:${minute}`;
    return days.includes(weekday) && current >= start && current <= end;
  }
}

function firstText(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value))?.slice(0, 500) || '';
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Falha de envio';
}

function stripHtmlTags(value: string) {
  let result = '';
  let insideTag = false;
  for (const character of value) {
    if (character === '<') {
      insideTag = true;
    } else if (character === '>') {
      insideTag = false;
    } else if (!insideTag) {
      result += character;
    }
  }
  return result;
}

function mailgunRecipientUpdate(input: {
  eventType: string;
  currentStatus: string;
  occurredAt: Date;
  permanentFailure: boolean;
  failureReason: string;
  optedOut: boolean;
  optOutReason: string;
}) {
  const update: Prisma.CampaignRecipientUpdateInput = {};
  if (input.eventType === 'accepted' && ['PENDING', 'QUEUED'].includes(input.currentStatus)) update.status = 'SENT';
  if (input.eventType === 'delivered' && !['READ', 'REPLIED', 'OPTED_OUT'].includes(input.currentStatus)) {
    update.status = 'DELIVERED';
    update.deliveredAt = input.occurredAt;
  }
  if (['opened', 'clicked'].includes(input.eventType) && input.currentStatus !== 'REPLIED') {
    update.status = 'READ';
    if (input.eventType === 'opened') update.openedAt = input.occurredAt;
    if (input.eventType === 'clicked') update.clickedAt = input.occurredAt;
  }
  if (input.permanentFailure) {
    update.status = 'FAILED';
    update.failedAt = input.occurredAt;
    update.exclusionReason = input.failureReason;
  }
  if (input.optedOut) {
    update.status = 'OPTED_OUT';
    update.exclusionReason = input.optOutReason;
  }
  return update;
}
