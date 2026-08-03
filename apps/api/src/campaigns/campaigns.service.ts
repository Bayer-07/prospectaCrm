import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { campaignCadenceSchema, normalizePhoneKey } from '@prospecta/contracts';
import type { AuthContext } from '../auth/types.js';
import { permissionScope, scopedWhere } from '../auth/data-scope.js';
import { EvolutionService } from '../integrations/evolution.service.js';
import { campaignEmailConfigurationStatus } from '../email/campaign-email-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CAMPAIGN_QUEUE } from '../queue/queue.module.js';
import { parseCampaignCsv, type CampaignCsvRow } from './campaign-csv.js';

const RECIPIENT_INSERT_BATCH_SIZE = 1_000;
const SENT_RECIPIENT_STATUSES = new Set(['SENT', 'DELIVERED', 'READ', 'REPLIED']);
const INVALID_WHATSAPP_REASON = 'Número não possui WhatsApp';

type CampaignStatusCount = {
  campaignId: string;
  status: string;
  _count: { _all: number };
};

export type CampaignProgress = {
  audience: number;
  sent: number;
  replied: number;
  remaining: number;
  failed: number;
  skipped: number;
};

export function campaignProgressFromStatusCounts(campaignId: string, rows: CampaignStatusCount[]): CampaignProgress {
  const counts = new Map(
    rows
      .filter((row) => row.campaignId === campaignId)
      .map((row) => [row.status, row._count._all]),
  );
  const count = (status: string) => counts.get(status) || 0;
  return {
    audience: [...counts.values()].reduce((total, current) => total + current, 0),
    sent: [...SENT_RECIPIENT_STATUSES].reduce((total, status) => total + count(status), 0),
    replied: count('REPLIED'),
    remaining: count('PENDING') + count('QUEUED'),
    failed: count('FAILED'),
    skipped: count('SKIPPED') + count('OPTED_OUT'),
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

type CampaignMessageTemplate = { type: string; content: string; mediaKey?: string | null };

function recipientMessageTemplates(value: Prisma.JsonValue, fallback: CampaignMessageTemplate[]) {
  const custom = Array.isArray(value)
    ? value
      .filter((message): message is Prisma.JsonObject => Boolean(message && typeof message === 'object' && !Array.isArray(message)))
      .map((message) => ({
        type: typeof message.type === 'string' ? message.type : 'text',
        content: typeof message.content === 'string' ? message.content : '',
        mediaKey: typeof message.mediaKey === 'string' ? message.mediaKey : null,
      }))
      .filter((message) => Boolean(message.content))
    : [];
  return custom.length ? custom : fallback;
}

export function renderCampaignContent(content: string, variables: Record<string, unknown>) {
  return content.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => String(variables[key] ?? ''));
}

export function campaignSendingSchedule(input: Pick<CreateCampaignInput, 'sendingWindowStart' | 'sendingWindowEnd' | 'sendingDays'>) {
  return {
    start: input.sendingWindowStart || '00:00',
    end: input.sendingWindowEnd || '23:59',
    days: input.sendingDays?.length ? input.sendingDays : [0, 1, 2, 3, 4, 5, 6],
  };
}

function csvCell(value: string) {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function invalidWhatsappRecipientsCsv(
  recipients: Array<{ contact: { name: string; phone: string | null } }>,
) {
  const rows = recipients.map(({ contact }) => [
    csvCell(contact.name),
    csvCell(contact.phone || ''),
  ].join(';'));
  return `\uFEFFnome;número\r\n${rows.length ? `${rows.join('\r\n')}\r\n` : ''}`;
}

function campaignFilenamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export type CreateCampaignInput = {
  name: string;
  channel?: 'whatsapp' | 'email';
  instanceId?: string;
  segmentId?: string;
  filters?: Record<string, unknown>;
  bubbles?: Array<{ type?: string; content: string; mediaKey?: string }>;
  emailSubject?: string;
  audience?: {
    source: 'contacts' | 'csv';
    contactIds?: string[];
    contactSearches?: string[];
    excludedContactIds?: string[];
    csv?: string;
  };
  cadence?: Record<string, unknown>;
  sendingWindowStart?: string;
  sendingWindowEnd?: string;
  sendingDays?: number[];
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CAMPAIGN_QUEUE) private readonly queue: Queue,
    private readonly evolution: EvolutionService,
  ) {}

  async list(auth: AuthContext) {
    const campaigns = await this.db.campaign.findMany({
      where: { organizationId: auth.organizationId, archivedAt: null, ...this.scope(auth) },
      include: {
        instance: { select: { id: true, name: true, status: true, phone: true } }, segment: true,
        bubbles: { orderBy: { position: 'asc' } },
        _count: { select: { recipients: true } },
      }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    });
    const statusCounts = campaigns.length
      ? await this.db.campaignRecipient.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: campaigns.map((campaign) => campaign.id) } },
        _count: { _all: true },
      })
      : [];
    return campaigns.map((campaign) => this.withProgress(campaign, statusCounts));
  }

  async get(auth: AuthContext, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...this.scope(auth) },
      include: {
        instance: { include: { warmupProfile: true } }, segment: true,
        bubbles: { orderBy: { position: 'asc' } },
        recipients: {
          include: {
            contact: {
              include: {
                companies: {
                  where: { isPrimary: true },
                  include: { company: { select: { name: true } } },
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 500,
        },
        _count: { select: { recipients: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    const statusCounts = await this.db.campaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: id },
      _count: { _all: true },
    });
    const fallbackMessages = campaign.bubbles.map((bubble) => ({
      type: bubble.type,
      content: bubble.content,
      mediaKey: bubble.mediaKey,
    }));
    const recipients = campaign.recipients.map((recipient) => {
      const companyName = recipient.contact.companies[0]?.company.name || '';
      const variables = {
        ...recipient.contact,
        nome: recipient.contact.name,
        telefone: recipient.contact.phone || '',
        email: recipient.contact.email || '',
        empresa: companyName,
        cargo: recipient.contact.jobTitle || '',
      };
      return {
        ...recipient,
        renderedMessages: recipientMessageTemplates(recipient.messages, fallbackMessages).map((message) => ({
          ...message,
          content: renderCampaignContent(message.content, variables),
        })),
      };
    });
    return {
      ...this.withProgress(campaign, statusCounts),
      recipients,
      recipientsTruncated: campaign._count.recipients > recipients.length,
    };
  }

  async invalidWhatsappNumbersCsv(auth: AuthContext, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...this.scope(auth) },
      select: { id: true, name: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    const recipients = await this.db.campaignRecipient.findMany({
      where: {
        campaignId: campaign.id,
        status: 'SKIPPED',
        exclusionReason: INVALID_WHATSAPP_REASON,
      },
      select: {
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50_000,
    });

    const slug = campaignFilenamePart(campaign.name) || campaign.id;
    return {
      filename: `numeros-invalidos-${slug}.csv`,
      content: invalidWhatsappRecipientsCsv(recipients),
      count: recipients.length,
    };
  }

  async archive(auth: AuthContext, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        archivedAt: null,
        ...this.scope(auth),
      },
      select: { id: true, name: true, channel: true, status: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    const archivedAt = new Date();
    const activeStatuses = ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'];
    await this.db.$transaction([
      this.db.campaign.update({
        where: { id },
        data: {
          archivedAt,
          ...(activeStatuses.includes(campaign.status) ? { status: 'CANCELLED' } : {}),
        },
      }),
      this.db.campaignRecipient.updateMany({
        where: { campaignId: id, status: { in: ['PENDING', 'QUEUED'] } },
        data: { status: 'SKIPPED', exclusionReason: 'Campanha excluída' },
      }),
    ]);
    await this.audit(auth, 'campaign.archived', id, {
      name: campaign.name,
      channel: campaign.channel,
      previousStatus: campaign.status,
      archivedAt,
    });
    return { id, archivedAt };
  }

  async create(auth: AuthContext, input: CreateCampaignInput) {
    const userId = auth.userId;
    if (!userId) throw new BadRequestException('Campanha exige usuário');
    if (!input.name?.trim()) throw new BadRequestException('O título da campanha é obrigatório');
    const cadence = campaignCadenceSchema.parse(input.cadence || {});
    const channel = (input.channel || 'whatsapp').toUpperCase() as 'WHATSAPP' | 'EMAIL';
    if (channel === 'WHATSAPP' && !input.instanceId) throw new BadRequestException('Selecione um número de WhatsApp');
    if (channel === 'EMAIL' && !input.emailSubject?.trim()) throw new BadRequestException('Informe o assunto do e-mail');
    const bubbles = (input.bubbles || [])
      .map((bubble) => ({ ...bubble, content: bubble.content?.trim() }))
      .filter((bubble) => Boolean(bubble.content));
    if (input.audience?.source !== 'csv' && !bubbles.length) throw new BadRequestException('Informe ao menos uma mensagem');
    if (
      input.audience?.source === 'contacts'
      && !input.audience.contactIds?.length
      && !input.audience.contactSearches?.length
    ) throw new BadRequestException('Selecione ao menos um contato');
    if (input.audience?.source === 'csv' && !input.audience.csv) throw new BadRequestException('Selecione um arquivo CSV');

    if (channel === 'WHATSAPP') {
      const instance = await this.db.whatsappInstance.findFirst({
        where: { id: input.instanceId, organizationId: auth.organizationId, archivedAt: null, status: 'CONNECTED' },
        select: { id: true },
      });
      if (!instance) throw new BadRequestException('Selecione um número de WhatsApp conectado');
    }

    const mediaKeys = bubbles.map((bubble) => bubble.mediaKey).filter((key): key is string => Boolean(key));
    if (mediaKeys.length) {
      const media = await this.db.mediaAsset.findMany({ where: { key: { in: mediaKeys } }, select: { key: true } });
      if (media.length !== new Set(mediaKeys).size || media.some((item) => !item.key.startsWith(`${auth.organizationId}/`))) throw new BadRequestException('Uma ou mais mídias são inválidas');
    }

    const audience = await this.prepareAudience(auth, input);
    const sendingSchedule = campaignSendingSchedule(input);
    const campaign = await this.db.$transaction(async (tx) => {
      if (audience.newContacts.length) await tx.contact.createMany({ data: audience.newContacts });

      const created = await tx.campaign.create({ data: {
        organizationId: auth.organizationId, createdById: userId, name: input.name.trim(),
        channel, instanceId: input.instanceId, segmentId: input.segmentId,
        emailSubject: channel === 'EMAIL' ? input.emailSubject!.trim() : undefined,
        bubbleDelayMinSeconds: cadence.bubbleDelayMinSeconds, bubbleDelayMaxSeconds: cadence.bubbleDelayMaxSeconds,
        contactDelayMinSeconds: cadence.contactDelayMinSeconds, contactDelayMaxSeconds: cadence.contactDelayMaxSeconds,
        batchSize: cadence.batchSize, batchPauseMinSeconds: cadence.batchPauseMinSeconds, batchPauseMaxSeconds: cadence.batchPauseMaxSeconds,
        sendingWindowStart: sendingSchedule.start, sendingWindowEnd: sendingSchedule.end,
        sendingDays: sendingSchedule.days as Prisma.InputJsonValue,
        stats: {
          filters: input.filters || {},
          audienceSource: input.audience?.source || 'filters',
          ...(input.audience?.contactSearches?.length
            ? { audienceSearches: input.audience.contactSearches }
            : {}),
          audience: audience.recipients.length,
          ...(audience.csvPreview ? { csvInvalidRows: audience.csvPreview.invalid } : {}),
        } as Prisma.InputJsonValue,
        bubbles: { create: bubbles.map((bubble, position) => ({ position, type: bubble.type || 'text', content: bubble.content, mediaKey: bubble.mediaKey })) },
      }, include: { bubbles: true } });

      for (let index = 0; index < audience.recipients.length; index += RECIPIENT_INSERT_BATCH_SIZE) {
        const batch = audience.recipients.slice(index, index + RECIPIENT_INSERT_BATCH_SIZE);
        await tx.campaignRecipient.createMany({
          data: batch.map((recipient) => ({
            campaignId: created.id,
            contactId: recipient.contactId,
            messages: recipient.messages as Prisma.InputJsonValue,
          })),
        });
      }
      return created;
    }, { timeout: 60_000 });
    await this.audit(auth, 'campaign.created', campaign.id, { name: campaign.name, channel });
    return campaign;
  }

  async previewCsv(auth: AuthContext, instanceId: string, csv: string) {
    try {
      const parsed = parseCampaignCsv(csv);
      const instance = await this.db.whatsappInstance.findFirst({
        where: { id: instanceId, organizationId: auth.organizationId, archivedAt: null, status: 'CONNECTED' },
        select: { instanceKey: true },
      });
      if (!instance) throw new BadRequestException('Selecione um número de WhatsApp conectado');
      const checked = await this.evolution.checkWhatsappNumbers(instance.instanceKey, parsed.rows.map((row) => row.phone));
      const existsByPhone = new Map(checked.map((item) => [item.number, item.exists]));
      const rows = parsed.rows.map((row) => ({
        ...row,
        hasWhatsapp: existsByPhone.get(row.phone.replace(/\D/g, '')) === true,
      }));
      const whatsappErrors = rows
        .filter((row) => !row.hasWhatsapp)
        .map((row) => ({ row: row.row, error: 'Número não possui WhatsApp' }));
      return {
        ...parsed,
        rows,
        valid: rows.filter((row) => row.hasWhatsapp).length,
        invalid: parsed.errors.length + whatsappErrors.length,
        errors: [...parsed.errors, ...whatsappErrors],
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'CSV inválido');
    }
  }

  async preflight(auth: AuthContext, id: string) {
    const campaign = await this.getForAction(auth, id);
    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) throw new BadRequestException('Campanha não pode ser revalidada neste estado');
    const filters = ((campaign.stats as Record<string, unknown>)?.filters || {}) as Record<string, unknown>;
    const existingRecipientCount = await this.db.campaignRecipient.count({ where: { campaignId: id } });
    const storedRecipients = existingRecipientCount ? await this.db.campaignRecipient.findMany({
      where: { campaignId: id, status: { in: ['PENDING', 'SKIPPED'] } },
      select: {
        id: true,
        contact: {
          select: {
            id: true,
            phone: true,
            email: true,
            consentStatus: true,
            campaignsBlocked: true,
            suppressions: { select: { channel: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }) : [];
    const legacyContacts = existingRecipientCount ? [] : await this.resolveAudience(auth.organizationId, campaign.segmentId, filters);
    const recipients = existingRecipientCount
      ? storedRecipients.map((recipient) => ({ recipientId: recipient.id, contact: recipient.contact }))
      : legacyContacts.map((contact) => ({ recipientId: undefined as string | undefined, contact }));
    const seen = new Set<string>();
    const results: Array<{ recipientId?: string; contactId: string; phone?: string | null; status: 'PENDING' | 'SKIPPED'; reason?: string }> = [];
    const reasons: Record<string, number> = {};
    for (const { recipientId, contact } of recipients) {
      let reason: string | undefined;
      if (contact.campaignsBlocked) {
        reason = 'Campanhas bloqueadas para este contato';
      } else if (campaign.channel === 'WHATSAPP') {
        if (!contact.phone) reason = 'Telefone ausente';
        else if (contact.suppressions.some((item) => item.channel === 'WHATSAPP')) reason = 'Contato bloqueado ou descadastrado';
        else if (seen.has(contact.phone!)) reason = 'Telefone duplicado';
        if (contact.phone) seen.add(contact.phone);
      } else if (!contact.email) {
        reason = 'E-mail ausente';
      } else if (contact.suppressions.some((item) => item.channel === 'EMAIL')) {
        reason = 'Contato descadastrado do e-mail';
      } else {
        const emailKey = contact.email.toLowerCase();
        if (seen.has(emailKey)) reason = 'E-mail duplicado';
        seen.add(emailKey);
      }
      results.push({ recipientId, contactId: contact.id, phone: contact.phone, status: reason ? 'SKIPPED' : 'PENDING', reason });
    }

    const whatsappCandidates = results.filter((result) => result.status === 'PENDING' && result.phone);
    if (campaign.channel === 'WHATSAPP' && whatsappCandidates.length) {
      if (!campaign.instance || campaign.instance.status !== 'CONNECTED') throw new BadRequestException('O número de envio não está conectado');
      const checked = await this.evolution.checkWhatsappNumbers(campaign.instance.instanceKey, whatsappCandidates.map((result) => result.phone!));
      const existsByPhone = new Map(checked.map((result) => [result.number, result.exists]));
      for (const result of whatsappCandidates) {
        if (existsByPhone.get(result.phone!.replace(/\D/g, '')) !== true) {
          result.status = 'SKIPPED';
          result.reason = 'Número não possui WhatsApp';
        }
      }
    }

    const eligible = results.filter((result) => result.status === 'PENDING').length;
    const skipped = results.length - eligible;
    for (const result of results) {
      if (result.reason) reasons[result.reason] = (reasons[result.reason] || 0) + 1;
    }
    const verifiedAt = new Date();

    await this.db.$transaction(async (tx) => {
      if (!existingRecipientCount) {
        for (let index = 0; index < results.length; index += RECIPIENT_INSERT_BATCH_SIZE) {
          const batch = results.slice(index, index + RECIPIENT_INSERT_BATCH_SIZE);
          await tx.campaignRecipient.createMany({ data: batch.map((result) => ({
            campaignId: id,
            contactId: result.contactId,
            status: result.status,
            exclusionReason: result.reason,
            whatsappVerifiedAt: campaign.channel === 'WHATSAPP' && result.status === 'PENDING' ? verifiedAt : undefined,
          })) });
        }
      } else {
        const eligibleIds = results.filter((result) => result.status === 'PENDING').map((result) => result.recipientId!);
        if (eligibleIds.length) await tx.campaignRecipient.updateMany({
          where: { id: { in: eligibleIds } },
          data: { status: 'PENDING', exclusionReason: null, whatsappVerifiedAt: campaign.channel === 'WHATSAPP' ? verifiedAt : null },
        });
        const skippedByReason = new Map<string, string[]>();
        for (const result of results.filter((item) => item.status === 'SKIPPED')) {
          const reason = result.reason || 'Destinatário inválido';
          skippedByReason.set(reason, [...(skippedByReason.get(reason) || []), result.recipientId!]);
        }
        for (const [reason, recipientIds] of skippedByReason) {
          await tx.campaignRecipient.updateMany({
            where: { id: { in: recipientIds } },
            data: { status: 'SKIPPED', exclusionReason: reason, whatsappVerifiedAt: null },
          });
        }
      }
      await tx.campaign.update({ where: { id }, data: { stats: {
        ...(campaign.stats as Record<string, unknown>),
        filters,
        audience: existingRecipientCount || recipients.length,
        eligible,
        skipped,
        reasons,
        preflightAt: verifiedAt.toISOString(),
      } as Prisma.InputJsonValue } });
    }, { timeout: 60_000 });
    return { audience: existingRecipientCount || recipients.length, eligible, skipped, reasons };
  }

  async schedule(auth: AuthContext, id: string, scheduledAt?: string) {
    const campaign = await this.getForAction(auth, id);
    if (campaign.channel === 'EMAIL') {
      const provider = campaignEmailConfigurationStatus();
      if (!provider.configured) {
        throw new BadRequestException(`Gmail de campanhas não configurado. Preencha: ${provider.missing.join(', ')}`);
      }
    }
    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) throw new BadRequestException('Estado inválido para iniciar campanha');
    const validation = await this.preflight(auth, id);
    const eligible = validation.eligible;
    if (!eligible) throw new BadRequestException(
      campaign.channel === 'EMAIL'
        ? 'Nenhum contato válido com e-mail foi encontrado para iniciar a campanha'
        : 'Nenhum contato válido com WhatsApp foi encontrado para iniciar a campanha',
    );
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
    if (action === 'resume' && campaign.channel === 'EMAIL' && !campaignEmailConfigurationStatus().configured) {
      throw new BadRequestException('Gmail de campanhas não configurado');
    }
    const updated = await this.db.campaign.update({ where: { id }, data: { status: map[action] } });
    if (action === 'resume') await this.queue.add('dispatch-campaign', { campaignId: id }, { jobId: `campaign-${id}-resume-${Date.now()}`, removeOnComplete: 1000 });
    if (action === 'cancel') await this.db.campaignRecipient.updateMany({ where: { campaignId: id, status: { in: ['PENDING', 'QUEUED'] } }, data: { status: 'SKIPPED', exclusionReason: 'Campanha cancelada' } });
    await this.audit(auth, `campaign.${action}`, id, { previousStatus: campaign.status });
    return updated;
  }

  private async prepareAudience(auth: AuthContext, input: CreateCampaignInput) {
    const empty = {
      recipients: [] as Array<{ contactId: string; messages: Array<{ type: string; content: string }> }>,
      newContacts: [] as Prisma.ContactCreateManyInput[],
      csvPreview: undefined as ReturnType<typeof parseCampaignCsv> | undefined,
    };
    if (!input.audience) return empty;

    if (input.audience.source === 'contacts') {
      const contactIds = [...new Set(input.audience.contactIds || [])];
      const contactSearches = [...new Set(
        (input.audience.contactSearches || [])
          .filter((search): search is string => typeof search === 'string')
          .map((search) => search.trim())
          .slice(0, 20),
      )];
      const excludedContactIds = [...new Set(input.audience.excludedContactIds || [])];
      const explicitlySelected = contactIds.length
        ? await this.db.contact.findMany({
          where: {
            id: { in: contactIds },
            organizationId: auth.organizationId,
            archivedAt: null,
            ...scopedWhere(auth, 'contacts'),
          },
          select: { id: true },
        })
        : [];
      if (explicitlySelected.length !== contactIds.length) {
        throw new BadRequestException('Um ou mais contatos selecionados não estão disponíveis');
      }

      const selectsAllContacts = contactSearches.includes('');
      const selectionConditions: Prisma.ContactWhereInput[] = [
        ...(contactIds.length ? [{ id: { in: contactIds } }] : []),
        ...contactSearches
          .filter(Boolean)
          .map((search): Prisma.ContactWhereInput => ({
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          })),
      ];
      const contacts = await this.db.contact.findMany({
        where: {
          organizationId: auth.organizationId,
          archivedAt: null,
          ...scopedWhere(auth, 'contacts'),
          ...(excludedContactIds.length ? { id: { notIn: excludedContactIds } } : {}),
          ...(String(input.channel || 'whatsapp').toUpperCase() === 'EMAIL' ? { email: { not: null } } : {}),
          ...(!selectsAllContacts ? { OR: selectionConditions } : {}),
        },
        select: { id: true },
      });
      if (!contacts.length) throw new BadRequestException('A seleção não possui contatos disponíveis');
      return {
        ...empty,
        recipients: contacts.map(({ id: contactId }) => ({ contactId, messages: [] })),
      };
    }

    let csvPreview: ReturnType<typeof parseCampaignCsv>;
    try {
      csvPreview = parseCampaignCsv(input.audience.csv || '');
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'CSV inválido');
    }
    if (!csvPreview.rows.length) throw new BadRequestException('O CSV não possui nenhuma linha válida');

    const phoneKeys = csvPreview.rows.map((row) => normalizePhoneKey(row.phone)!);
    const scope = permissionScope(auth, 'contacts');
    const allExisting = await this.db.contact.findMany({
      where: { organizationId: auth.organizationId, archivedAt: null, phoneKey: { in: phoneKeys } },
      select: { id: true, phoneKey: true, ownerId: true, teamId: true },
    });
    const accessibleExisting = allExisting.filter((contact) =>
      scope === 'ALL'
      || (scope === 'TEAM' && Boolean(auth.teamId) && contact.teamId === auth.teamId)
      || (scope === 'OWN' && Boolean(auth.userId) && contact.ownerId === auth.userId));
    const accessibleIds = new Set(accessibleExisting.map((contact) => contact.id));
    const inaccessible = allExisting.filter((contact) => !accessibleIds.has(contact.id));
    if (inaccessible.length) {
      throw new BadRequestException(`${inaccessible.length} contato(s) do CSV pertencem a outra carteira ou equipe`);
    }

    const existingByPhone = new Map(accessibleExisting.map((contact) => [contact.phoneKey, contact]));
    const rowByContactId = new Map<string, CampaignCsvRow>();
    for (const row of csvPreview.rows) {
      const phoneKey = normalizePhoneKey(row.phone)!;
      const existing = existingByPhone.get(phoneKey);
      const contactId = existing?.id || randomUUID();
      rowByContactId.set(contactId, row);
      if (!existing) {
        empty.newContacts.push({
          id: contactId,
          organizationId: auth.organizationId,
          ownerId: auth.userId,
          teamId: auth.teamId,
          name: row.name,
          phone: row.phone,
          phoneKey,
          email: row.email,
          source: 'Campanha via CSV',
        });
      }
    }

    return {
      ...empty,
      csvPreview,
      recipients: [...rowByContactId.entries()].map(([contactId, row]) => ({
        contactId,
        messages: row.messages.map((content) => ({ type: 'text', content })),
      })),
    };
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
        campaignsBlocked: true,
        suppressions: { select: { channel: true } },
      },
      take: 50_000,
    });
  }

  private async getForAction(auth: AuthContext, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...this.scope(auth) },
      select: {
        id: true,
        channel: true,
        status: true,
        segmentId: true,
        stats: true,
        instance: { select: { instanceKey: true, status: true } },
      },
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

  private withProgress<T extends { id: string; stats: Prisma.JsonValue }>(campaign: T, rows: CampaignStatusCount[]) {
    const progress = campaignProgressFromStatusCounts(campaign.id, rows);
    return {
      ...campaign,
      progress,
      stats: {
        ...jsonRecord(campaign.stats),
        audience: progress.audience,
        sent: progress.sent,
        replied: progress.replied,
        pending: progress.remaining,
        failed: progress.failed,
        skipped: progress.skipped,
      },
    };
  }
}
