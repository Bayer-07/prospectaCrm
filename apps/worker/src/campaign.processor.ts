import type { Job, Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EvolutionClient } from './evolution-client.js';
import { signedMediaUrl, storedMediaBase64 } from './storage.js';

const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
const sendingWindowFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export class CampaignProcessor {
  constructor(private readonly db: PrismaClient, private readonly queue: Queue, private readonly evolution: EvolutionClient) {}

  async process(job: Job<{ campaignId?: string; recipientId?: string; position?: number }>) {
    if (job.name === 'dispatch-campaign') return this.dispatch(job.data.campaignId!);
    if (job.name === 'send-campaign-bubble') return this.sendBubble(job.data.recipientId!, job.data.position || 0);
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
    if (!campaign || !['RUNNING', 'SCHEDULED'].includes(campaign.status) || !campaign.instance?.warmupProfile) return;
    if (campaign.status === 'SCHEDULED') await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING', startedAt: new Date() } });
    if (!this.withinWindow(campaign.sendingWindowStart, campaign.sendingWindowEnd, campaign.sendingDays as number[])) {
      await this.queue.add('dispatch-campaign', { campaignId }, { delay: 15 * 60_000, jobId: `campaign-${campaignId}-window-${Math.floor(Date.now() / 900_000)}` });
      return;
    }
    const profile = campaign.instance.warmupProfile;
    if (profile.sentToday >= profile.currentDailyCap) {
      await this.queue.add('dispatch-campaign', { campaignId }, { delay: 60 * 60_000, jobId: `campaign-${campaignId}-cap-${Math.floor(Date.now() / 3600_000)}` });
      return;
    }
    const recipient = await this.db.campaignRecipient.findFirst({
      where: { campaignId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!recipient) {
      const active = await this.db.campaignRecipient.count({ where: { campaignId, status: 'QUEUED' } });
      if (!active) await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      return;
    }
    await this.db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'QUEUED', scheduledAt: new Date() } });
    await this.queue.add('send-campaign-bubble', { recipientId: recipient.id, position: 0 }, { jobId: `recipient-${recipient.id}-bubble-0`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
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
    if (contact.consentStatus !== 'GRANTED' || contact.suppressions.some((item) => item.channel === 'WHATSAPP') || !contact.phone) {
      await this.db.campaignRecipient.update({ where: { id: recipientId }, data: { status: 'SKIPPED', exclusionReason: 'Consentimento, supressão ou telefone inválido' } });
      return this.scheduleNext(campaign.id, campaign.contactDelayMinSeconds, campaign.contactDelayMaxSeconds);
    }
    const bubble = campaign.bubbles[position];
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
        payload: { campaignId: campaign.id, recipientId, bubbleId: bubble.id },
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

  private render(content: string, contact: Record<string, unknown>) {
    return content.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => String(contact[key] ?? ''));
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
