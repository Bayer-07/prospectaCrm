import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, ActivityDirection, ActivityOrigin, ActivityStatus, Prisma } from '@prisma/client';
import { activityInputSchema, type ActivityInput } from '@prospecta/contracts';
import { authTeamIds, permissionScope, scopedWhere } from '../auth/data-scope.js';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

export type ActivityListQuery = {
  cursor?: string;
  limit?: number;
  search?: string;
  category?: string;
  origin?: string;
  status?: string;
  outcome?: string;
  userId?: string;
  teamId?: string;
  companyId?: string;
  contactId?: string;
  opportunityId?: string;
  from?: string;
  to?: string;
};

const ACTIVITY_INCLUDE = {
  user: { select: { id: true, name: true } },
  team: { select: { id: true, name: true, color: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true, phone: true } },
  opportunity: { select: { id: true, title: true } },
} satisfies Prisma.ActivityInclude;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly db: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  activityScope(auth: AuthContext, action = 'read'): Prisma.ActivityWhereInput {
    const scope = permissionScope(auth, 'activities', action);
    let activityWhere: Prisma.ActivityWhereInput = {};
    if (scope === 'TEAM') {
      const teamIds = authTeamIds(auth);
      activityWhere = teamIds.length ? { teamId: { in: teamIds } } : { id: '__none__' };
    }
    if (scope === 'OWN') activityWhere = auth.userId ? { userId: auth.userId } : { id: '__none__' };
    return {
      AND: [
        activityWhere,
        { OR: [{ companyId: null }, { company: { is: scopedWhere(auth, 'companies') } }] },
        { OR: [{ contactId: null }, { contact: { is: scopedWhere(auth, 'contacts') } }] },
        { OR: [{ opportunityId: null }, { opportunity: { is: scopedWhere(auth, 'opportunities') } }] },
      ],
    };
  }

  async list(auth: AuthContext, query: ActivityListQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    const where = this.listWhere(auth, query);
    const rows = await this.db.activity.findMany({
      where,
      include: ACTIVITY_INCLUDE,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: this.uuid(query.cursor, 'cursor') }, skip: 1 } : {}),
    });
    const hasNext = rows.length > limit;
    if (hasNext) rows.pop();
    return { data: rows, meta: { count: rows.length, nextCursor: hasNext ? rows.at(-1)?.id || null : null } };
  }

  async get(auth: AuthContext, id: string) {
    const activity = await this.db.activity.findFirst({
      where: { id: this.uuid(id, 'atividade'), organizationId: auth.organizationId, deletedAt: null, ...this.activityScope(auth) },
      include: ACTIVITY_INCLUDE,
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada');
    return activity;
  }

  async create(auth: AuthContext, raw: unknown) {
    if (!auth.userId) throw new BadRequestException('O registro manual exige um usuário autenticado');
    const userId = auth.userId;
    const input = this.parse(raw);
    const associations = await this.resolveAssociations(auth, input);
    const created = await this.db.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          organizationId: auth.organizationId,
          teamId: associations.teamId,
          userId,
          companyId: associations.companyId,
          contactId: associations.contactId,
          opportunityId: associations.opportunityId,
          category: input.category.toUpperCase() as ActivityCategory,
          origin: ActivityOrigin.MANUAL,
          status: ActivityStatus.COMPLETED,
          direction: input.direction ? input.direction.toUpperCase() as ActivityDirection : input.category === 'call' ? ActivityDirection.OUTBOUND : undefined,
          type: `${input.category}.logged`,
          title: input.title,
          body: input.body,
          outcome: input.outcome,
          durationSeconds: input.durationSeconds,
          occurredAt: input.occurredAt,
          completedAt: input.occurredAt,
          details: {},
        },
      });
      if (input.followUp) {
        const task = await tx.task.create({
          data: {
            organizationId: auth.organizationId,
            teamId: associations.teamId,
            assigneeId: userId,
            createdById: userId,
            companyId: associations.companyId,
            contactId: associations.contactId,
            opportunityId: associations.opportunityId,
            title: input.followUp.title,
            dueAt: input.followUp.dueAt,
            priority: input.followUp.priority.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH',
          },
        });
        await tx.activity.create({
          data: {
            organizationId: auth.organizationId,
            teamId: associations.teamId,
            userId,
            companyId: associations.companyId,
            contactId: associations.contactId,
            opportunityId: associations.opportunityId,
            category: ActivityCategory.TASK,
            origin: ActivityOrigin.MANUAL,
            status: ActivityStatus.SCHEDULED,
            type: 'task',
            title: task.title,
            sourceType: 'TASK',
            sourceId: task.id,
            occurredAt: task.createdAt,
            scheduledAt: task.dueAt,
          },
        });
      }
      await tx.auditLog.create({ data: {
        organizationId: auth.organizationId,
        userId,
        action: 'activity.created',
        entityType: 'Activity',
        entityId: activity.id,
        after: activity as unknown as Prisma.InputJsonValue,
      } });
      return activity;
    });
    this.notify(auth.organizationId, created.id);
    return this.get(auth, created.id);
  }

  async update(auth: AuthContext, id: string, raw: unknown) {
    const current = await this.editable(auth, id);
    const input = this.parse({
      category: current.category.toLowerCase(),
      title: current.title,
      body: current.body || undefined,
      direction: current.direction?.toLowerCase(),
      outcome: current.outcome || undefined,
      durationSeconds: current.durationSeconds,
      occurredAt: current.occurredAt,
      companyId: current.companyId,
      contactId: current.contactId,
      opportunityId: current.opportunityId,
      ...(raw && typeof raw === 'object' ? raw : {}),
    });
    const associations = await this.resolveAssociations(auth, input);
    const updated = await this.db.$transaction(async (tx) => {
      const activity = await tx.activity.update({ where: { id: current.id }, data: {
        teamId: associations.teamId,
        companyId: associations.companyId,
        contactId: associations.contactId,
        opportunityId: associations.opportunityId,
        category: input.category.toUpperCase() as ActivityCategory,
        direction: input.direction ? input.direction.toUpperCase() as ActivityDirection : null,
        title: input.title,
        body: input.body || null,
        outcome: input.outcome || null,
        durationSeconds: input.durationSeconds,
        occurredAt: input.occurredAt,
        completedAt: input.occurredAt,
      } });
      await tx.auditLog.create({ data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: 'activity.updated',
        entityType: 'Activity',
        entityId: activity.id,
        before: current as unknown as Prisma.InputJsonValue,
        after: activity as unknown as Prisma.InputJsonValue,
      } });
      return activity;
    });
    this.notify(auth.organizationId, updated.id);
    return this.get(auth, updated.id);
  }

  async remove(auth: AuthContext, id: string) {
    const current = await this.editable(auth, id);
    const deletedAt = new Date();
    await this.db.$transaction([
      this.db.activity.update({ where: { id: current.id }, data: { deletedAt } }),
      this.db.auditLog.create({ data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: 'activity.deleted',
        entityType: 'Activity',
        entityId: current.id,
        before: current as unknown as Prisma.InputJsonValue,
        after: { deletedAt: deletedAt.toISOString() },
      } }),
    ]);
    this.notify(auth.organizationId, current.id);
    return { id: current.id, deletedAt };
  }

  async summary(auth: AuthContext, from = new Date(Date.now() - 30 * 86_400_000), to = new Date()) {
    const where: Prisma.ActivityWhereInput = {
      organizationId: auth.organizationId,
      deletedAt: null,
      occurredAt: { gte: from, lte: to },
      category: { not: ActivityCategory.SYSTEM },
      ...this.activityScope(auth),
    };
    const [groups, callsConnected, byUsers, series] = await Promise.all([
      this.db.activity.groupBy({ by: ['category', 'origin', 'status'], where, _count: { _all: true } }),
      this.db.activity.count({ where: { ...where, category: ActivityCategory.CALL, outcome: 'connected' } }),
      this.db.activity.groupBy({ by: ['userId'], where: { ...where, userId: { not: null }, origin: { in: [ActivityOrigin.MANUAL, ActivityOrigin.INBOX] } }, _count: { _all: true } }),
      this.activitySeries(auth, from, to),
    ]);
    const users = byUsers.length ? await this.db.user.findMany({
      where: { id: { in: byUsers.flatMap((item) => item.userId ? [item.userId] : []) }, organizationId: auth.organizationId },
      select: { id: true, name: true },
    }) : [];
    const userNames = new Map(users.map((user) => [user.id, user.name]));
    const count = (category: ActivityCategory, status?: ActivityStatus) => groups
      .filter((item) => item.category === category && (!status || item.status === status))
      .reduce((total, item) => total + item._count._all, 0);
    const calls = count(ActivityCategory.CALL);
    return {
      period: { from, to },
      totals: {
        calls,
        connectedCalls: callsConnected,
        connectionRate: calls ? Math.round((callsConnected / calls) * 100) : 0,
        whatsapp: count(ActivityCategory.WHATSAPP),
        emails: count(ActivityCategory.EMAIL),
        meetings: count(ActivityCategory.MEETING),
        notes: count(ActivityCategory.NOTE),
        completedTasks: count(ActivityCategory.TASK, ActivityStatus.COMPLETED),
      },
      origins: Object.fromEntries(Object.values(ActivityOrigin).map((origin) => [origin.toLowerCase(), groups.filter((item) => item.origin === origin).reduce((total, item) => total + item._count._all, 0)])),
      series,
      byUser: byUsers.map((item) => ({ userId: item.userId, userName: item.userId ? userNames.get(item.userId) || 'Usuário' : 'Automação', count: item._count._all })).sort((a, b) => b.count - a.count),
    };
  }

  private async editable(auth: AuthContext, id: string) {
    const activity = await this.db.activity.findFirst({ where: {
      id: this.uuid(id, 'atividade'),
      organizationId: auth.organizationId,
      deletedAt: null,
      ...this.activityScope(auth, 'write'),
    } });
    if (!activity) throw new NotFoundException('Atividade não encontrada');
    if (activity.origin !== ActivityOrigin.MANUAL || activity.sourceType) throw new ForbiddenException('Atividades automáticas não podem ser alteradas');
    return activity;
  }

  private listWhere(auth: AuthContext, query: ActivityListQuery): Prisma.ActivityWhereInput {
    const category = this.enumValue(ActivityCategory, query.category, 'categoria');
    const origin = this.enumValue(ActivityOrigin, query.origin, 'origem');
    const status = this.enumValue(ActivityStatus, query.status, 'status');
    const from = this.date(query.from, 'data inicial');
    const to = this.date(query.to, 'data final');
    const search = String(query.search || '').trim().slice(0, 160);
    return {
      organizationId: auth.organizationId,
      deletedAt: null,
      ...this.activityScope(auth),
      ...(category ? { category } : {}),
      ...(origin ? { origin } : {}),
      ...(status ? { status } : {}),
      ...(query.outcome ? { outcome: String(query.outcome).trim().slice(0, 80) } : {}),
      ...(query.userId ? { userId: this.uuid(query.userId, 'usuário') } : {}),
      ...(query.teamId ? { teamId: this.uuid(query.teamId, 'equipe') } : {}),
      ...(query.companyId ? { companyId: this.uuid(query.companyId, 'empresa') } : {}),
      ...(query.contactId ? { contactId: this.uuid(query.contactId, 'contato') } : {}),
      ...(query.opportunityId ? { opportunityId: this.uuid(query.opportunityId, 'oportunidade') } : {}),
      ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { body: { contains: search, mode: 'insensitive' } }] } : {}),
    };
  }

  private async resolveAssociations(auth: AuthContext, input: ActivityInput) {
    const [company, contact, opportunity] = await Promise.all([
      input.companyId ? this.db.company.findFirst({ where: { id: input.companyId, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies') }, select: { id: true, teamId: true } }) : null,
      input.contactId ? this.db.contact.findFirst({ where: { id: input.contactId, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'contacts') }, select: { id: true, teamId: true, primaryCompanyId: true } }) : null,
      input.opportunityId ? this.db.opportunity.findFirst({ where: { id: input.opportunityId, organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'opportunities') }, select: { id: true, teamId: true, companyId: true } }) : null,
    ]);
    if (input.companyId && !company) throw new NotFoundException('Empresa não encontrada');
    if (input.contactId && !contact) throw new NotFoundException('Contato não encontrado');
    if (input.opportunityId && !opportunity) throw new NotFoundException('Oportunidade não encontrada');
    if (company && opportunity?.companyId && company.id !== opportunity.companyId) throw new BadRequestException('A oportunidade não pertence à empresa informada');
    const inferredCompanyId = opportunity?.companyId || contact?.primaryCompanyId || null;
    const inferredCompany = !company && inferredCompanyId ? await this.db.company.findFirst({
      where: { id: inferredCompanyId, organizationId: auth.organizationId, ...scopedWhere(auth, 'companies') },
      select: { id: true },
    }) : null;
    const companyId = company?.id || inferredCompany?.id || null;
    return {
      companyId,
      contactId: contact?.id || null,
      opportunityId: opportunity?.id || null,
      teamId: opportunity?.teamId || contact?.teamId || company?.teamId || auth.teamId || await this.defaultTeamId(auth.organizationId),
    };
  }

  private async activitySeries(auth: AuthContext, from: Date, to: Date) {
    const scope = permissionScope(auth, 'activities');
    let scopeSql = Prisma.sql`TRUE`;
    if (scope === 'OWN') scopeSql = auth.userId ? Prisma.sql`activity."userId" = ${auth.userId}::uuid` : Prisma.sql`FALSE`;
    if (scope === 'TEAM') {
      const teams = authTeamIds(auth);
      scopeSql = teams.length ? Prisma.sql`activity."teamId" IN (${Prisma.join(teams.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.sql`FALSE`;
    }
    const associationSql = Prisma.join([
      this.associationSql(auth, 'Company', 'companyId', 'companies'),
      this.associationSql(auth, 'Contact', 'contactId', 'contacts'),
      this.associationSql(auth, 'Opportunity', 'opportunityId', 'opportunities'),
    ], ' AND ');
    const rows = await this.db.$queryRaw<Array<{ date: Date; category: string; count: number }>>(Prisma.sql`
      SELECT date_trunc('day', activity."occurredAt") AS "date", activity."category"::text AS "category", COUNT(*)::integer AS "count"
      FROM "Activity" AS activity
      WHERE activity."organizationId" = ${auth.organizationId}::uuid
        AND activity."deletedAt" IS NULL
        AND activity."category" <> 'SYSTEM'
        AND activity."occurredAt" >= ${from}
        AND activity."occurredAt" <= ${to}
        AND ${scopeSql}
        AND ${associationSql}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `);
    return rows.map((row) => ({ date: row.date.toISOString(), category: row.category.toLowerCase(), count: row.count }));
  }

  private associationSql(auth: AuthContext, table: 'Company' | 'Contact' | 'Opportunity', foreignKey: 'companyId' | 'contactId' | 'opportunityId', resource: 'companies' | 'contacts' | 'opportunities') {
    const scope = permissionScope(auth, resource);
    if (scope === 'ALL') return Prisma.sql`TRUE`;
    const reference = Prisma.raw(`activity."${foreignKey}"`);
    const tableName = Prisma.raw(`"${table}"`);
    if (scope === 'TEAM') {
      const teamIds = authTeamIds(auth);
      if (!teamIds.length) return Prisma.sql`${reference} IS NULL`;
      return Prisma.sql`(${reference} IS NULL OR EXISTS (
        SELECT 1 FROM ${tableName} AS linked
        WHERE linked."id" = ${reference}
          AND linked."teamId" IN (${Prisma.join(teamIds.map((id) => Prisma.sql`${id}::uuid`))})
      ))`;
    }
    if (!auth.userId) return Prisma.sql`${reference} IS NULL`;
    return Prisma.sql`(${reference} IS NULL OR EXISTS (
      SELECT 1 FROM ${tableName} AS linked
      WHERE linked."id" = ${reference}
        AND linked."ownerId" = ${auth.userId}::uuid
    ))`;
  }

  private parse(value: unknown) {
    const result = activityInputSchema.safeParse(value);
    if (!result.success) throw new BadRequestException({ message: 'Dados inválidos', details: result.error.flatten() });
    return result.data;
  }

  private enumValue<T extends Record<string, string>>(values: T, raw: string | undefined, label: string): T[keyof T] | undefined {
    if (!raw) return undefined;
    const value = raw.trim().toUpperCase();
    if (!Object.values(values).includes(value)) throw new BadRequestException(`Filtro de ${label} inválido`);
    return value as T[keyof T];
  }

  private date(raw: string | undefined, label: string) {
    if (!raw) return undefined;
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) throw new BadRequestException(`${label} inválida`);
    return value;
  }

  private uuid(value: string, label: string) {
    if (!UUID.test(value)) throw new BadRequestException(`${label} inválido`);
    return value;
  }

  private async defaultTeamId(organizationId: string) {
    const team = await this.db.team.findFirst({ where: { organizationId, isDefault: true }, select: { id: true } });
    if (!team) throw new BadRequestException('A equipe Geral não está configurada');
    return team.id;
  }

  private notify(organizationId: string, activityId: string) {
    this.realtime.notifyOrganization(organizationId, 'activities.updated', { activityId });
  }
}
