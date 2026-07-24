import type { Job, Queue } from 'bullmq';
import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EvolutionClient } from './evolution-client.js';
import { MailgunClient, MailgunRequestError, normalizeMailgunMessageId } from './mailgun-client.js';
import { signedMediaUrl, storedMediaBase64 } from './storage.js';

const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
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

export class CampaignProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: Queue,
    private readonly evolution: EvolutionClient,
    private readonly mailgun = new MailgunClient(),
  ) {}

  async process(job: Job<{ campaignId?: string; recipientId?: string; position?: number; eventData?: MailgunEventData }>) {
    if (job.name === 'dispatch-campaign') return this.dispatch(job.data.campaignId!);
    if (job.name === 'send-campaign-bubble') return this.sendBubble(job.data.recipientId!, job.data.position || 0);
    if (job.name === 'send-campaign-email') return this.sendEmail(job.data.recipientId!, job);
    if (job.name === 'mailgun-event') return this.processMailgunEvent(job.data.eventData!);
  }

  private async dispatch(campaignId: string) {
    const campaign = await this.db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        instance: {
          select: {
            warmupProfile: { select: { sentToday: true, currentDailyCap: true } },
          },
        },
      },
    });
    if (!campaign || !['RUNNING', 'SCHEDULED'].includes(campaign.status)) return;
    if (campaign.channel === 'WHATSAPP' && !campaign.instance?.warmupProfile) return;
    if (campaign.status === 'SCHEDULED') await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING', startedAt: new Date() } });
    if (!this.withinWindow(campaign.sendingWindowStart, campaign.sendingWindowEnd, campaign.sendingDays as number[])) {
      await this.queue.add('dispatch-campaign', { campaignId }, { delay: 15 * 60_000, jobId: `campaign-${campaignId}-window-${Math.floor(Date.now() / 900_000)}` });
      return;
    }
    const profile = campaign.instance?.warmupProfile;
    if (campaign.channel === 'WHATSAPP' && profile && profile.sentToday >= profile.currentDailyCap) {
      await this.queue.add('dispatch-campaign', { campaignId }, { delay: 60 * 60_000, jobId: `campaign-${campaignId}-cap-${Math.floor(Date.now() / 3600_000)}` });
      return;
    }
    const recipient = await this.db.campaignRecipient.findFirst({
      where: { campaignId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!recipient) {
      const active = await this.db.campaignRecipient.count({ where: { campaignId, status: 'QUEUED' } });
      if (!active) await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      return;
    }
    await this.db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'QUEUED', scheduledAt: new Date() } });
    const jobName = campaign.channel === 'EMAIL' ? 'send-campaign-email' : 'send-campaign-bubble';
    await this.queue.add(jobName, { recipientId: recipient.id, position: 0 }, {
      jobId: campaign.channel === 'EMAIL' ? `recipient-${recipient.id}-email` : `recipient-${recipient.id}-bubble-0`,
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
    if (!recipient || recipient.campaign.channel !== 'EMAIL' || recipient.campaign.status !== 'RUNNING' || recipient.status !== 'QUEUED') return;

    const { campaign, contact } = recipient;
    if (!contact.email || contact.suppressions.length) {
      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'SKIPPED', exclusionReason: 'Contato sem e-mail ou descadastrado' },
      });
      return this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    }

    const template = campaign.bubbles[0]?.content;
    if (!template || !campaign.emailSubject) {
      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'FAILED', failedAt: new Date(), exclusionReason: 'Campanha sem assunto ou conteúdo de e-mail' },
      });
      return this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    }

    const variables = {
      ...(contact as unknown as Record<string, unknown>),
      nome: contact.name,
      telefone: contact.phone || '',
      email: contact.email,
      empresa: contact.companies[0]?.company.name || '',
    };
    const subject = this.render(campaign.emailSubject, variables);
    const renderedHtml = this.render(template, variables);
    const html = this.withUnsubscribeFooter(renderedHtml);
    const text = this.withUnsubscribeText(this.htmlToText(renderedHtml));

    try {
      const result = await this.mailgun.send({
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
            exclusionReason: null,
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

      const batchPause = completion.sentRecipientCount > 0
        && completion.sentRecipientCount % campaign.batchSize === 0;
      return this.scheduleNext(
        campaign.id,
        batchPause ? campaign.batchPauseMinSeconds : campaign.contactDelayMinSeconds,
        batchPause ? campaign.batchPauseMaxSeconds : campaign.contactDelayMaxSeconds,
      );
    } catch (error) {
      const retryable = !(error instanceof MailgunRequestError)
        || error.status === 429
        || error.status >= 500;
      const maximumAttempts = Number(job.opts.attempts || 1);
      if (retryable && job.attemptsMade + 1 < maximumAttempts) throw error;
      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          exclusionReason: error instanceof Error ? error.message.slice(0, 500) : 'Falha de envio pelo Mailgun',
        },
      });
      await this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
      throw error;
    }
  }

  private async sendBubble(recipientId: string, position: number) {
    const recipient = await this.db.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: {
        contact: { include: { suppressions: { where: { channel: 'WHATSAPP' }, select: { channel: true } } } },
        campaign: {
          include: {
            bubbles: { orderBy: { position: 'asc' } },
            instance: { select: { instanceKey: true } },
          },
        },
      },
    });
    if (!recipient || recipient.campaign.status !== 'RUNNING' || recipient.status !== 'QUEUED') return;
    const { campaign, contact } = recipient;
    if (contact.suppressions.some((item) => item.channel === 'WHATSAPP') || !contact.phone) {
      await this.db.campaignRecipient.update({ where: { id: recipientId }, data: { status: 'SKIPPED', exclusionReason: 'Contato bloqueado, descadastrado ou sem telefone' } });
      return this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    }
    const sequence = campaignMessageSequence(recipient.messages, campaign.bubbles);
    const bubble = sequence[position];
    if (!bubble) {
      const completion = await this.db.$transaction(async (tx) => {
        const updated = await tx.campaignRecipient.updateMany({
          where: { id: recipientId, status: 'QUEUED' },
          data: { status: 'SENT', sentAt: new Date(), lastBubblePosition: position - 1 },
        });
        if (!updated.count) return null;
        await tx.warmupProfile.update({ where: { instanceId: campaign.instanceId! }, data: { sentToday: { increment: 1 } } });
        return tx.campaign.update({
          where: { id: campaign.id },
          data: { sentRecipientCount: { increment: 1 } },
          select: { sentRecipientCount: true },
        });
      });
      if (!completion) return;
      const completed = completion.sentRecipientCount;
      const batchPause = completed > 0 && completed % campaign.batchSize === 0;
      return this.scheduleNext(campaign.id,
        batchPause ? campaign.batchPauseMinSeconds : campaign.contactDelayMinSeconds,
        batchPause ? campaign.batchPauseMaxSeconds : campaign.contactDelayMaxSeconds);
    }
    try {
      const verificationExpired = !recipient.whatsappVerifiedAt
        || recipient.whatsappVerifiedAt.getTime() < Date.now() - 24 * 60 * 60_000;
      if (position === 0 && verificationExpired) {
        const [verification] = await this.evolution.checkWhatsappNumbers(campaign.instance!.instanceKey, [contact.phone]);
        if (!verification?.exists) {
          await this.db.campaignRecipient.update({
            where: { id: recipientId },
            data: { status: 'SKIPPED', exclusionReason: 'Número não possui WhatsApp', whatsappVerifiedAt: null },
          });
          return this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
        }
        await this.db.campaignRecipient.update({ where: { id: recipientId }, data: { whatsappVerifiedAt: new Date() } });
      }
      const text = this.render(bubble.content, contact as unknown as Record<string, unknown>);
      const mediaBase64 = bubble.type === 'audio' && bubble.mediaKey ? await storedMediaBase64(bubble.mediaKey) : undefined;
      const mediaUrl = bubble.mediaKey && !mediaBase64 ? await signedMediaUrl(bubble.mediaKey) : undefined;
      let conversation = await this.db.conversation.findFirst({
        where: { instanceId: campaign.instanceId!, contactId: contact.id },
        select: { id: true, remoteJid: true },
      });
      const result = await this.evolution.send(campaign.instance!.instanceKey, {
        number: conversation?.remoteJid.includes('@lid') ? conversation.remoteJid : contact.phone,
        type: bubble.type,
        text,
        mediaUrl,
        mediaBase64,
      });
      const providerId = String(result.key?.id || result.messageId || randomUUID());
      if (!conversation) {
        conversation = await this.db.conversation.create({
          data: {
            organizationId: campaign.organizationId, instanceId: campaign.instanceId!, contactId: contact.id,
            remoteJid: `${contact.phone.replace(/\D/g, '')}@s.whatsapp.net`, lastMessageAt: new Date(),
          },
          select: { id: true, remoteJid: true },
        });
        await this.db.conversationEvent.create({ data: {
          organizationId: campaign.organizationId,
          conversationId: conversation.id,
          type: 'campaign_started',
          text: `Campanha “${campaign.name}” iniciou a conversa`,
          metadata: { campaignId: campaign.id },
        } });
      }
      await this.db.message.create({ data: {
        instanceId: campaign.instanceId!, conversationId: conversation.id, providerMessageId: providerId,
        direction: 'OUTBOUND', type: bubble.type, text, status: 'SENT', sentAt: new Date(),
        payload: { campaignId: campaign.id, recipientId, bubbleId: bubble.id || null },
      } });
      await this.db.campaignRecipient.update({ where: { id: recipientId }, data: { lastBubblePosition: position } });
      const delay = randomBetween(campaign.bubbleDelayMinSeconds, campaign.bubbleDelayMaxSeconds) * 1000;
      await this.queue.add('send-campaign-bubble', { recipientId, position: position + 1 }, { delay, jobId: `recipient-${recipientId}-bubble-${position + 1}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    } catch (error) {
      await this.db.$transaction([
        this.db.campaignRecipient.update({ where: { id: recipientId }, data: { status: 'FAILED', exclusionReason: error instanceof Error ? error.message.slice(0, 500) : 'Falha de envio' } }),
        this.db.warmupProfile.update({ where: { instanceId: campaign.instanceId! }, data: { failedToday: { increment: 1 } } }),
      ]);
      await this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
      throw error;
    }
  }

  private scheduleNext(campaignId: string, min: number, max: number) {
    const delay = randomBetween(min, max) * 1000;
    return this.queue.add('dispatch-campaign', { campaignId }, { delay, jobId: `campaign-${campaignId}-next-${Date.now()}` });
  }

  private async processMailgunEvent(eventData: MailgunEventData) {
    const providerEventId = String(eventData.id || '').trim();
    const eventType = String(eventData.event || '').trim().toLowerCase();
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
      select: { id: true, contactId: true, status: true },
    });
    if (!recipient) return;

    const severity = String(eventData.severity || '').toLowerCase();
    const permanentFailure = eventType === 'permanent_fail'
      || (eventType === 'failed' && severity === 'permanent');
    const optedOut = eventType === 'unsubscribed' || eventType === 'complained';
    const occurredAt = new Date(Number(eventData.timestamp || Date.now() / 1000) * 1000);
    const update: Prisma.CampaignRecipientUpdateInput = {};

    if (eventType === 'accepted' && ['PENDING', 'QUEUED'].includes(recipient.status)) update.status = 'SENT';
    if (eventType === 'delivered' && !['READ', 'REPLIED', 'OPTED_OUT'].includes(recipient.status)) {
      update.status = 'DELIVERED';
      update.deliveredAt = occurredAt;
    }
    if ((eventType === 'opened' || eventType === 'clicked') && recipient.status !== 'REPLIED') {
      update.status = 'READ';
      if (eventType === 'opened') update.openedAt = occurredAt;
      if (eventType === 'clicked') update.clickedAt = occurredAt;
    }
    if (permanentFailure) {
      update.status = 'FAILED';
      update.failedAt = occurredAt;
      update.exclusionReason = this.mailgunFailureReason(eventData);
    }
    if (optedOut) {
      update.status = 'OPTED_OUT';
      update.exclusionReason = eventType === 'complained'
        ? 'Destinatário marcou o e-mail como spam'
        : 'Destinatário cancelou a inscrição';
    }

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
            update: { reason: String(update.exclusionReason) },
            create: { contactId: recipient.contactId, channel: 'EMAIL', reason: String(update.exclusionReason) },
          });
        }
      });
    } catch (error) {
      const duplicateEvent = error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
      if (!duplicateEvent) throw error;
    }
  }

  private render(content: string, contact: Record<string, unknown>) {
    return content.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => String(contact[key] ?? ''));
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
    return html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<([a-z][\w:-]*)\b[^>]*data-email-preheader=["']true["'][^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
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
      return String(detail.message || detail.description || detail.code || 'Falha permanente no Mailgun').slice(0, 500);
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
