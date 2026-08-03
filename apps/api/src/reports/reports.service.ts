import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { sgaProspectingEmailTemplates } from '@prospecta/contracts';
import type { AuthContext } from '../auth/types.js';
import { scopedWhere } from '../auth/data-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { encryptSecret } from '../common/encryption.js';
import { campaignEmailConfigurationStatus } from '../email/campaign-email-config.js';
import { buildReportPdf } from './report-pdf.js';
import { isOutboundWebhookAction, OUTBOUND_WEBHOOK_ACTIONS, type OutboundWebhookAction } from './webhook-actions.js';

type OutboundWebhookInput = {
  name: string;
  endpoint: string;
  action: string;
};

type OutboundWebhookUpdate = Partial<OutboundWebhookInput> & {
  enabled?: boolean;
};

@Injectable()
export class ReportsService {
  private readonly initializedEmailTemplateOrganizations = new Set<string>();

  constructor(private readonly db: PrismaService) {}

  async summary(auth: AuthContext, query: { from?: string; to?: string }) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400_000);
    const to = query.to ? new Date(query.to) : new Date();
    const opportunityWhere = { organizationId: auth.organizationId, createdAt: { lte: to }, ...scopedWhere(auth, 'opportunities') };
    const campaignWhere = { organizationId: auth.organizationId, archivedAt: null, createdAt: { gte: from, lte: to } };
    const conversationWhere = { organizationId: auth.organizationId, createdAt: { gte: from, lte: to } };
    const [stageGroups, stages, openStats, wonStats, lostCount, campaignTotal, recipientStatusGroups, conversationStatusGroups, responseTime, activities, tasks] = await Promise.all([
      this.db.opportunity.groupBy({ by: ['stageId'], where: opportunityWhere, _count: { _all: true }, _sum: { valueCents: true } }),
      this.db.pipelineStage.findMany({ where: { pipeline: { organizationId: auth.organizationId } }, orderBy: { position: 'asc' } }),
      this.db.opportunity.aggregate({ where: { ...opportunityWhere, status: 'OPEN' }, _count: { _all: true }, _sum: { valueCents: true } }),
      this.db.opportunity.aggregate({ where: { ...opportunityWhere, status: 'WON', wonAt: { gte: from } }, _count: { _all: true }, _sum: { valueCents: true } }),
      this.db.opportunity.count({ where: { ...opportunityWhere, status: 'LOST', lostAt: { gte: from } } }),
      this.db.campaign.count({ where: campaignWhere }),
      this.db.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaign: campaignWhere },
        _count: { _all: true },
      }),
      this.db.conversation.groupBy({ by: ['status'], where: conversationWhere, _count: { _all: true } }),
      this.db.$queryRaw<Array<{ averageMs: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) * 1000)::double precision AS "averageMs"
        FROM "Conversation"
        WHERE "organizationId" = ${auth.organizationId}::uuid
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
          AND "firstResponseAt" IS NOT NULL
      `),
      this.db.activity.groupBy({ by: ['userId', 'type'], where: { occurredAt: { gte: from, lte: to }, user: { organizationId: auth.organizationId } }, _count: true }),
      this.db.task.groupBy({ by: ['status'], where: { organizationId: auth.organizationId, createdAt: { gte: from, lte: to } }, _count: true }),
    ]);
    const recipientStatuses = Object.fromEntries(recipientStatusGroups.map((item) => [item.status.toLowerCase(), item._count._all]));
    const stageTotals = new Map(stageGroups.map((stage) => [stage.stageId, { count: stage._count._all, valueCents: stage._sum.valueCents || 0 }]));
    const conversationCounts = Object.fromEntries(conversationStatusGroups.map((item) => [item.status, item._count._all]));
    const opened = Object.values(conversationCounts).reduce((total, count) => total + count, 0);
    const open = openStats._count._all;
    const openValueCents = openStats._sum.valueCents || 0;
    const won = wonStats._count._all;
    const wonValueCents = wonStats._sum.valueCents || 0;
    const averageFirstResponseMs = responseTime[0]?.averageMs ?? null;
    return {
      period: { from, to },
      funnel: stages.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color, count: stageTotals.get(stage.id)?.count || 0, valueCents: stageTotals.get(stage.id)?.valueCents || 0 })),
      sales: {
        open, openValueCents,
        won, wonValueCents, lost: lostCount,
        conversionRate: won + lostCount ? Math.round((won / (won + lostCount)) * 1000) / 10 : 0,
      },
      inbox: {
        opened, currentlyOpen: conversationCounts.OPEN || 0,
        averageFirstResponseMinutes: averageFirstResponseMs === null ? null : Math.round(averageFirstResponseMs / 60000),
      },
      campaigns: { total: campaignTotal, recipients: recipientStatuses }, activities, tasks,
    };
  }

  async exportCsv(auth: AuthContext) {
    const companies = await this.db.company.findMany({ where: { organizationId: auth.organizationId, archivedAt: null, ...scopedWhere(auth, 'companies') }, include: { owner: true, team: true } });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [
      ['id', 'empresa', 'cnpj', 'dominio', 'setor', 'responsavel', 'equipe', 'criado_em'].join(','),
      ...companies.map((company) => [company.id, company.name, company.cnpj, company.domain, company.sector, company.owner?.name, company.team?.name, company.createdAt.toISOString()].map(escape).join(',')),
    ].join('\n');
  }

  async exportPdf(auth: AuthContext, query: { from?: string; to?: string }) {
    const summary = await this.summary(auth, query);
    return buildReportPdf({
      summary,
      generatedAt: new Date(),
      generatedBy: auth.name,
    });
  }

  notifications(auth: AuthContext) {
    if (!auth.userId) return [];
    return this.db.notification.findMany({
      where: { userId: auth.userId, readAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async readNotification(auth: AuthContext, id: string) {
    if (!auth.userId) throw new NotFoundException('Notificação não encontrada');
    const notification = await this.db.notification.findFirst({ where: { id, userId: auth.userId } });
    if (!notification) throw new NotFoundException('Notificação não encontrada');
    return this.db.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async readAllNotifications(auth: AuthContext) {
    if (!auth.userId) return { count: 0 };
    return this.db.notification.updateMany({ where: { userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
  }

  async emailTemplates(auth: AuthContext) {
    await this.ensureSgaEmailTemplates(auth);
    return this.db.emailTemplate.findMany({ where: { organizationId: auth.organizationId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
  }

  emailProvider() {
    return campaignEmailConfigurationStatus();
  }

  createEmailTemplate(auth: AuthContext, input: { name: string; subject: string; html: string; text?: string }) {
    if (!input.name || !input.subject || !input.html) throw new BadRequestException('Nome, assunto e conteúdo são obrigatórios');
    return this.db.emailTemplate.create({ data: { organizationId: auth.organizationId, ...input } });
  }

  async deleteEmailTemplate(auth: AuthContext, id: string) {
    const template = await this.db.emailTemplate.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, name: true, subject: true },
    });
    if (!template) throw new NotFoundException('Modelo de e-mail não encontrado');
    const deletedAt = new Date().toISOString();
    await this.db.$transaction([
      this.db.emailTemplate.delete({ where: { id } }),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'email_template.deleted',
          entityType: 'EmailTemplate',
          entityId: id,
          before: template,
          after: { deletedAt },
        },
      }),
    ]);
    return { id, deletedAt };
  }

  private async ensureSgaEmailTemplates(auth: AuthContext) {
    if (this.initializedEmailTemplateOrganizations.has(auth.organizationId)) return;
    const marker = await this.db.auditLog.findFirst({
      where: {
        organizationId: auth.organizationId,
        action: 'email_templates.sga_initialized',
        entityType: 'EmailTemplatePreset',
      },
      select: { id: true },
    });
    if (!marker) {
      const created = await this.db.emailTemplate.createMany({
        data: sgaProspectingEmailTemplates.map((template) => ({
          organizationId: auth.organizationId,
          name: template.name,
          subject: template.subject,
          html: template.html,
          text: template.text,
        })),
        skipDuplicates: true,
      });
      await this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'email_templates.sga_initialized',
          entityType: 'EmailTemplatePreset',
          entityId: 'sga-v1',
          after: {
            created: created.count,
            templates: sgaProspectingEmailTemplates.map((template) => template.name),
          },
        },
      });
    }
    this.initializedEmailTemplateOrganizations.add(auth.organizationId);
  }

  async outboundWebhooks(auth: AuthContext) {
    const webhooks = await this.db.outboundWebhook.findMany({
      where: { organizationId: auth.organizationId },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return webhooks.map((webhook) => ({
      ...webhook,
      endpoint: webhook.url,
      action: this.webhookAction(webhook.events),
    }));
  }

  outboundWebhookActions() {
    return OUTBOUND_WEBHOOK_ACTIONS;
  }

  async createOutboundWebhook(auth: AuthContext, input: OutboundWebhookInput) {
    const normalized = this.validateOutboundWebhook(input);
    const secret = randomBytes(32).toString('base64url');
    const webhook = await this.db.outboundWebhook.create({ data: {
      organizationId: auth.organizationId,
      name: normalized.name,
      url: normalized.endpoint,
      events: [normalized.action] as Prisma.InputJsonValue,
      enabled: false,
      secretEncrypted: encryptSecret(secret),
    } });
    return {
      id: webhook.id,
      name: webhook.name,
      endpoint: webhook.url,
      action: normalized.action,
      enabled: webhook.enabled,
      secret,
    };
  }

  async updateOutboundWebhook(auth: AuthContext, id: string, input: OutboundWebhookUpdate) {
    const existing = await this.db.outboundWebhook.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, name: true, url: true, events: true, enabled: true },
    });
    if (!existing) throw new NotFoundException('Webhook não encontrado');
    const normalized = this.validateOutboundWebhook({
      name: input.name ?? existing.name,
      endpoint: input.endpoint ?? existing.url,
      action: input.action ?? this.webhookAction(existing.events),
    });
    const webhook = await this.db.outboundWebhook.update({
      where: { id },
      data: {
        name: normalized.name,
        url: normalized.endpoint,
        events: [normalized.action] as Prisma.InputJsonValue,
        ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      ...webhook,
      endpoint: webhook.url,
      action: this.webhookAction(webhook.events),
    };
  }

  async deleteOutboundWebhook(auth: AuthContext, id: string) {
    const existing = await this.db.outboundWebhook.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Webhook não encontrado');
    await this.db.outboundWebhook.delete({ where: { id } });
    return { id, deleted: true };
  }

  private validateOutboundWebhook(input: OutboundWebhookInput): {
    name: string;
    endpoint: string;
    action: OutboundWebhookAction;
  } {
    const name = String(input.name || '').trim();
    if (name.length < 2 || name.length > 120) {
      throw new BadRequestException('Informe um nome válido para o webhook');
    }
    const endpoint = String(input.endpoint || '').trim();
    if (!endpoint || endpoint.length > 2_048) {
      throw new BadRequestException('Informe um endpoint válido');
    }
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new BadRequestException('Informe um endpoint HTTP ou HTTPS válido');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new BadRequestException('Informe um endpoint HTTP ou HTTPS válido, sem credenciais na URL');
    }
    if (!isOutboundWebhookAction(input.action)) {
      throw new BadRequestException('Selecione uma ação válida para o webhook');
    }
    return { name, endpoint: parsed.toString(), action: input.action };
  }

  private webhookAction(value: Prisma.JsonValue): OutboundWebhookAction {
    const action = Array.isArray(value) ? String(value[0] || '') : '';
    return isOutboundWebhookAction(action) ? action : 'company.created';
  }
}
