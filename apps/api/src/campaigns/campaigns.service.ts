import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { campaignCadenceSchema, canSendWhatsapp } from '@prospecta/contracts';
import type { AuthContext } from '../auth/types.js';
import { permissionScope } from '../auth/data-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CAMPAIGN_QUEUE } from '../queue/queue.module.js';

const RECIPIENT_INSERT_BATCH_SIZE = 1_000;

export type CreateCampaignInput = {
  name: string;
  channel?: 'whatsapp' | 'email';
  instanceId?: string;
  segmentId?: string;
  filters?: Record<string, unknown>;
  bubbles: Array<{ type?: string; content: string; mediaKey?: string }>;
  cadence?: Record<string, unknown>;
  sendingWindowStart?: string;
  sendingWindowEnd?: string;
  sendingDays?: number[];
};

@Injectable()
export class CampaignsService {
  constructor(private readonly db: PrismaService, @Inject(CAMPAIGN_QUEUE) private readonly queue: Queue) {}

  list(auth: AuthContext) {
    return this.db.campaign.findMany({
      where: { organizationId: auth.organizationId, ...this.scope(auth) },
      include: {
        instance: { select: { id: true, name: true, status: true, phone: true } }, segment: true,
        bubbles: { orderBy: { position: 'asc' } },
        _count: { select: { recipients: true } },
      }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  async get(auth: AuthContext, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      include: {
        instance: { include: { warmupProfile: true } }, segment: true,
        bubbles: { orderBy: { position: 'asc' } },
        recipients: { include: { contact: true }, orderBy: { createdAt: 'asc' }, take: 500 },
      },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  async create(auth: AuthContext, input: CreateCampaignInput) {
    if (!auth.userId) throw new BadRequestException('Campanha exige usuário');
    if (!input.name?.trim() || !input.bubbles?.length) throw new BadRequestException('Nome e ao menos uma mensagem são obrigatórios');
    const cadence = campaignCadenceSchema.parse(input.cadence || {});
    const channel = (input.channel || 'whatsapp').toUpperCase() as 'WHATSAPP' | 'EMAIL';
    if (channel === 'WHATSAPP' && !input.instanceId) throw new BadRequestException('Selecione um número de WhatsApp');
    const mediaKeys = input.bubbles.map((bubble) => bubble.mediaKey).filter((key): key is string => Boolean(key));
    if (mediaKeys.length) {
      const media = await this.db.mediaAsset.findMany({ where: { key: { in: mediaKeys } }, select: { key: true } });
      if (media.length !== new Set(mediaKeys).size || media.some((item) => !item.key.startsWith(`${auth.organizationId}/`))) throw new BadRequestException('Uma ou mais mídias são inválidas');
    }
    const campaign = await this.db.campaign.create({ data: {
      organizationId: auth.organizationId, createdById: auth.userId, name: input.name.trim(),
      channel, instanceId: input.instanceId, segmentId: input.segmentId,
      bubbleDelayMinSeconds: cadence.bubbleDelayMinSeconds, bubbleDelayMaxSeconds: cadence.bubbleDelayMaxSeconds,
      contactDelayMinSeconds: cadence.contactDelayMinSeconds, contactDelayMaxSeconds: cadence.contactDelayMaxSeconds,
      batchSize: cadence.batchSize, batchPauseMinSeconds: cadence.batchPauseMinSeconds, batchPauseMaxSeconds: cadence.batchPauseMaxSeconds,
      sendingWindowStart: input.sendingWindowStart || '09:00', sendingWindowEnd: input.sendingWindowEnd || '18:00',
      sendingDays: (input.sendingDays || [1, 2, 3, 4, 5]) as Prisma.InputJsonValue,
      stats: { filters: input.filters || {} } as Prisma.InputJsonValue,
      bubbles: { create: input.bubbles.map((bubble, position) => ({ position, type: bubble.type || 'text', content: bubble.content, mediaKey: bubble.mediaKey })) },
    }, include: { bubbles: true } });
    await this.audit(auth, 'campaign.created', campaign.id, { name: campaign.name, channel });
    return campaign;
  }

  async preflight(auth: AuthContext, id: string) {
    const campaign = await this.getForAction(auth, id);
    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) throw new BadRequestException('Campanha não pode ser revalidada neste estado');
    const filters = ((campaign.stats as Record<string, unknown>)?.filters || {}) as Record<string, unknown>;
    const contacts = await this.resolveAudience(auth.organizationId, campaign.segmentId, filters);
    const seen = new Set<string>();
    const results: Array<{ contactId: string; status: 'PENDING' | 'SKIPPED'; reason?: string }> = [];
    const reasons: Record<string, number> = {};
    let eligible = 0;
    let skipped = 0;
    for (const contact of contacts) {
      let reason: string | undefined;
      if (campaign.channel === 'WHATSAPP') {
        const eligibility = canSendWhatsapp({ phone: contact.phone, consentStatus: contact.consentStatus, suppressed: contact.suppressions.some((item) => item.channel === 'WHATSAPP') });
        if (!eligibility.allowed) reason = eligibility.reason;
        else if (seen.has(contact.phone!)) reason = 'Telefone duplicado';
        if (contact.phone) seen.add(contact.phone);
      } else if (!contact.email) reason = 'E-mail ausente';
      results.push({ contactId: contact.id, status: reason ? 'SKIPPED' : 'PENDING', reason });
      if (reason) {
        skipped += 1;
        reasons[reason] = (reasons[reason] || 0) + 1;
      } else {
        eligible += 1;
      }
    }
    await this.db.$transaction(async (tx) => {
      await tx.campaignRecipient.deleteMany({ where: { campaignId: id, status: { in: ['PENDING', 'SKIPPED'] } } });
      for (let index = 0; index < results.length; index += RECIPIENT_INSERT_BATCH_SIZE) {
        const batch = results.slice(index, index + RECIPIENT_INSERT_BATCH_SIZE);
        await tx.campaignRecipient.createMany({ data: batch.map((result) => ({ campaignId: id, contactId: result.contactId, status: result.status, exclusionReason: result.reason })) });
      }
      await tx.campaign.update({ where: { id }, data: { stats: {
        filters, audience: contacts.length, eligible, skipped,
      } as Prisma.InputJsonValue } });
    }, { timeout: 60_000 });
    return { audience: contacts.length, eligible, skipped, reasons };
  }

  async schedule(auth: AuthContext, id: string, scheduledAt?: string) {
    const campaign = await this.getForAction(auth, id);
    if (campaign.channel === 'EMAIL') throw new BadRequestException('Envio de e-mail está preparado, mas desativado até configurar um provedor');
    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) throw new BadRequestException('Estado inválido para iniciar campanha');
    const eligible = await this.db.campaignRecipient.count({ where: { campaignId: id, status: 'PENDING' } });
    if (!eligible) throw new BadRequestException('Execute a pré-validação e confirme que há destinatários elegíveis');
    const date = scheduledAt ? new Date(scheduledAt) : new Date();
    const status = date > new Date(Date.now() + 30_000) ? 'SCHEDULED' : 'RUNNING';
    await this.db.campaign.update({ where: { id }, data: { status, scheduledAt: date, startedAt: status === 'RUNNING' ? new Date() : undefined } });
    await this.queue.add('dispatch-campaign', { campaignId: id }, { jobId: `campaign-${id}-${date.getTime()}`, delay: Math.max(0, date.getTime() - Date.now()), attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 });
    await this.audit(auth, 'campaign.scheduled', id, { scheduledAt: date, eligible });
    return this.get(auth, id);
  }

  async setStatus(auth: AuthContext, id: string, action: 'pause' | 'resume' | 'cancel') {
    const campaign = await this.getForAction(auth, id);
    const map = { pause: 'PAUSED', resume: 'RUNNING', cancel: 'CANCELLED' } as const;
    if (action === 'resume' && campaign.channel === 'EMAIL') throw new BadRequestException('Envio de e-mail desativado');
    const updated = await this.db.campaign.update({ where: { id }, data: { status: map[action] } });
    if (action === 'resume') await this.queue.add('dispatch-campaign', { campaignId: id }, { jobId: `campaign-${id}-resume-${Date.now()}`, removeOnComplete: 1000 });
    if (action === 'cancel') await this.db.campaignRecipient.updateMany({ where: { campaignId: id, status: { in: ['PENDING', 'QUEUED'] } }, data: { status: 'SKIPPED', exclusionReason: 'Campanha cancelada' } });
    await this.audit(auth, `campaign.${action}`, id, { previousStatus: campaign.status });
    return updated;
  }

  private async resolveAudience(organizationId: string, segmentId: string | null, filters: Record<string, unknown>) {
    const staticMemberIds = segmentId ? await this.db.segmentMember.findMany({ where: { segmentId }, select: { contactId: true } }) : [];
    return this.db.contact.findMany({
      where: {
        organizationId, archivedAt: null,
        ...(staticMemberIds.length ? { id: { in: staticMemberIds.map((item) => item.contactId) } } : {}),
        ...(filters.teamId ? { teamId: String(filters.teamId) } : {}),
        ...(filters.ownerId ? { ownerId: String(filters.ownerId) } : {}),
        ...(filters.tagId ? { tags: { some: { tagId: String(filters.tagId) } } } : {}),
      },
      select: {
        id: true,
        phone: true,
        email: true,
        consentStatus: true,
        suppressions: { select: { channel: true } },
      },
      take: 50_000,
    });
  }

  private async getForAction(auth: AuthContext, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      select: { id: true, channel: true, status: true, segmentId: true, stats: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  private audit(auth: AuthContext, action: string, entityId: string, after: object) {
    return this.db.auditLog.create({ data: { organizationId: auth.organizationId, userId: auth.userId, action, entityType: 'Campaign', entityId, after } });
  }

  private scope(auth: AuthContext) {
    const scope = permissionScope(auth, 'campaigns');
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') return auth.teamId ? { createdBy: { teamId: auth.teamId } } : { id: '__none__' };
    return auth.userId ? { createdById: auth.userId } : { id: '__none__' };
  }
}
