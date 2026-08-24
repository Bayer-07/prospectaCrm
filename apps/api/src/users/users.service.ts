import { BadRequestException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { UserInviteEmailJob } from '@prospecta/contracts';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from '../auth/types.js';
import { AuthCacheService } from '../auth/auth-cache.service.js';
import { TRANSACTIONAL_EMAIL_QUEUE } from '../queue/queue.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { MediaService } from '../media/media.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const deletedUserEmail = (userId: string) => `deleted.${userId}@users.invalid`;

function isValidEmailAddress(value: string) {
  if (!value || value.length > 254 || /\s/u.test(value)) return false;
  const separator = value.indexOf('@');
  if (separator <= 0 || separator !== value.lastIndexOf('@')) return false;
  const domain = value.slice(separator + 1);
  return domain.length > 2 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function withoutTrailingSlash(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: PrismaService,
    @Inject(TRANSACTIONAL_EMAIL_QUEUE) private readonly transactionalEmails: Queue<UserInviteEmailJob>,
    private readonly authCache?: AuthCacheService,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly media?: MediaService,
  ) {}

  async list(auth: AuthContext) {
    const users = await this.db.user.findMany({
      where: { organizationId: auth.organizationId, status: { not: 'SUSPENDED' } },
      select: {
        id: true, name: true, email: true, status: true, lastLoginAt: true,
        profilePhotoId: true,
        profilePhoto: { select: { createdAt: true } },
        teamMemberships: { select: { team: { select: { id: true, name: true, color: true, isDefault: true } } }, orderBy: { team: { name: 'asc' } } },
        role: { select: { id: true, key: true, name: true } },
      }, orderBy: { name: 'asc' },
    });
    return users.map(({ teamMemberships, ...user }) => ({ ...user, teams: teamMemberships.map((membership) => membership.team) }));
  }

  async metadata(auth: AuthContext) {
    const [teams, roles] = await Promise.all([
      this.db.team.findMany({ where: { organizationId: auth.organizationId }, orderBy: { name: 'asc' } }),
      this.db.role.findMany({ where: { organizationId: auth.organizationId }, include: { permissions: true }, orderBy: { name: 'asc' } }),
    ]);
    return { teams, roles };
  }

  async updateMyProfile(auth: AuthContext, input: { name: string; email: string }) {
    if (!auth.userId || auth.type !== 'session') throw new BadRequestException('Perfil exige sessão de usuário');
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!name || name.length < 2 || name.length > 120) throw new BadRequestException('Informe um nome válido');
    if (!isValidEmailAddress(email)) throw new BadRequestException('Informe um e-mail válido');
    const duplicate = await this.db.user.findFirst({
      where: { organizationId: auth.organizationId, email, id: { not: auth.userId } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Este e-mail já está sendo utilizado');
    const [user] = await this.db.$transaction([
      this.db.user.update({
        where: { id: auth.userId },
        data: { name, email },
        select: { id: true, name: true, email: true },
      }),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'user.profile_updated',
          entityType: 'User',
          entityId: auth.userId,
          after: { name, email },
        },
      }),
    ]);
    this.authCache?.invalidateUser(auth.userId);
    return user;
  }

  async updateMyPreferences(auth: AuthContext, input: { messageSignatureEnabled: boolean }) {
    if (!auth.userId || auth.type !== 'session') throw new BadRequestException('Preferências exigem sessão de usuário');
    if (typeof input.messageSignatureEnabled !== 'boolean') throw new BadRequestException('Configuração de assinatura inválida');
    const user = await this.db.user.update({
      where: { id: auth.userId },
      data: { messageSignatureEnabled: input.messageSignatureEnabled },
      select: { id: true, messageSignatureEnabled: true },
    });
    this.authCache?.invalidateUser(auth.userId);
    return user;
  }

  async setMyProfilePhoto(auth: AuthContext, mediaAssetId: string) {
    if (!auth.userId || auth.type !== 'session') throw new BadRequestException('Foto de perfil exige sessão de usuário');
    if (!this.media) throw new ServiceUnavailableException('Armazenamento de fotos indisponível');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaAssetId || '')) {
      throw new BadRequestException('Foto de perfil inválida');
    }
    const asset = await this.media.confirmProfilePhotoAsset(auth, mediaAssetId);
    const current = await this.db.user.findFirst({
      where: { id: auth.userId, organizationId: auth.organizationId },
      select: { profilePhotoId: true },
    });
    if (!current) throw new NotFoundException('Usuário não encontrado');
    if (current.profilePhotoId === asset.id) {
      return { id: auth.userId, profilePhotoId: asset.id, profilePhotoUpdatedAt: asset.createdAt.toISOString() };
    }
    const [updated] = await this.db.$transaction([
      this.db.user.update({
        where: { id: auth.userId },
        data: { profilePhotoId: asset.id },
        select: {
          id: true,
          profilePhotoId: true,
          profilePhoto: { select: { createdAt: true } },
        },
      }),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'user.profile_photo_updated',
          entityType: 'User',
          entityId: auth.userId,
          before: { profilePhotoId: current.profilePhotoId },
          after: { profilePhotoId: asset.id },
        },
      }),
    ]);
    this.authCache?.invalidateUser(auth.userId);
    if (current.profilePhotoId) await this.media.deleteAsset(auth, current.profilePhotoId).catch(() => undefined);
    return {
      id: updated.id,
      profilePhotoId: updated.profilePhotoId,
      profilePhotoUpdatedAt: updated.profilePhoto?.createdAt.toISOString(),
    };
  }

  async removeMyProfilePhoto(auth: AuthContext) {
    if (!auth.userId || auth.type !== 'session') throw new BadRequestException('Foto de perfil exige sessão de usuário');
    const current = await this.db.user.findFirst({
      where: { id: auth.userId, organizationId: auth.organizationId },
      select: { profilePhotoId: true },
    });
    if (!current) throw new NotFoundException('Usuário não encontrado');
    if (!current.profilePhotoId) return { id: auth.userId, profilePhotoId: null };
    await this.db.$transaction([
      this.db.user.update({ where: { id: auth.userId }, data: { profilePhotoId: null } }),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'user.profile_photo_removed',
          entityType: 'User',
          entityId: auth.userId,
          before: { profilePhotoId: current.profilePhotoId },
          after: { profilePhotoId: null },
        },
      }),
    ]);
    this.authCache?.invalidateUser(auth.userId);
    await this.media?.deleteAsset(auth, current.profilePhotoId).catch(() => undefined);
    return { id: auth.userId, profilePhotoId: null };
  }

  async profilePhotoUrl(auth: AuthContext, userId: string) {
    const user = await this.db.user.findFirst({
      where: { id: userId, organizationId: auth.organizationId, status: { not: 'SUSPENDED' } },
      select: { profilePhotoId: true },
    });
    if (!user?.profilePhotoId) throw new NotFoundException('Foto de perfil não encontrada');
    if (!this.media) throw new ServiceUnavailableException('Armazenamento de fotos indisponível');
    return this.media.downloadUrl(auth, user.profilePhotoId);
  }

  async createInvite(auth: AuthContext, input: { name: string; email: string; roleId: string; teamIds?: string[] }) {
    if (!auth.userId) throw new BadRequestException('Convites exigem sessão de usuário');
    const creatorId = auth.userId;
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase() || '';
    if (!name || name.length < 2 || name.length > 120) throw new BadRequestException('Informe um nome válido');
    if (!isValidEmailAddress(email)) throw new BadRequestException('Informe um e-mail válido');
    const role = await this.db.role.findFirst({ where: { id: input.roleId, organizationId: auth.organizationId } });
    if (!role) throw new NotFoundException('Papel não encontrado');
    const { teamIds, teams, defaultTeamId } = await this.resolveUserTeams(auth.organizationId, input.teamIds || []);
    const rawToken = randomBytes(32).toString('base64url');
    const { user, invite, archivedUserId } = await this.db.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { organizationId: auth.organizationId, email },
        select: { id: true, status: true },
      });
      if (existing?.status === 'ACTIVE') {
        throw new BadRequestException('Já existe um usuário ativo com este e-mail');
      }

      let invitedUser;
      let archivedUserId: string | undefined;
      if (existing?.status === 'SUSPENDED') {
        archivedUserId = existing.id;
        await tx.user.update({
          where: { id: existing.id },
          data: {
            email: deletedUserEmail(existing.id),
            passwordHash: null,
          },
        });
        invitedUser = await tx.user.create({
          data: {
            organizationId: auth.organizationId,
            name,
            email,
            roleId: input.roleId,
            teamId: defaultTeamId,
            status: 'INVITED',
            teamMemberships: { create: teamIds.map((teamId) => ({ teamId })) },
          },
        });
      } else if (existing) {
        invitedUser = await tx.user.update({
          where: { id: existing.id },
          data: {
            name,
            roleId: input.roleId,
            teamId: defaultTeamId,
            status: 'INVITED',
            teamMemberships: { deleteMany: {}, create: teamIds.map((teamId) => ({ teamId })) },
          },
        });
      } else {
        invitedUser = await tx.user.create({
          data: {
            organizationId: auth.organizationId,
            name,
            email,
            roleId: input.roleId,
            teamId: defaultTeamId,
            status: 'INVITED',
            teamMemberships: { create: teamIds.map((teamId) => ({ teamId })) },
          },
        });
      }

      await tx.inviteToken.updateMany({
        where: { userId: invitedUser.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const invite = await tx.inviteToken.create({
        data: {
          userId: invitedUser.id,
          createdById: creatorId,
          tokenHash: hash(rawToken),
          expiresAt: new Date(Date.now() + 72 * 3_600_000),
        },
      });
      return { user: invitedUser, invite, archivedUserId };
    });
    if (archivedUserId) this.authCache?.invalidateUser(archivedUserId);
    this.authCache?.invalidateUser(user.id);
    const inviteUrl = `${withoutTrailingSlash(process.env.APP_URL || 'http://localhost:5173')}/aceitar-convite?token=${rawToken}`;
    try {
      await this.transactionalEmails.add('send-user-invite', {
        inviteTokenId: invite.id,
        inviteUrl,
        expiresInHours: 72,
      }, {
        jobId: `user-invite-${invite.id}`,
        attempts: 6,
        backoff: { type: 'exponential', delay: 5_000 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fila de e-mail indisponível';
      await this.db.inviteToken.update({
        where: { id: invite.id },
        data: { emailStatus: 'FAILED', emailError: message.slice(0, 1000) },
      });
      throw new ServiceUnavailableException('O convite foi criado, mas não foi possível agendar o e-mail. Tente novamente.');
    }
    await this.audit(auth, 'user.invite_created', 'User', user.id, {
      email,
      roleId: input.roleId,
      teamIds,
      inviteTokenId: invite.id,
      ...(archivedUserId ? { replacedSuspendedUserId: archivedUserId } : {}),
      emailDelivery: 'QUEUED',
    });
    return { userId: user.id, email, teams, inviteUrl, expiresInHours: 72, emailDelivery: 'QUEUED' as const };
  }

  async updateUser(
    auth: AuthContext,
    userId: string,
    input: { name: string; email: string; roleId: string; teamIds?: string[] },
  ) {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase() || '';
    if (!name || name.length < 2 || name.length > 120) throw new BadRequestException('Informe um nome válido');
    if (!isValidEmailAddress(email)) throw new BadRequestException('Informe um e-mail válido');

    const [user, role, resolvedTeams] = await Promise.all([
      this.db.user.findFirst({
        where: { id: userId, organizationId: auth.organizationId, status: { not: 'SUSPENDED' } },
        include: {
          role: { select: { id: true, key: true, name: true } },
          teamMemberships: { select: { teamId: true } },
        },
      }),
      this.db.role.findFirst({
        where: { id: input.roleId, organizationId: auth.organizationId },
        select: { id: true, key: true, name: true },
      }),
      this.resolveUserTeams(auth.organizationId, input.teamIds || []),
    ]);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!role) throw new NotFoundException('Papel não encontrado');

    const duplicate = await this.db.user.findFirst({
      where: {
        organizationId: auth.organizationId,
        email,
        id: { not: userId },
      },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Este e-mail já está sendo utilizado');
    if (user.status === 'ACTIVE' && user.role.key === 'admin' && role.key !== 'admin') {
      await this.ensureAnotherActiveAdmin(auth.organizationId, userId);
    }

    const nextTeamIds = resolvedTeams.teamIds;
    const previousTeamIds = user.teamMemberships.map((membership) => membership.teamId);
    const removedTeamIds = previousTeamIds.filter((teamId) => !nextTeamIds.includes(teamId));
    const affectedConversations = removedTeamIds.length ? await this.db.conversation.findMany({
      where: { assigneeId: userId, teamId: { in: removedTeamIds } },
      select: { id: true, status: true, team: { select: { id: true, name: true } } },
    }) : [];

    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: { name, email, roleId: role.id, teamId: resolvedTeams.defaultTeamId },
      }),
      this.db.userTeam.deleteMany({ where: { userId } }),
      ...(nextTeamIds.length ? [this.db.userTeam.createMany({ data: nextTeamIds.map((teamId) => ({ userId, teamId })) })] : []),
      ...(affectedConversations.length ? [this.db.conversationEvent.createMany({ data: affectedConversations.map((conversation) => ({
        organizationId: auth.organizationId,
        conversationId: conversation.id,
        actorId: auth.userId,
        type: 'ASSIGNEE_REMOVED_FROM_TEAM',
        text: `${auth.name} removeu ${user.name} da fila ${conversation.team?.name || 'sem nome'}; o atendimento ficou sem atendente`,
        metadata: { removedUserId: user.id, removedTeamId: conversation.team?.id || null },
      })) })] : []),
      ...(affectedConversations.length ? [this.db.conversation.updateMany({
        where: { id: { in: affectedConversations.map((conversation) => conversation.id) } },
        data: { assigneeId: null },
      })] : []),
      ...(affectedConversations.some((conversation) => conversation.status === 'OPEN') ? [this.db.conversation.updateMany({
        where: { id: { in: affectedConversations.filter((conversation) => conversation.status === 'OPEN').map((conversation) => conversation.id) } },
        data: { status: 'WAITING' },
      })] : []),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'user.updated',
          entityType: 'User',
          entityId: userId,
          before: {
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            teamIds: previousTeamIds,
          },
          after: { name, email, roleId: role.id, teamIds: nextTeamIds },
        },
      }),
    ]);
    this.authCache?.invalidateUser(userId);
    if (affectedConversations.length) this.realtime?.notifyOrganization(auth.organizationId, 'inbox.updated', { userId });
    const updated = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, status: true, lastLoginAt: true,
        profilePhotoId: true,
        profilePhoto: { select: { createdAt: true } },
        role: { select: { id: true, key: true, name: true } },
        teamMemberships: { select: { team: { select: { id: true, name: true, color: true, isDefault: true } } }, orderBy: { team: { name: 'asc' } } },
      },
    });
    const { teamMemberships, ...result } = updated;
    return { ...result, teams: teamMemberships.map((membership) => membership.team) };
  }

  async deleteUser(auth: AuthContext, userId: string) {
    if (!auth.userId || auth.type !== 'session') throw new BadRequestException('Exclusão exige sessão de usuário');
    if (auth.userId === userId) throw new BadRequestException('Você não pode excluir a própria conta');
    const user = await this.db.user.findFirst({
      where: { id: userId, organizationId: auth.organizationId, status: { not: 'SUSPENDED' } },
      include: { role: { select: { key: true, name: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.status === 'ACTIVE' && user.role.key === 'admin') {
      await this.ensureAnotherActiveAdmin(auth.organizationId, userId);
    }

    const now = new Date();
    const activeConversations = await this.db.conversation.findMany({
      where: { assigneeId: userId, status: 'OPEN' },
      select: { id: true },
    });
    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: {
          status: 'SUSPENDED',
          email: deletedUserEmail(userId),
          passwordHash: null,
        },
      }),
      this.db.session.deleteMany({ where: { userId } }),
      this.db.inviteToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
      this.db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
      ...(activeConversations.length ? [this.db.conversationEvent.createMany({
        data: activeConversations.map((conversation) => ({
          organizationId: auth.organizationId,
          conversationId: conversation.id,
          actorId: auth.userId,
          type: 'ASSIGNEE_REMOVED',
          text: `${auth.name} removeu ${user.name}; o atendimento voltou para a fila de espera`,
          metadata: { removedUserId: user.id },
        })),
      })] : []),
      this.db.conversation.updateMany({
        where: { assigneeId: userId, status: 'OPEN' },
        data: { assigneeId: null, status: 'WAITING' },
      }),
      this.db.task.updateMany({
        where: { assigneeId: userId, status: 'OPEN' },
        data: { assigneeId: null },
      }),
      this.db.company.updateMany({ where: { ownerId: userId }, data: { ownerId: null } }),
      this.db.contact.updateMany({ where: { ownerId: userId }, data: { ownerId: null } }),
      this.db.opportunity.updateMany({ where: { ownerId: userId }, data: { ownerId: null } }),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'user.deleted',
          entityType: 'User',
          entityId: userId,
          before: {
            name: user.name,
            email: user.email,
            status: user.status,
            roleId: user.roleId,
            teamId: user.teamId,
          },
          after: {
            status: 'SUSPENDED',
            emailReleased: true,
            accessRevokedAt: now.toISOString(),
          },
        },
      }),
    ]);
    this.authCache?.invalidateUser(userId);
    this.realtime?.disconnectUser(userId);
    return { id: userId, deleted: true };
  }

  async createReset(auth: AuthContext, userId: string) {
    if (!auth.userId) throw new BadRequestException('Redefinição exige sessão de usuário');
    const user = await this.db.user.findFirst({ where: { id: userId, organizationId: auth.organizationId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    await this.db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    const rawToken = randomBytes(32).toString('base64url');
    await this.db.passwordResetToken.create({
      data: { userId, createdById: auth.userId, tokenHash: hash(rawToken), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await this.audit(auth, 'user.reset_created', 'User', user.id, { email: user.email });
    return { resetUrl: `${process.env.APP_URL || 'http://localhost:5173'}/redefinir-senha?token=${rawToken}`, expiresInMinutes: 60 };
  }

  async createApiKey(auth: AuthContext, input: { name: string; scopes: string[]; expiresAt?: string }) {
    const secret = randomBytes(32).toString('base64url');
    const prefix = randomBytes(4).toString('hex');
    const token = `pk_${prefix}_${secret}`;
    const record = await this.db.apiKey.create({
      data: {
        organizationId: auth.organizationId, name: input.name, prefix,
        keyHash: hash(token), scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });
    await this.audit(auth, 'api_key.created', 'ApiKey', record.id, { name: input.name, scopes: input.scopes });
    return { id: record.id, token, prefix, name: record.name };
  }

  async updateRolePermissions(auth: AuthContext, roleId: string, permissions: Array<{ resource: string; action: string; scope: 'ALL' | 'TEAM' | 'OWN' }>) {
    const role = await this.db.role.findFirst({ where: { id: roleId, organizationId: auth.organizationId } });
    if (!role) throw new NotFoundException('Papel não encontrado');
    const clean = permissions.filter((permission) => /^[a-z_*]+$/.test(permission.resource) && /^[a-z_*]+$/.test(permission.action));
    if (clean.length !== permissions.length || new Set(clean.map((item) => `${item.resource}:${item.action}`)).size !== clean.length) throw new BadRequestException('Lista de permissões inválida');
    if (role.key === 'admin' && !clean.some((permission) => permission.resource === '*' && permission.action === '*' && permission.scope === 'ALL')) {
      throw new BadRequestException('O papel Administrador deve manter a permissão global');
    }
    await this.db.$transaction([
      this.db.rolePermission.deleteMany({ where: { roleId } }),
      this.db.rolePermission.createMany({ data: clean.map((permission) => ({ roleId, ...permission })) }),
      this.db.auditLog.create({ data: { organizationId: auth.organizationId, userId: auth.userId, action: 'role.permissions_updated', entityType: 'Role', entityId: roleId, after: clean } }),
    ]);
    this.authCache?.invalidateRole(roleId);
    return this.db.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
  }

  private audit(auth: AuthContext, action: string, entityType: string, entityId: string, after: object) {
    return this.db.auditLog.create({ data: { organizationId: auth.organizationId, userId: auth.userId, action, entityType, entityId, after } });
  }

  private async ensureAnotherActiveAdmin(organizationId: string, excludedUserId: string) {
    const activeAdmins = await this.db.user.count({
      where: {
        organizationId,
        id: { not: excludedUserId },
        status: 'ACTIVE',
        role: { key: 'admin' },
      },
    });
    if (!activeAdmins) throw new BadRequestException('A organização precisa manter pelo menos um administrador ativo');
  }

  private async resolveUserTeams(organizationId: string, values: string[]) {
    const teamIds = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
    const [teams, defaultTeam] = await Promise.all([
      this.db.team.findMany({
        where: { organizationId, id: { in: teamIds } },
        select: { id: true, name: true, color: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.db.team.findFirst({
        where: { organizationId, isDefault: true },
        select: { id: true },
      }),
    ]);
    if (!defaultTeam) throw new BadRequestException('A equipe Geral não está configurada');
    if (teams.length !== teamIds.length) throw new NotFoundException('Uma ou mais equipes não foram encontradas');
    return { teamIds, teams, defaultTeamId: defaultTeam.id };
  }
}
