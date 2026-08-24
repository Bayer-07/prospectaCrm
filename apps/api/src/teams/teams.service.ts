import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '../auth/types.js';
import { AuthCacheService } from '../auth/auth-cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function graphReferencesTeam(graph: unknown, teamId: string) {
  if (!graph || typeof graph !== 'object') return false;
  const nodes = (graph as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) && nodes.some((node) => {
    if (!node || typeof node !== 'object') return false;
    const record = node as { type?: unknown; data?: { teamId?: unknown } };
    return record.type === 'assign_queue' && record.data?.teamId === teamId;
  });
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly db: PrismaService,
    private readonly authCache: AuthCacheService,
    private readonly realtime: RealtimeGateway,
  ) {}

  list(auth: AuthContext) {
    return this.db.team.findMany({
      where: { organizationId: auth.organizationId },
      include: { _count: { select: { memberships: true, conversations: true, instanceAccess: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async create(auth: AuthContext, input: { name: string; color: string }) {
    this.assertAdmin(auth);
    const data = this.normalized(input);
    await this.assertUniqueName(auth.organizationId, data.name);
    try {
      const team = await this.db.team.create({ data: { organizationId: auth.organizationId, ...data } });
      await this.audit(auth, 'team.created', team.id, null, data);
      return team;
    } catch (error) {
      this.handleUnique(error);
      throw error;
    }
  }

  async update(auth: AuthContext, id: string, input: { name: string; color: string }) {
    this.assertAdmin(auth);
    const current = await this.find(auth, id);
    const data = this.normalized(input);
    await this.assertUniqueName(auth.organizationId, data.name, id);
    try {
      const team = await this.db.team.update({ where: { id }, data });
      await this.audit(auth, 'team.updated', id, { name: current.name, color: current.color }, data);
      return team;
    } catch (error) {
      this.handleUnique(error);
      throw error;
    }
  }

  async remove(auth: AuthContext, id: string) {
    this.assertAdmin(auth);
    const team = await this.find(auth, id);
    if (team.isDefault) throw new BadRequestException('A equipe Geral não pode ser excluída');

    const [workflows, chatbots, conversations, memberships] = await Promise.all([
      this.db.workflow.findMany({
        where: { organizationId: auth.organizationId, status: { not: 'ARCHIVED' } },
        select: { name: true, publishedVersion: true, versions: { where: { publishedAt: { not: null } }, select: { version: true, graph: true } } },
      }),
      this.db.chatbot.findMany({
        where: { organizationId: auth.organizationId, status: { not: 'ARCHIVED' } },
        select: { name: true, publishedVersion: true, versions: { where: { publishedAt: { not: null } }, select: { version: true, graph: true } } },
      }),
      this.db.conversation.findMany({ where: { organizationId: auth.organizationId, teamId: id }, select: { id: true } }),
      this.db.userTeam.findMany({ where: { teamId: id }, select: { userId: true } }),
    ]);
    const references = [
      ...workflows.filter((item) => item.versions.some((version) => version.version === item.publishedVersion && graphReferencesTeam(version.graph, id))).map((item) => `Automação: ${item.name}`),
      ...chatbots.filter((item) => item.versions.some((version) => version.version === item.publishedVersion && graphReferencesTeam(version.graph, id))).map((item) => `Chatbot: ${item.name}`),
    ];
    if (references.length) {
      throw new BadRequestException(`A equipe está em uso por fluxos publicados: ${references.join(', ')}`);
    }

    await this.db.$transaction([
      ...(conversations.length ? [this.db.conversationEvent.createMany({ data: conversations.map((conversation) => ({
        organizationId: auth.organizationId,
        conversationId: conversation.id,
        actorId: auth.userId,
        type: 'TEAM_REMOVED',
        text: `${auth.name} excluiu a fila ${team.name}; o atendimento ficou sem fila`,
        metadata: { removedTeamId: team.id, removedTeamName: team.name },
      })) })] : []),
      this.db.team.delete({ where: { id } }),
      this.db.auditLog.create({ data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: 'team.deleted',
        entityType: 'Team',
        entityId: id,
        before: { name: team.name, color: team.color, conversationCount: conversations.length },
        after: { deleted: true },
      } }),
    ]);
    memberships.forEach((membership) => this.authCache.invalidateUser(membership.userId));
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { teamId: id, deleted: true });
    return { id, deleted: true };
  }

  private assertAdmin(auth: AuthContext) {
    if (auth.type !== 'session' || auth.roleKey !== 'admin' || !auth.userId) {
      throw new BadRequestException('Somente administradores podem gerenciar equipes');
    }
  }

  private find(auth: AuthContext, id: string) {
    return this.db.team.findFirst({ where: { id, organizationId: auth.organizationId } }).then((team) => {
      if (!team) throw new NotFoundException('Equipe não encontrada');
      return team;
    });
  }

  private normalized(input: { name: string; color: string }) {
    const name = input.name?.trim();
    const color = input.color?.trim().toLowerCase();
    if (!name || name.length < 2 || name.length > 80) throw new BadRequestException('Informe um nome de equipe válido');
    if (!COLOR_PATTERN.test(color || '')) throw new BadRequestException('Informe uma cor hexadecimal válida');
    return { name, color };
  }

  private handleUnique(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('Já existe uma equipe com este nome');
    }
  }

  private async assertUniqueName(organizationId: string, name: string, excludedId?: string) {
    const duplicate = await this.db.team.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' }, ...(excludedId ? { id: { not: excludedId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Já existe uma equipe com este nome');
  }

  private audit(auth: AuthContext, action: string, entityId: string, before: object | null, after: object) {
    return this.db.auditLog.create({ data: {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType: 'Team',
      entityId,
      before: before === null ? Prisma.JsonNull : before,
      after,
    } });
  }
}
