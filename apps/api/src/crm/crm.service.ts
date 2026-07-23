import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { companyInputSchema, contactInputSchema, normalizeCnpj, opportunityInputSchema, opportunityStatusForStage, taskInputSchema } from '@prospecta/contracts';
import type { AuthContext } from '../auth/types.js';
import { permissionScope, scopedWhere } from '../auth/data-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EXTERNAL_WEBHOOK_QUEUE } from '../queue/queue.module.js';

@Injectable()
export class CrmService {
  constructor(private readonly db: PrismaService, @Inject(EXTERNAL_WEBHOOK_QUEUE) private readonly externalWebhooks: Queue) {}

  async dashboard(auth: AuthContext) {
    const opportunityScope = scopedWhere(auth, 'opportunities');
    const contactScope = scopedWhere(auth, 'contacts');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [openOpportunities, totalContacts, overdueTasks, conversations, won, stages, recentActivities, conversationMetrics, connectedInstances] = await Promise.all([
      this.db.opportunity.aggregate({ where: { organizationId: auth.organizationId, archivedAt: null, status: 'OPEN', ...opportunityScope }, _count: true, _sum: { valueCents: true } }),
      this.db.contact.count({ where: { organizationId: auth.organizationId, archivedAt: null, ...contactScope } }),
      this.db.task.count({ where: { organizationId: auth.organizationId, status: 'OPEN', dueAt: { lt: new Date() }, ...this.taskScope(auth) } }),
      this.db.conversation.count({ where: { organizationId: auth.organizationId, status: { in: ['WAITING', 'OPEN'] } } }),
      this.db.opportunity.aggregate({ where: { organizationId: auth.organizationId, status: 'WON', wonAt: { gte: new Date(Date.now() - 30 * 86400_000) }, ...opportunityScope }, _count: true, _sum: { valueCents: true } }),
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

  listCompanies(auth: AuthContext, query: { cursor?: string; limit?: number; search?: string }) {
    const limit = Math.min(query.limit || 25, 100);
    return this.db.company.findMany({
      where: {
        organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies'),
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { domain: { contains: query.search, mode: 'insensitive' } }, { cnpj: { contains: query.search } }] } : {}),
      },
      include: { owner: { select: { id: true, name: true } }, team: true, _count: { select: { contacts: true, opportunities: true } } },
      orderBy: { updatedAt: 'desc' }, take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
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
      cnpj: input.cnpj ? this.normalizeCnpj(input.cnpj) : undefined, domain: input.domain,
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

  async archiveCompany(auth: AuthContext, id: string) {
    const before = await this.db.company.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies', 'write') } });
    if (!before) throw new NotFoundException('Empresa não encontrada');
    const company = await this.db.company.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit(auth, 'company.archived', 'Company', id, before, company); return company;
  }

  listContacts(auth: AuthContext, query: { cursor?: string; limit?: number; search?: string; consent?: string }) {
    const limit = Math.min(query.limit || 25, 100);
    return this.db.contact.findMany({
      where: {
        organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts'),
        ...(query.consent ? { consentStatus: query.consent.toUpperCase() as never } : {}),
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] } : {}),
      },
      include: { owner: { select: { id: true, name: true } }, team: true, companies: { where: { isPrimary: true }, include: { company: true } }, tags: { include: { tag: true } } },
      orderBy: { updatedAt: 'desc' }, take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
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
    if (!contact) throw new NotFoundException('Contato não encontrado'); return contact;
  }

  async createContact(auth: AuthContext, raw: unknown) {
    const input = this.parse(contactInputSchema, raw);
    if (auth.type === 'apiKey' && input.externalId) {
      const existing = await this.db.contact.findUnique({ where: { organizationId_externalId: { organizationId: auth.organizationId, externalId: input.externalId } }, select: { id: true } });
      if (existing) return this.updateContact(auth, existing.id, input);
    }
    const duplicate = input.phone || input.email ? await this.db.contact.findFirst({ where: {
      organizationId: auth.organizationId, archivedAt: null,
      OR: [...(input.phone ? [{ phone: input.phone }] : []), ...(input.email ? [{ email: input.email.toLowerCase() }] : [])],
    }, select: { id: true } }) : null;
    if (duplicate) throw new BadRequestException({ message: 'Possível contato duplicado', duplicateId: duplicate.id });
    const contact = await this.db.$transaction(async (tx) => {
      const created = await tx.contact.create({ data: {
        organizationId: auth.organizationId, ownerId: input.ownerId || auth.userId, teamId: input.teamId || auth.teamId,
        primaryCompanyId: input.companyId, externalId: input.externalId, name: input.name,
        jobTitle: input.jobTitle, email: input.email?.toLowerCase(), phone: input.phone, source: input.source,
        consentStatus: input.consentStatus.toUpperCase() as never, consentSource: input.consentSource,
        consentEvidence: input.consentEvidence,
        consentGrantedAt: input.consentStatus === 'granted' ? new Date() : undefined,
        consentRevokedAt: input.consentStatus === 'revoked' ? new Date() : undefined,
        customFields: input.customFields as Prisma.InputJsonValue,
      } });
      if (input.companyId) await tx.contactCompany.create({ data: { contactId: created.id, companyId: input.companyId, isPrimary: true } });
      if (input.consentStatus !== 'unknown') await tx.consentEvent.create({ data: {
        contactId: created.id, status: input.consentStatus.toUpperCase() as never,
        source: input.consentSource || 'Cadastro manual', evidence: input.consentEvidence,
      } });
      return created;
    });
    await this.audit(auth, 'contact.created', 'Contact', contact.id, null, contact);
    return contact;
  }

  async updateContact(auth: AuthContext, id: string, raw: unknown) {
    const input = this.parse(contactInputSchema.partial(), raw);
    const before = await this.db.contact.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts', 'write') } });
    if (!before) throw new NotFoundException('Contato não encontrado');
    const consentChanged = input.consentStatus && input.consentStatus.toUpperCase() !== before.consentStatus;
    const contact = await this.db.$transaction(async (tx) => {
      const { companyId, customFields, consentStatus, ...fields } = input;
      const updated = await tx.contact.update({ where: { id }, data: {
        ...fields, email: input.email?.toLowerCase(),
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
    await this.audit(auth, 'contact.updated', 'Contact', id, before, contact);
    return contact;
  }

  async archiveContact(auth: AuthContext, id: string) {
    const before = await this.db.contact.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts', 'write') } });
    if (!before) throw new NotFoundException('Contato não encontrado');
    const contact = await this.db.contact.update({ where: { id }, data: { archivedAt: new Date() } });
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
      include: { company: true, owner: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
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
    return opportunity;
  }

  listOpportunities(auth: AuthContext, query: { cursor?: string; limit?: number; search?: string }) {
    const limit = Math.min(query.limit || 25, 100);
    return this.db.opportunity.findMany({ where: { organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities'), ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}) }, include: { company: true, stage: true, pipeline: true, owner: { select: { id: true, name: true } }, contacts: { include: { contact: true } } }, orderBy: { updatedAt: 'desc' }, take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) }).then((rows) => this.page(rows, limit));
  }

  async getOpportunity(auth: AuthContext, id: string) {
    const opportunity = await this.db.opportunity.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities') }, include: { company: true, pipeline: true, stage: true, owner: true, team: true, contacts: { include: { contact: true } }, tasks: true, notes: true, activities: { orderBy: { occurredAt: 'desc' } }, tags: { include: { tag: true } } } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada'); return opportunity;
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

  async tasks(auth: AuthContext) {
    return this.db.task.findMany({
      where: { organizationId: auth.organizationId, ...this.taskScope(auth) },
      include: { assignee: { select: { id: true, name: true } }, company: { select: { id: true, name: true } }, contact: { select: { id: true, name: true } }, opportunity: { select: { id: true, title: true } } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 200,
    });
  }

  async createTask(auth: AuthContext, raw: unknown) {
    const input = this.parse(taskInputSchema, raw);
    if (!auth.userId) throw new BadRequestException('Tarefa exige usuário');
    return this.db.task.create({ data: {
      organizationId: auth.organizationId, teamId: auth.teamId, createdById: auth.userId,
      title: input.title, description: input.description, dueAt: input.dueAt,
      priority: input.priority.toUpperCase() as never, assigneeId: input.assigneeId || auth.userId,
      contactId: input.contactId, companyId: input.companyId, opportunityId: input.opportunityId,
    } });
  }

  async completeTask(auth: AuthContext, id: string) {
    const task = await this.db.task.findFirst({ where: { id, organizationId: auth.organizationId, ...this.taskScope(auth) }, select: { id: true } });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return this.db.task.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  }

  async updateTask(auth: AuthContext, id: string, raw: unknown) {
    const input = this.parse(taskInputSchema.partial(), raw);
    const task = await this.db.task.findFirst({ where: { id, organizationId: auth.organizationId, ...this.taskScope(auth, 'write') }, select: { id: true } });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    const { priority, ...fields } = input;
    return this.db.task.update({ where: { id }, data: { ...fields, ...(priority ? { priority: priority.toUpperCase() as never } : {}) } as Prisma.TaskUncheckedUpdateInput });
  }

  async cancelTask(auth: AuthContext, id: string) {
    const task = await this.db.task.findFirst({ where: { id, organizationId: auth.organizationId, ...this.taskScope(auth, 'write') }, select: { id: true } });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return this.db.task.update({ where: { id }, data: { status: 'CANCELLED' } });
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

  segments(auth: AuthContext) { return this.db.segment.findMany({ where: { organizationId: auth.organizationId }, include: { _count: { select: { members: true, campaigns: true } } }, orderBy: { updatedAt: 'desc' } }); }

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

  async importCsv(auth: AuthContext, input: { entityType: 'companies' | 'contacts'; csv: string; mapping: Record<string, string>; commit?: boolean }) {
    const { parse } = await import('csv-parse/sync');
    const rows = parse(input.csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    if (rows.length > 10_000) throw new BadRequestException('O limite por importação é 10 mil linhas');
    const results: Array<{ row: number; status: string; id?: string; error?: string }> = [];
    let valid = 0;
    let errors = 0;
    const mapping = Object.entries(input.mapping);
    for (let index = 0; index < rows.length; index += 1) {
      const item = {
        row: index + 2,
        data: Object.fromEntries(mapping.map(([source, target]) => [target, rows[index][source]])),
      };
      try {
        const parsed = input.entityType === 'companies' ? companyInputSchema.parse(item.data) : contactInputSchema.parse(item.data);
        if (!input.commit) results.push({ row: item.row, status: 'valid' });
        else {
          const created = input.entityType === 'companies' ? await this.createCompany(auth, parsed) : await this.createContact(auth, parsed);
          results.push({ row: item.row, status: 'created', id: created.id });
        }
        valid += 1;
      } catch (error) {
        errors += 1;
        results.push({ row: item.row, status: 'error', error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }
    return { total: rows.length, valid, errors, results };
  }

  private taskScope(auth: AuthContext, action = 'read') {
    const scope = permissionScope(auth, 'tasks', action);
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') return auth.teamId ? { teamId: auth.teamId } : { id: '__none__' };
    return auth.userId ? { assigneeId: auth.userId } : { id: '__none__' };
  }

  private async assertOwnedResource(model: 'tag' | 'customFieldDefinition' | 'segment', organizationId: string, id: string) {
    const resource = model === 'tag'
      ? await this.db.tag.findFirst({ where: { id, organizationId }, select: { id: true } })
      : model === 'segment'
        ? await this.db.segment.findFirst({ where: { id, organizationId }, select: { id: true } })
        : await this.db.customFieldDefinition.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
  }

  private parse<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { flatten(): unknown } } }, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException({ message: 'Dados inválidos', details: result.error?.flatten() });
    return result.data as T;
  }

  private page<T extends { id: string }>(rows: T[], limit: number) {
    const hasNext = rows.length > limit;
    if (hasNext) rows.pop();
    return { data: rows, meta: { count: rows.length, nextCursor: hasNext ? rows.at(-1)?.id : null } };
  }

  private normalizeCnpj(value: string) { return normalizeCnpj(value); }

  private activity(auth: AuthContext, type: string, title: string, values: { companyId?: string; contactId?: string; opportunityId?: string; details?: object }) {
    return this.db.activity.create({ data: { userId: auth.userId, type, title, ...values, details: (values.details || {}) as Prisma.InputJsonValue } });
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
}
