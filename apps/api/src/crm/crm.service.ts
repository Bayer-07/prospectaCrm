import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma, type Contact } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { companyInputSchema, contactInputSchema, normalizeCnpj, normalizePhoneKey, opportunityInputSchema, opportunityStatusForStage, taskInputSchema } from '@prospecta/contracts';
import type { AuthContext } from '../auth/types.js';
import { permissionScope, scopedWhere } from '../auth/data-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EXTERNAL_WEBHOOK_QUEUE } from '../queue/queue.module.js';
import { MediaService } from '../media/media.service.js';
import { FollowUpsService } from '../follow-ups/follow-ups.service.js';

function csvSeparatorCount(line: string, separator: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === separator) count += 1;
  }
  return count;
}

function csvDelimiter(csv: string) {
  const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  return [',', ';', '\t'].reduce((best, current) =>
    csvSeparatorCount(firstLine, current) > csvSeparatorCount(firstLine, best) ? current : best, ',');
}

function primitiveText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function importedContactPhone(value: unknown) {
  const raw = primitiveText(value).trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const international = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return normalizePhoneKey(international) || raw;
}

function csvImportError(error: unknown) {
  const issues = (error as { issues?: Array<{ path?: Array<string | number>; message?: string }> } | null)?.issues;
  if (Array.isArray(issues) && issues.length) {
    return issues.map((issue) => `${issue.path?.join('.') || 'campo'}: ${issue.message || 'valor inválido'}`).join('; ');
  }
  const response = (error as { getResponse?: () => unknown } | null)?.getResponse?.();
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const message = (response as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : 'Erro desconhecido';
}

type ContactListQuery = {
  cursor?: string;
  limit?: number;
  search?: string;
  consent?: string;
  emailOnly?: string;
  ownerId?: string;
  teamId?: string;
  tagId?: string;
  company?: string;
  hasPhone?: string;
  hasEmail?: string;
};

type OpportunityProposalInput = { type?: unknown; url?: unknown; mediaAssetId?: unknown };
type CsvImportInput = {
  entityType: 'companies' | 'contacts';
  csv: string;
  mapping: Record<string, string>;
  commit?: boolean;
};
type CsvImportResult = { row: number; status: string; id?: string; error?: string };

@Injectable()
export class CrmService {
  constructor(
    private readonly db: PrismaService,
    @Inject(EXTERNAL_WEBHOOK_QUEUE) private readonly externalWebhooks: Queue,
    private readonly media?: MediaService,
    private readonly followUps?: FollowUpsService,
  ) {}

  async dashboard(auth: AuthContext) {
    const opportunityScope = scopedWhere(auth, 'opportunities');
    const contactScope = scopedWhere(auth, 'contacts');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [openOpportunities, totalContacts, overdueTasks, conversations, won, stages, recentActivities, conversationMetrics, connectedInstances] = await Promise.all([
      this.db.opportunity.aggregate({ where: { organizationId: auth.organizationId, archivedAt: null, status: 'OPEN', ...opportunityScope }, _count: true, _sum: { valueCents: true } }),
      this.db.contact.count({ where: { organizationId: auth.organizationId, archivedAt: null, ...contactScope } }),
      this.db.task.count({ where: { organizationId: auth.organizationId, status: 'OPEN', dueAt: { lt: new Date() }, ...this.taskScope(auth) } }),
      this.db.conversation.count({ where: { organizationId: auth.organizationId, status: { in: ['WAITING', 'OPEN'] } } }),
      this.db.opportunity.aggregate({ where: { organizationId: auth.organizationId, status: 'WON', wonAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, ...opportunityScope }, _count: true, _sum: { valueCents: true } }),
      this.db.pipelineStage.findMany({
        where: { pipeline: { organizationId: auth.organizationId } }, orderBy: { position: 'asc' },
        include: { _count: { select: { opportunities: { where: { status: 'OPEN', archivedAt: null, ...opportunityScope } } } } },
      }),
      this.db.activity.findMany({ where: { user: { organizationId: auth.organizationId } }, include: { user: { select: { name: true } }, company: { select: { name: true } }, contact: { select: { name: true } }, opportunity: { select: { title: true } } }, orderBy: { occurredAt: 'desc' }, take: 4 }),
      this.db.$queryRaw<Array<{ total: number; responded: number; resolvedToday: number; averageMs: number | null }>>(Prisma.sql`
        SELECT
          COUNT(*)::integer AS "total",
          COUNT(*) FILTER (WHERE "firstResponseAt" IS NOT NULL)::integer AS "responded",
          COUNT(*) FILTER (WHERE "closedAt" >= ${today})::integer AS "resolvedToday",
          AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) * 1000)
            FILTER (WHERE "firstResponseAt" IS NOT NULL)::double precision AS "averageMs"
        FROM "Conversation"
        WHERE "organizationId" = ${auth.organizationId}::uuid
          AND ("createdAt" >= ${today} OR "closedAt" >= ${today})
      `),
      this.db.whatsappInstance.count({ where: { organizationId: auth.organizationId, status: 'CONNECTED' } }),
    ]);
    const conversationStats = conversationMetrics[0] || { total: 0, responded: 0, resolvedToday: 0, averageMs: null };
    return {
      openOpportunities: openOpportunities._count,
      pipelineValueCents: openOpportunities._sum.valueCents || 0,
      totalContacts, overdueTasks, openConversations: conversations,
      wonLast30Days: won._count, wonValueCents: won._sum.valueCents || 0,
      stageDistribution: stages.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color, count: stage._count.opportunities })),
      recentActivities: recentActivities.map((activity) => ({ id: activity.id, type: activity.type, title: activity.title, occurredAt: activity.occurredAt, userName: activity.user?.name, entityName: activity.company?.name || activity.contact?.name || activity.opportunity?.title })),
      inbox: {
        averageFirstResponseMinutes: conversationStats.averageMs === null ? null : Math.round(conversationStats.averageMs / 60_000),
        resolvedToday: conversationStats.resolvedToday,
        responseRate: conversationStats.total ? Math.round((conversationStats.responded / conversationStats.total) * 100) : 0,
        connectedInstances,
      },
    };
  }

  listCompanies(auth: AuthContext, query: {
    cursor?: string;
    limit?: number;
    search?: string;
    ownerId?: string;
    teamId?: string;
    sector?: string;
    size?: string;
    hasContacts?: string;
  }) {
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const ownerId = this.contactFilterId(query.ownerId, 'responsável');
    const teamId = this.contactFilterId(query.teamId, 'equipe');
    const sector = String(query.sector || '').trim().slice(0, 100);
    const size = String(query.size || '').trim().slice(0, 60);
    const hasContacts = this.booleanFilter(query.hasContacts, 'contatos');
    const filters: Prisma.CompanyWhereInput[] = [
      scopedWhere(auth, 'companies') as Prisma.CompanyWhereInput,
    ];
    if (ownerId) filters.push({ ownerId: ownerId === 'none' ? null : ownerId });
    if (teamId) filters.push({ teamId: teamId === 'none' ? null : teamId });
    if (sector) filters.push({ sector: { contains: sector, mode: 'insensitive' } });
    if (size) filters.push({ size: { contains: size, mode: 'insensitive' } });
    if (hasContacts !== undefined) {
      const activeContact = { contact: { archivedAt: null } };
      filters.push(hasContacts
        ? { contacts: { some: activeContact } }
        : { contacts: { none: activeContact } });
    }
    return this.db.company.findMany({
      where: {
        organizationId: auth.organizationId, archivedAt: null, AND: filters,
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { domain: { contains: query.search, mode: 'insensitive' } }, { cnpj: { contains: query.search } }] } : {}),
      },
      include: {
        owner: { select: { id: true, name: true } },
        team: { select: { id: true, name: true, color: true } },
        _count: {
          select: {
            contacts: { where: { contact: { archivedAt: null } } },
            opportunities: { where: { archivedAt: null } },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }).then((rows) => this.page(rows, limit));
  }

  async getCompany(auth: AuthContext, id: string) {
    const company = await this.db.company.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies') },
      include: {
        owner: { select: { id: true, name: true } }, team: true,
        contacts: { include: { contact: { include: { owner: { select: { id: true, name: true } } } } } },
        opportunities: { include: { stage: true, owner: { select: { id: true, name: true } } }, orderBy: { updatedAt: 'desc' } },
        tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { dueAt: 'asc' } },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        activities: { include: { user: { select: { id: true, name: true } } }, orderBy: { occurredAt: 'desc' }, take: 100 },
        tags: { include: { tag: true } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  async createCompany(auth: AuthContext, raw: unknown) {
    const input = this.parse(companyInputSchema, raw);
    if (auth.type === 'apiKey' && input.externalId) {
      const existing = await this.db.company.findUnique({ where: { organizationId_externalId: { organizationId: auth.organizationId, externalId: input.externalId } }, select: { id: true } });
      if (existing) return this.updateCompany(auth, existing.id, input);
    }
    const duplicate = input.cnpj || input.domain ? await this.db.company.findFirst({
      where: { organizationId: auth.organizationId, archivedAt: null, OR: [
        ...(input.cnpj ? [{ cnpj: this.normalizeCnpj(input.cnpj) }] : []),
        ...(input.domain ? [{ domain: input.domain }] : []),
      ] }, select: { id: true },
    }) : null;
    if (duplicate) throw new BadRequestException({ message: 'Possível empresa duplicada', duplicateId: duplicate.id });
    const company = await this.db.company.create({ data: {
      organizationId: auth.organizationId, ownerId: input.ownerId || auth.userId, teamId: input.teamId || auth.teamId,
      externalId: input.externalId, name: input.name, legalName: input.legalName,
      cnpj: input.cnpj ? this.normalizeCnpj(input.cnpj) : undefined, domain: input.domain, linkedinUrl: input.linkedinUrl,
      sector: input.sector, size: input.size, phone: input.phone, address: input.address as Prisma.InputJsonValue,
      customFields: input.customFields as Prisma.InputJsonValue,
    } });
    await this.activity(auth, 'company.created', 'Empresa criada', { companyId: company.id });
    await this.audit(auth, 'company.created', 'Company', company.id, null, company);
    return company;
  }

  async updateCompany(auth: AuthContext, id: string, raw: unknown) {
    const input = this.parse(companyInputSchema.partial(), raw);
    const before = await this.db.company.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies', 'write') } });
    if (!before) throw new NotFoundException('Empresa não encontrada');
    const { address, customFields, ...fields } = input;
    const company = await this.db.company.update({ where: { id }, data: {
      ...fields, ...(input.cnpj ? { cnpj: this.normalizeCnpj(input.cnpj) } : {}),
      ...(address ? { address: address as Prisma.InputJsonValue } : {}),
      ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}),
    } as Prisma.CompanyUncheckedUpdateInput });
    await this.audit(auth, 'company.updated', 'Company', id, before, company);
    return company;
  }

  async setCompanyLogo(auth: AuthContext, id: string, mediaAssetId: string) {
    if (!this.media) throw new ServiceUnavailableException('Armazenamento de logos indisponível');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaAssetId || '')) {
      throw new BadRequestException('Logo da empresa inválida');
    }
    const current = await this.db.company.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies', 'write') },
      select: { id: true, logoId: true },
    });
    if (!current) throw new NotFoundException('Empresa não encontrada');
    const asset = await this.media.confirmCompanyLogoAsset(auth, mediaAssetId, id);
    if (current.logoId === asset.id) return this.db.company.findUniqueOrThrow({ where: { id } });
    const company = await this.db.company.update({ where: { id }, data: { logoId: asset.id } });
    await this.audit(auth, 'company.logo_updated', 'Company', id, { logoId: current.logoId }, { logoId: asset.id });
    if (current.logoId) await this.media.deleteAsset(auth, current.logoId).catch(() => undefined);
    return company;
  }

  async removeCompanyLogo(auth: AuthContext, id: string) {
    const current = await this.db.company.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies', 'write') },
      select: { id: true, logoId: true },
    });
    if (!current) throw new NotFoundException('Empresa não encontrada');
    if (!current.logoId) return this.db.company.findUniqueOrThrow({ where: { id } });
    const company = await this.db.company.update({ where: { id }, data: { logoId: null } });
    await this.audit(auth, 'company.logo_removed', 'Company', id, { logoId: current.logoId }, { logoId: null });
    await this.media?.deleteAsset(auth, current.logoId).catch(() => undefined);
    return company;
  }

  async companyLogoUrl(auth: AuthContext, id: string) {
    const company = await this.db.company.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies') },
      select: { logoId: true },
    });
    if (!company?.logoId) throw new NotFoundException('Logo da empresa não encontrada');
    if (!this.media) throw new ServiceUnavailableException('Armazenamento de logos indisponível');
    return this.media.downloadUrl(auth, company.logoId);
  }

  async archiveCompany(auth: AuthContext, id: string) {
    const before = await this.db.company.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies', 'write') } });
    if (!before) throw new NotFoundException('Empresa não encontrada');
    const company = await this.db.company.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit(auth, 'company.archived', 'Company', id, before, company); return company;
  }

  listContacts(auth: AuthContext, query: ContactListQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const filters = this.contactFilters(auth, query);
    return this.db.contact.findMany({
      where: {
        organizationId: auth.organizationId, archivedAt: null, AND: filters,
        ...(query.consent ? { consentStatus: query.consent.toUpperCase() as never } : {}),
        ...(query.emailOnly === 'true' ? { email: { not: null } } : {}),
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] } : {}),
      },
      include: {
        owner: { select: { id: true, name: true } },
        team: { select: { id: true, name: true, color: true } },
        companies: {
          where: { isPrimary: true },
          select: { isPrimary: true, company: { select: { id: true, name: true } } },
        },
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }).then((rows) => this.page(rows, limit));
  }

  async getContact(auth: AuthContext, id: string) {
    const contact = await this.db.contact.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts') }, include: {
      companies: { include: { company: true } }, owner: { select: { id: true, name: true } }, team: true, tags: { include: { tag: true } },
      opportunities: {
        include: { opportunity: { include: { stage: true, owner: { select: { id: true, name: true } }, team: true } } },
        orderBy: { opportunity: { updatedAt: 'desc' } },
      },
      tasks: { orderBy: { dueAt: 'asc' } }, consentEvents: { orderBy: { occurredAt: 'desc' } }, conversations: { include: { instance: true }, orderBy: { lastMessageAt: 'desc' } },
    } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }

  async createContact(auth: AuthContext, raw: unknown) {
    const input = this.parse(contactInputSchema, raw);
    const phoneKey = normalizePhoneKey(input.phone);
    if (auth.type === 'apiKey' && input.externalId) {
      const existing = await this.db.contact.findUnique({ where: { organizationId_externalId: { organizationId: auth.organizationId, externalId: input.externalId } }, select: { id: true } });
      if (existing) return this.updateContact(auth, existing.id, input);
    }
    const phoneDuplicate = phoneKey ? await this.db.contact.findFirst({ where: {
      organizationId: auth.organizationId, archivedAt: null, phoneKey,
    }, select: { id: true } }) : null;
    if (phoneDuplicate) throw new BadRequestException({ message: 'Já existe um contato com este número', duplicateId: phoneDuplicate.id });
    const duplicate = input.email ? await this.db.contact.findFirst({ where: {
      organizationId: auth.organizationId, archivedAt: null,
      email: input.email.toLowerCase(),
    }, select: { id: true } }) : null;
    if (duplicate) throw new BadRequestException({ message: 'Possível contato duplicado', duplicateId: duplicate.id });
    let contact: Contact;
    try {
      contact = await this.db.$transaction(async (tx) => {
        const created = await tx.contact.create({ data: {
          organizationId: auth.organizationId, ownerId: input.ownerId || auth.userId, teamId: input.teamId || auth.teamId,
          primaryCompanyId: input.companyId, externalId: input.externalId, name: input.name,
          jobTitle: input.jobTitle, email: input.email?.toLowerCase(), phone: input.phone, phoneKey, source: input.source,
          consentStatus: input.consentStatus.toUpperCase() as never, consentSource: input.consentSource,
          consentEvidence: input.consentEvidence,
          consentGrantedAt: input.consentStatus === 'granted' ? new Date() : undefined,
          consentRevokedAt: input.consentStatus === 'revoked' ? new Date() : undefined,
          campaignsBlocked: input.campaignsBlocked ?? false,
          customFields: input.customFields as Prisma.InputJsonValue,
        } });
        if (input.companyId) await tx.contactCompany.create({ data: { contactId: created.id, companyId: input.companyId, isPrimary: true } });
        if (input.consentStatus !== 'unknown') await tx.consentEvent.create({ data: {
          contactId: created.id, status: input.consentStatus.toUpperCase() as never,
          source: input.consentSource || 'Cadastro manual', evidence: input.consentEvidence,
        } });
        return created;
      });
    } catch (error) {
      if (input.phone && this.isUniqueConstraint(error, 'phoneKey')) {
        throw new BadRequestException('Já existe um contato com este número');
      }
      throw error;
    }
    await this.audit(auth, 'contact.created', 'Contact', contact.id, null, contact);
    return contact;
  }

  async saveSharedContact(auth: AuthContext, raw: unknown) {
    const input = this.parse(contactInputSchema.pick({ name: true, phone: true }), raw);
    const phoneKey = normalizePhoneKey(input.phone);
    if (!phoneKey) throw new BadRequestException('O contato compartilhado não possui um telefone válido');
    const existing = await this.db.contact.findFirst({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        phoneKey,
        ...scopedWhere(auth, 'contacts', 'write'),
      },
    });
    if (existing) return existing;
    return this.createContact(auth, {
      name: input.name,
      phone: phoneKey,
      source: 'Contato compartilhado no WhatsApp',
      consentStatus: 'unknown',
    });
  }

  async updateContact(auth: AuthContext, id: string, raw: unknown) {
    const input = this.parse(contactInputSchema.partial(), raw);
    const phoneKey = normalizePhoneKey(input.phone);
    const before = await this.db.contact.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts', 'write') } });
    if (!before) throw new NotFoundException('Contato não encontrado');
    if (phoneKey) {
      const duplicate = await this.db.contact.findFirst({
        where: { organizationId: auth.organizationId, archivedAt: null, phoneKey, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new BadRequestException({ message: 'Já existe um contato com este número', duplicateId: duplicate.id });
    }
    const consentChanged = input.consentStatus && input.consentStatus.toUpperCase() !== before.consentStatus;
    let contact: Contact;
    try {
      contact = await this.db.$transaction(async (tx) => {
        const { companyId, customFields, consentStatus, ...fields } = input;
        const updated = await tx.contact.update({ where: { id }, data: {
          ...fields, email: input.email?.toLowerCase(),
          ...(input.phone ? { phoneKey } : {}),
          ...(companyId !== undefined ? { primaryCompanyId: companyId } : {}),
          ...(consentStatus ? { consentStatus: consentStatus.toUpperCase() as never } : {}),
          ...(consentStatus === 'granted' ? { consentGrantedAt: new Date(), consentRevokedAt: null } : {}),
          ...(consentStatus === 'revoked' ? { consentRevokedAt: new Date() } : {}),
          ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}),
        } as Prisma.ContactUncheckedUpdateInput });
        if (companyId !== undefined) {
          await tx.contactCompany.updateMany({ where: { contactId: id, isPrimary: true }, data: { isPrimary: false } });
          if (companyId) await tx.contactCompany.upsert({
            where: { contactId_companyId: { contactId: id, companyId } },
            update: { isPrimary: true }, create: { contactId: id, companyId, isPrimary: true },
          });
        }
        if (consentChanged) {
          await tx.consentEvent.create({ data: { contactId: id, status: input.consentStatus!.toUpperCase() as never, source: input.consentSource || 'Atualização manual', evidence: input.consentEvidence } });
          if (input.consentStatus === 'revoked') await tx.suppression.upsert({ where: { contactId_channel: { contactId: id, channel: 'WHATSAPP' } }, update: { reason: 'Consentimento revogado' }, create: { contactId: id, channel: 'WHATSAPP', reason: 'Consentimento revogado' } });
          if (input.consentStatus === 'granted') await tx.suppression.deleteMany({ where: { contactId: id, channel: 'WHATSAPP', reason: 'Consentimento revogado' } });
        }
        return updated;
      });
    } catch (error) {
      if (input.phone && this.isUniqueConstraint(error, 'phoneKey')) {
        throw new BadRequestException('Já existe um contato com este número');
      }
      throw error;
    }
    await this.audit(auth, 'contact.updated', 'Contact', id, before, contact);
    return contact;
  }

  async archiveContact(auth: AuthContext, id: string) {
    const before = await this.db.contact.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts', 'write') } });
    if (!before) throw new NotFoundException('Contato não encontrado');
    const contact = await this.db.contact.update({ where: { id }, data: { archivedAt: new Date(), phoneKey: null } });
    await this.audit(auth, 'contact.archived', 'Contact', id, before, contact); return contact;
  }

  async optOutContact(organizationId: string, contactId: string, reason: string, source = 'WhatsApp') {
    return this.db.$transaction(async (tx) => {
      const contact = await tx.contact.update({ where: { id: contactId }, data: { consentStatus: 'REVOKED', consentRevokedAt: new Date() } });
      await tx.consentEvent.create({ data: { contactId, status: 'REVOKED', source, evidence: reason } });
      await tx.suppression.upsert({ where: { contactId_channel: { contactId, channel: 'WHATSAPP' } }, update: { reason }, create: { contactId, channel: 'WHATSAPP', reason } });
      await tx.campaignRecipient.updateMany({ where: { contactId, status: { in: ['PENDING', 'QUEUED'] } }, data: { status: 'OPTED_OUT', exclusionReason: reason } });
      await tx.workflowEnrollment.updateMany({ where: { contactId, status: { in: ['ACTIVE', 'WAITING'] } }, data: { status: 'STOPPED', stopReason: reason, completedAt: new Date() } });
      return contact;
    });
  }

  async pipelines(auth: AuthContext) {
    return this.db.pipeline.findMany({
      where: { organizationId: auth.organizationId, isActive: true }, orderBy: { createdAt: 'asc' },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
  }

  async kanban(auth: AuthContext, pipelineId: string) {
    const pipeline = await this.db.pipeline.findFirst({ where: { id: pipelineId, organizationId: auth.organizationId }, include: { stages: { orderBy: { position: 'asc' } } } });
    if (!pipeline) throw new NotFoundException('Funil não encontrado');
    const opportunities = await this.db.opportunity.findMany({
      where: { organizationId: auth.organizationId, pipelineId, archivedAt: null, status: 'OPEN', ...scopedWhere(auth, 'opportunities') },
      select: {
        id: true, title: true, valueCents: true, probability: true, stageId: true, updatedAt: true,
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const opportunitiesByStage = new Map<string, typeof opportunities>();
    for (const opportunity of opportunities) {
      const items = opportunitiesByStage.get(opportunity.stageId);
      if (items) items.push(opportunity);
      else opportunitiesByStage.set(opportunity.stageId, [opportunity]);
    }
    return { ...pipeline, stages: pipeline.stages.map((stage) => ({ ...stage, opportunities: opportunitiesByStage.get(stage.id) || [] })) };
  }

  async createOpportunity(auth: AuthContext, raw: unknown) {
    const input = this.parse(opportunityInputSchema, raw);
    if (auth.type === 'apiKey' && input.externalId) {
      const existing = await this.db.opportunity.findUnique({ where: { organizationId_externalId: { organizationId: auth.organizationId, externalId: input.externalId } }, select: { id: true } });
      if (existing) return this.updateOpportunity(auth, existing.id, input);
    }
    const stage = await this.db.pipelineStage.findFirst({ where: { id: input.stageId, pipelineId: input.pipelineId, pipeline: { organizationId: auth.organizationId } } });
    if (!stage) throw new BadRequestException('Etapa inválida');
    const opportunity = await this.db.opportunity.create({ data: {
      organizationId: auth.organizationId, title: input.title, pipelineId: input.pipelineId, stageId: input.stageId,
      companyId: input.companyId, teamId: input.teamId || auth.teamId, ownerId: input.ownerId || auth.userId,
      externalId: input.externalId, valueCents: input.valueCents, probability: input.probability || stage.probability,
      expectedCloseAt: input.expectedCloseAt, source: input.source, customFields: input.customFields as Prisma.InputJsonValue,
      ...(input.contactId ? { contacts: { create: { contactId: input.contactId, isPrimary: true } } } : {}),
    } });
    await this.activity(auth, 'opportunity.created', 'Oportunidade criada', { opportunityId: opportunity.id, companyId: input.companyId });
    await this.audit(auth, 'opportunity.created', 'Opportunity', opportunity.id, null, opportunity);
    return opportunity;
  }

  listOpportunities(auth: AuthContext, query: { cursor?: string; limit?: number; search?: string }) {
    const limit = Math.min(query.limit || 25, 100);
    return this.db.opportunity.findMany({ where: { organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities'), ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}) }, include: { company: true, stage: true, pipeline: true, owner: { select: { id: true, name: true } }, contacts: { include: { contact: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) }).then((rows) => this.page(rows, limit));
  }

  async getOpportunity(auth: AuthContext, id: string) {
    const opportunity = await this.db.opportunity.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities') }, include: { company: true, pipeline: true, stage: true, owner: true, team: true, proposalAsset: { select: { id: true, filename: true, contentType: true, sizeBytes: true } }, contacts: { include: { contact: true } }, tasks: true, notes: true, activities: { orderBy: { occurredAt: 'desc' } }, tags: { include: { tag: true } } } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
    return opportunity;
  }

  async setOpportunityProposal(auth: AuthContext, id: string, raw: unknown) {
    const current = await this.db.opportunity.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities', 'write') },
      select: { id: true, companyId: true, proposalUrl: true, proposalAssetId: true },
    });
    if (!current) throw new NotFoundException('Oportunidade não encontrada');
    const { proposalUrl, proposalAssetId } = await this.opportunityProposalData(auth, current.id, raw);
    const opportunity = await this.db.opportunity.update({
      where: { id: current.id },
      data: { proposalUrl, proposalAssetId, proposalAddedAt: new Date() },
      include: { proposalAsset: { select: { id: true, filename: true, contentType: true, sizeBytes: true } } },
    });
    await this.audit(auth, 'opportunity.proposal_updated', 'Opportunity', id, {
      proposalUrl: current.proposalUrl,
      proposalAssetId: current.proposalAssetId,
    }, { proposalUrl, proposalAssetId });
    const proposalActivityTitle = current.proposalUrl || current.proposalAssetId ? 'Proposta atualizada' : 'Proposta adicionada';
    await this.activity(auth, 'opportunity.proposal_updated', proposalActivityTitle, { opportunityId: id, companyId: current.companyId || undefined });
    if (current.proposalAssetId && current.proposalAssetId !== proposalAssetId) {
      await this.media?.deleteAsset(auth, current.proposalAssetId).catch(() => undefined);
    }
    return opportunity;
  }

  async opportunityProposalFileUrl(auth: AuthContext, id: string) {
    const opportunity = await this.db.opportunity.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities') },
      select: { proposalAssetId: true },
    });
    if (!opportunity?.proposalAssetId) throw new NotFoundException('Arquivo da proposta não encontrado');
    if (!this.media) throw new ServiceUnavailableException('Armazenamento de propostas indisponível');
    return this.media.downloadUrl(auth, opportunity.proposalAssetId);
  }

  async opportunityProposalLink(auth: AuthContext, id: string) {
    const opportunity = await this.db.opportunity.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities') },
      select: { proposalUrl: true },
    });
    if (!opportunity?.proposalUrl) throw new NotFoundException('Link da proposta não encontrado');
    return opportunity.proposalUrl;
  }

  async updateOpportunity(auth: AuthContext, id: string, raw: unknown) {
    const input = this.parse(opportunityInputSchema.partial(), raw);
    const before = await this.db.opportunity.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities', 'write') } });
    if (!before) throw new NotFoundException('Oportunidade não encontrada');
    if (input.pipelineId || input.stageId) {
      const pipelineId = input.pipelineId || before.pipelineId;
      const stageId = input.stageId || before.stageId;
      const stage = await this.db.pipelineStage.findFirst({ where: { id: stageId, pipelineId, pipeline: { organizationId: auth.organizationId } }, select: { id: true } });
      if (!stage) throw new BadRequestException('Etapa inválida');
    }
    const { contactId, customFields, ...fields } = input;
    const opportunity = await this.db.opportunity.update({ where: { id }, data: { ...fields, ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}) } as Prisma.OpportunityUncheckedUpdateInput });
    if (contactId) await this.db.opportunityContact.upsert({ where: { opportunityId_contactId: { opportunityId: id, contactId } }, update: { isPrimary: true }, create: { opportunityId: id, contactId, isPrimary: true } });
    await this.audit(auth, 'opportunity.updated', 'Opportunity', id, before, opportunity); return opportunity;
  }

  async archiveOpportunity(auth: AuthContext, id: string) {
    const before = await this.db.opportunity.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities', 'write') } });
    if (!before) throw new NotFoundException('Oportunidade não encontrada');
    const opportunity = await this.db.opportunity.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit(auth, 'opportunity.archived', 'Opportunity', id, before, opportunity); return opportunity;
  }

  async moveOpportunity(auth: AuthContext, opportunityId: string, stageId: string, reason?: string) {
    const opportunity = await this.db.opportunity.findFirst({ where: { id: opportunityId, organizationId: auth.organizationId, ...scopedWhere(auth, 'opportunities', 'write') } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
    const stage = await this.db.pipelineStage.findFirst({ where: { id: stageId, pipelineId: opportunity.pipelineId } });
    if (!stage) throw new BadRequestException('Etapa não pertence ao funil');
    const status = opportunityStatusForStage(stage);
    const updated = await this.db.opportunity.update({ where: { id: opportunityId }, data: {
      stageId, probability: stage.probability, status,
      wonAt: stage.isWon ? new Date() : null, lostAt: stage.isLost ? new Date() : null,
      lossReason: stage.isLost ? reason : null,
    } });
    await this.activity(auth, 'opportunity.stage_changed', `Movida para ${stage.name}`, { opportunityId, details: { fromStageId: opportunity.stageId, toStageId: stageId, reason } });
    await this.audit(auth, 'opportunity.stage_changed', 'Opportunity', opportunityId, opportunity, updated);
    return updated;
  }

  async tasks(auth: AuthContext, query: { from?: string; to?: string; status?: string } = {}) {
    const { from, to } = this.taskDateRange(query);
    const normalizedStatus = this.taskStatus(query.status);
    return this.db.task.findMany({
      where: {
        organizationId: auth.organizationId,
        ...this.taskScope(auth),
        ...(from || to ? { dueAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
        ...(normalizedStatus && normalizedStatus !== 'ALL' ? { status: normalizedStatus as never } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
        followUp: { select: { id: true, conversationId: true, mode: true, status: true, scheduledAt: true, failureReason: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { status: 'asc' }], take: 2_000,
    });
  }

  async createTask(auth: AuthContext, raw: unknown) {
    const input = this.parse(taskInputSchema, raw);
    let createdById = auth.userId;
    let assigneeId = input.assigneeId || auth.userId;
    let teamId = auth.teamId;
    if (auth.type === 'apiKey') {
      if (!input.assigneeId) throw new BadRequestException('Informe o responsável pela tarefa');
      const assignee = await this.db.user.findFirst({
        where: { id: input.assigneeId, organizationId: auth.organizationId, status: 'ACTIVE' },
        select: { id: true, teamId: true },
      });
      if (!assignee) throw new BadRequestException('Responsável pela tarefa inválido');
      createdById = assignee.id;
      assigneeId = assignee.id;
      teamId = assignee.teamId;
    }
    if (!createdById || !assigneeId) throw new BadRequestException('Tarefa exige usuário');
    const task = await this.db.task.create({ data: {
      organizationId: auth.organizationId, teamId, createdById,
      title: input.title, description: input.description, dueAt: input.dueAt,
      priority: input.priority.toUpperCase() as never, assigneeId,
      contactId: input.contactId, companyId: input.companyId, opportunityId: input.opportunityId,
    } });
    await this.audit(auth, 'task.created', 'Task', task.id, null, task);
    return task;
  }

  async completeTask(auth: AuthContext, id: string) {
    const before = await this.db.task.findFirst({ where: { id, organizationId: auth.organizationId, ...this.taskScope(auth) }, include: { followUp: { select: { id: true } } } });
    if (!before) throw new NotFoundException('Tarefa não encontrada');
    if (before.followUp && this.followUps) return this.followUps.finishFromTask(auth, id, true);
    const task = await this.db.task.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    await this.audit(auth, 'task.completed', 'Task', id, before, task);
    return task;
  }

  async updateTask(auth: AuthContext, id: string, raw: unknown) {
    const input = this.parse(taskInputSchema.partial(), raw);
    const before = await this.db.task.findFirst({ where: { id, organizationId: auth.organizationId, ...this.taskScope(auth, 'write') }, include: { followUp: { select: { id: true } } } });
    if (!before) throw new NotFoundException('Tarefa não encontrada');
    if (before.followUp && this.followUps) {
      if (!input.dueAt || Object.keys(input).some((key) => key !== 'dueAt')) {
        throw new BadRequestException('Edite os detalhes pelo painel do follow-up automático');
      }
      return this.followUps.rescheduleFromTask(auth, id, input.dueAt);
    }
    const { priority, ...fields } = input;
    const task = await this.db.task.update({ where: { id }, data: { ...fields, ...(priority ? { priority: priority.toUpperCase() as never } : {}) } as Prisma.TaskUncheckedUpdateInput });
    await this.audit(auth, 'task.updated', 'Task', id, before, task);
    return task;
  }

  async cancelTask(auth: AuthContext, id: string) {
    const before = await this.db.task.findFirst({ where: { id, organizationId: auth.organizationId, ...this.taskScope(auth, 'write') }, include: { followUp: { select: { id: true } } } });
    if (!before) throw new NotFoundException('Tarefa não encontrada');
    if (before.followUp && this.followUps) return this.followUps.finishFromTask(auth, id, false);
    const task = await this.db.task.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit(auth, 'task.cancelled', 'Task', id, before, task);
    return task;
  }

  async metadata(auth: AuthContext) {
    const [users, teams, tags, segments, customFields] = await Promise.all([
      this.db.user.findMany({ where: { organizationId: auth.organizationId, status: 'ACTIVE' }, select: { id: true, name: true, teamId: true } }),
      this.db.team.findMany({ where: { organizationId: auth.organizationId } }),
      this.db.tag.findMany({ where: { organizationId: auth.organizationId } }),
      this.db.segment.findMany({ where: { organizationId: auth.organizationId } }),
      this.db.customFieldDefinition.findMany({ where: { organizationId: auth.organizationId }, orderBy: { position: 'asc' } }),
    ]);
    return { users, teams, tags, segments, customFields };
  }

  tags(auth: AuthContext) { return this.db.tag.findMany({ where: { organizationId: auth.organizationId }, orderBy: { name: 'asc' } }); }

  createTag(auth: AuthContext, input: { name: string; color?: string }) {
    if (!input.name?.trim()) throw new BadRequestException('Nome da tag é obrigatório');
    return this.db.tag.create({ data: { organizationId: auth.organizationId, name: input.name.trim(), color: input.color || '#64748b' } });
  }

  async updateTag(auth: AuthContext, id: string, input: { name?: string; color?: string }) {
    await this.assertOwnedResource('tag', auth.organizationId, id);
    return this.db.tag.update({ where: { id }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(input.color ? { color: input.color } : {}) } });
  }

  async deleteTag(auth: AuthContext, id: string) {
    await this.assertOwnedResource('tag', auth.organizationId, id);
    await this.db.tag.delete({ where: { id } }); return { deleted: true };
  }

  customFields(auth: AuthContext, entityType?: string) { return this.db.customFieldDefinition.findMany({ where: { organizationId: auth.organizationId, ...(entityType ? { entityType } : {}) }, orderBy: { position: 'asc' } }); }

  createCustomField(auth: AuthContext, input: { entityType: string; key: string; label: string; fieldType: string; options?: unknown[]; required?: boolean; position?: number }) {
    const entityTypes = ['company', 'contact', 'opportunity']; const fieldTypes = ['text', 'number', 'date', 'boolean', 'select', 'multiselect'];
    if (!entityTypes.includes(input.entityType) || !fieldTypes.includes(input.fieldType) || !/^[a-z][a-z0-9_]{1,40}$/.test(input.key)) throw new BadRequestException('Definição de campo inválida');
    return this.db.customFieldDefinition.create({ data: { organizationId: auth.organizationId, ...input, options: (input.options || []) as Prisma.InputJsonValue } });
  }

  async updateCustomField(auth: AuthContext, id: string, input: { label?: string; options?: unknown[]; required?: boolean; position?: number }) {
    await this.assertOwnedResource('customFieldDefinition', auth.organizationId, id);
    const { options, ...fields } = input;
    return this.db.customFieldDefinition.update({ where: { id }, data: { ...fields, ...(options ? { options: options as Prisma.InputJsonValue } : {}) } });
  }

  async deleteCustomField(auth: AuthContext, id: string) {
    await this.assertOwnedResource('customFieldDefinition', auth.organizationId, id);
    await this.db.customFieldDefinition.delete({ where: { id } }); return { deleted: true };
  }

  segments(auth: AuthContext) { return this.db.segment.findMany({ where: { organizationId: auth.organizationId }, include: { _count: { select: { members: true, campaigns: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }); }

  createSegment(auth: AuthContext, input: { name: string; description?: string; filters?: Record<string, unknown>; contactIds?: string[] }) {
    if (!input.name?.trim()) throw new BadRequestException('Nome do segmento é obrigatório');
    return this.db.segment.create({ data: { organizationId: auth.organizationId, name: input.name.trim(), description: input.description, isDynamic: !input.contactIds, filters: (input.filters || {}) as Prisma.InputJsonValue, ...(input.contactIds?.length ? { members: { create: input.contactIds.map((contactId) => ({ contactId })) } } : {}) }, include: { members: true } });
  }

  async updateSegment(auth: AuthContext, id: string, input: { name?: string; description?: string; filters?: Record<string, unknown>; contactIds?: string[] }) {
    await this.assertOwnedResource('segment', auth.organizationId, id);
    return this.db.$transaction(async (tx) => {
      const segment = await tx.segment.update({ where: { id }, data: { name: input.name?.trim(), description: input.description, ...(input.filters ? { filters: input.filters as Prisma.InputJsonValue } : {}), ...(input.contactIds ? { isDynamic: false } : {}) } });
      if (input.contactIds) { await tx.segmentMember.deleteMany({ where: { segmentId: id } }); if (input.contactIds.length) await tx.segmentMember.createMany({ data: [...new Set(input.contactIds)].map((contactId) => ({ segmentId: id, contactId })) }); }
      return segment;
    });
  }

  async deleteSegment(auth: AuthContext, id: string) {
    await this.assertOwnedResource('segment', auth.organizationId, id);
    await this.db.segment.delete({ where: { id } }); return { deleted: true };
  }

  async importCsv(auth: AuthContext, input: CsvImportInput) {
    const { parse } = await import('csv-parse/sync');
    if (!input.csv?.trim()) throw new BadRequestException('Selecione um arquivo CSV preenchido');
    const mapping = Object.entries(input.mapping || {}).filter(([source, target]) => source.trim() && target.trim());
    if (!mapping.length) throw new BadRequestException('Relacione ao menos uma coluna do arquivo');
    let rows: Record<string, string>[];
    try {
      rows = parse(input.csv, {
        bom: true,
        columns: true,
        delimiter: csvDelimiter(input.csv),
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch (error) {
      throw new BadRequestException(`Arquivo CSV inválido: ${csvImportError(error)}`);
    }
    if (!rows.length) throw new BadRequestException('O arquivo CSV não possui contatos para importar');
    if (rows.length > 10_000) throw new BadRequestException('O limite por importação é 10 mil linhas');
    const results: CsvImportResult[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      try {
        results.push(await this.importCsvRow(auth, input, mapping, rows[index], index + 2));
      } catch (error) {
        results.push({ row: index + 2, status: 'error', error: csvImportError(error) });
      }
    }
    const errors = results.filter((result) => result.status === 'error').length;
    const valid = results.length - errors;
    return { total: rows.length, valid, errors, results };
  }

  private taskScope(auth: AuthContext, action = 'read') {
    const scope = permissionScope(auth, 'tasks', action);
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') return auth.teamId ? { teamId: auth.teamId } : { id: '__none__' };
    return auth.userId ? { assigneeId: auth.userId } : { id: '__none__' };
  }

  private mappedImportData(mapping: Array<[string, string]>, row: Record<string, string>, entityType: CsvImportInput['entityType']) {
    const mapped = Object.fromEntries(mapping.flatMap(([source, target]) => {
      const value = row[source]?.trim();
      return value ? [[target, value]] : [];
    })) as Record<string, string>;
    if (entityType === 'contacts' && mapped.phone) mapped.phone = importedContactPhone(mapped.phone) || mapped.phone;
    return mapped;
  }

  private async importCsvRow(
    auth: AuthContext,
    input: CsvImportInput,
    mapping: Array<[string, string]>,
    row: Record<string, string>,
    rowNumber: number,
  ): Promise<CsvImportResult> {
    const data = this.mappedImportData(mapping, row, input.entityType);
    const parsed = input.entityType === 'companies' ? companyInputSchema.parse(data) : contactInputSchema.parse(data);
    if (!input.commit) return { row: rowNumber, status: 'valid' };
    const created = input.entityType === 'companies'
      ? await this.createCompany(auth, parsed)
      : await this.createContact(auth, parsed);
    return { row: rowNumber, status: 'created', id: created.id };
  }

  private taskDateRange(query: { from?: string; to?: string }) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && Number.isNaN(from.getTime())) throw new BadRequestException('Data inicial inválida');
    if (to && Number.isNaN(to.getTime())) throw new BadRequestException('Data final inválida');
    if (from && to && from >= to) throw new BadRequestException('O período da agenda é inválido');
    return { from, to };
  }

  private taskStatus(status?: string) {
    const normalized = status?.trim().toUpperCase();
    if (normalized && !['OPEN', 'COMPLETED', 'CANCELLED', 'ALL'].includes(normalized)) {
      throw new BadRequestException('Status de tarefa inválido');
    }
    return normalized;
  }

  private proposalLink(value: unknown) {
    const candidate = primitiveText(value).trim();
    if (!candidate || candidate.length > 2_048) throw new BadRequestException('Informe um link válido de até 2048 caracteres');
    try {
      const parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('invalid protocol');
      return parsed.toString();
    } catch {
      throw new BadRequestException('Informe um link HTTP ou HTTPS válido');
    }
  }

  private async proposalFile(auth: AuthContext, opportunityId: string, value: unknown) {
    const assetId = primitiveText(value).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
      throw new BadRequestException('Arquivo da proposta inválido');
    }
    if (!this.media) throw new ServiceUnavailableException('Armazenamento de propostas indisponível');
    await this.media.confirmOpportunityProposalAsset(auth, assetId, opportunityId);
    return assetId;
  }

  private async opportunityProposalData(auth: AuthContext, opportunityId: string, raw: unknown) {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Informe o tipo da proposta');
    const input = raw as OpportunityProposalInput;
    const type = primitiveText(input.type).trim().toUpperCase();
    if (type === 'LINK') return { proposalUrl: this.proposalLink(input.url), proposalAssetId: null };
    if (type === 'FILE') {
      return { proposalUrl: null, proposalAssetId: await this.proposalFile(auth, opportunityId, input.mediaAssetId) };
    }
    throw new BadRequestException('Selecione arquivo ou link para a proposta');
  }

  private contactFilters(auth: AuthContext, query: ContactListQuery) {
    const ownerId = this.contactFilterId(query.ownerId, 'responsável');
    const teamId = this.contactFilterId(query.teamId, 'equipe');
    const tagId = this.contactFilterId(query.tagId, 'tag', false);
    const company = primitiveText(query.company).trim().slice(0, 160);
    const hasPhone = this.booleanFilter(query.hasPhone, 'telefone');
    const hasEmail = this.booleanFilter(query.hasEmail, 'e-mail');
    const filters: Prisma.ContactWhereInput[] = [scopedWhere(auth, 'contacts') as Prisma.ContactWhereInput];
    if (ownerId) filters.push({ ownerId: ownerId === 'none' ? null : ownerId });
    if (teamId) filters.push({ teamId: teamId === 'none' ? null : teamId });
    if (tagId) filters.push({ tags: { some: { tagId } } });
    if (company) filters.push({ companies: { some: { isPrimary: true, company: { name: { contains: company, mode: 'insensitive' } } } } });
    if (hasPhone !== undefined) filters.push(hasPhone ? { phone: { not: null } } : { phone: null });
    if (hasEmail !== undefined) filters.push(hasEmail ? { email: { not: null } } : { email: null });
    return filters;
  }

  private async assertOwnedResource(model: 'tag' | 'customFieldDefinition' | 'segment', organizationId: string, id: string) {
    let resource: { id: string } | null;
    if (model === 'tag') {
      resource = await this.db.tag.findFirst({ where: { id, organizationId }, select: { id: true } });
    } else if (model === 'segment') {
      resource = await this.db.segment.findFirst({ where: { id, organizationId }, select: { id: true } });
    } else {
      resource = await this.db.customFieldDefinition.findFirst({ where: { id, organizationId }, select: { id: true } });
    }
    if (!resource) throw new NotFoundException('Recurso não encontrado');
  }

  private parse<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { flatten(): unknown } } }, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException({ message: 'Dados inválidos', details: result.error?.flatten() });
    return result.data as T;
  }

  private contactFilterId(value: string | undefined, label: string, allowNone = true) {
    const normalized = String(value || '').trim();
    if (!normalized) return undefined;
    if (allowNone && normalized === 'none') return normalized;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new BadRequestException(`Filtro de ${label} inválido`);
    }
    return normalized;
  }

  private booleanFilter(value: string | undefined, label: string) {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`Filtro de ${label} inválido`);
  }

  private page<T extends { id: string }>(rows: T[], limit: number) {
    const hasNext = rows.length > limit;
    if (hasNext) rows.pop();
    return { data: rows, meta: { count: rows.length, nextCursor: hasNext ? rows.at(-1)?.id : null } };
  }

  private normalizeCnpj(value: string) { return normalizeCnpj(value); }

  private activity(auth: AuthContext, type: string, title: string, values: { companyId?: string; contactId?: string; opportunityId?: string; details?: object }) {
    return this.db.activity.create({ data: { userId: auth.userId, type, title, ...values, details: (values.details ?? {}) as Prisma.InputJsonValue } });
  }

  private async audit(auth: AuthContext, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    const audit = await this.db.auditLog.create({ data: {
      organizationId: auth.organizationId, userId: auth.userId, action, entityType, entityId,
      before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue,
    } });
    const webhooks = await this.db.outboundWebhook.findMany({
      where: { organizationId: auth.organizationId, enabled: true },
      select: { id: true, events: true },
    });
    for (const webhook of webhooks) {
      const events = Array.isArray(webhook.events) ? webhook.events.map(String) : [];
      if (!events.includes('*') && !events.includes(action)) continue;
      const eventId = randomUUID();
      const delivery = await this.db.webhookDelivery.create({ data: {
        webhookId: webhook.id, eventId, eventType: action,
        payload: { entityType, entityId, before, after } as Prisma.InputJsonValue,
      } });
      await this.externalWebhooks.add('deliver-webhook', { deliveryId: delivery.id }, {
        jobId: `webhook-${delivery.id}`, attempts: 8, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1_000,
      });
    }
    return audit;
  }

  private isUniqueConstraint(error: unknown, field: string) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return false;
    const target = 'meta' in error && error.meta && typeof error.meta === 'object' && 'target' in error.meta
      ? error.meta.target
      : undefined;
    return Array.isArray(target) ? target.includes(field) : primitiveText(target).includes(field);
  }
}
