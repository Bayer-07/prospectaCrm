import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from '../auth/types.js';
import { AuthCacheService } from '../auth/auth-cache.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService, private readonly authCache?: AuthCacheService) {}

  list(auth: AuthContext) {
    return this.db.user.findMany({
      where: { organizationId: auth.organizationId },
      select: {
        id: true, name: true, email: true, status: true, lastLoginAt: true,
        team: { select: { id: true, name: true, color: true } },
        role: { select: { id: true, key: true, name: true } },
      }, orderBy: { name: 'asc' },
    });
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
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Informe um e-mail válido');
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

  async createInvite(auth: AuthContext, input: { name: string; email: string; roleId: string; teamId?: string }) {
    if (!auth.userId) throw new BadRequestException('Convites exigem sessão de usuário');
    const email = input.email.trim().toLowerCase();
    const role = await this.db.role.findFirst({ where: { id: input.roleId, organizationId: auth.organizationId } });
    if (!role) throw new NotFoundException('Papel não encontrado');
    const existing = await this.db.user.findFirst({ where: { organizationId: auth.organizationId, email } });
    if (existing?.status === 'ACTIVE') throw new BadRequestException('Já existe um usuário ativo com este e-mail');

    const user = existing ?? await this.db.user.create({
      data: {
        organizationId: auth.organizationId, name: input.name.trim(), email,
        roleId: input.roleId, teamId: input.teamId, status: 'INVITED',
      },
    });
    if (existing) {
      await this.db.user.update({ where: { id: existing.id }, data: { name: input.name.trim(), roleId: input.roleId, teamId: input.teamId, status: 'INVITED' } });
      this.authCache?.invalidateUser(existing.id);
    }
    await this.db.inviteToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    const rawToken = randomBytes(32).toString('base64url');
    await this.db.inviteToken.create({
      data: { userId: user.id, createdById: auth.userId, tokenHash: hash(rawToken), expiresAt: new Date(Date.now() + 72 * 3600_000) },
    });
    await this.audit(auth, 'user.invite_created', 'User', user.id, { email, roleId: input.roleId, teamId: input.teamId });
    return { userId: user.id, inviteUrl: `${process.env.APP_URL || 'http://localhost:5173'}/aceitar-convite?token=${rawToken}`, expiresInHours: 72 };
  }

  async createReset(auth: AuthContext, userId: string) {
    if (!auth.userId) throw new BadRequestException('Redefinição exige sessão de usuário');
    const user = await this.db.user.findFirst({ where: { id: userId, organizationId: auth.organizationId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    await this.db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    const rawToken = randomBytes(32).toString('base64url');
    await this.db.passwordResetToken.create({
      data: { userId, createdById: auth.userId, tokenHash: hash(rawToken), expiresAt: new Date(Date.now() + 3600_000) },
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
}
