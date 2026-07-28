import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthCacheService, type CachedApiKeyAuth, type CachedSessionAuth } from './auth-cache.service.js';
import { clearAuthCookies, SESSION_COOKIE } from './auth-cookies.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { PERMISSION_KEY } from './permission.decorator.js';
import { SessionTokenService } from './session-token.service.js';
import type { AuthenticatedRequest, Permission } from './types.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    private readonly authCache: AuthCacheService,
    private readonly sessionTokens: SessionTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const apiKeyToken = bearer?.startsWith('pk_') ? bearer : undefined;
    try {
      if (apiKeyToken) await this.authenticateApiKey(request, apiKeyToken);
      else await this.authenticateSession(request, bearer);
    } catch (error) {
      if (!apiKeyToken && error instanceof UnauthorizedException) {
        clearAuthCookies(context.switchToHttp().getResponse<Response>());
      }
      throw error;
    }

    if (request.auth.type === 'apiKey' && !/^\/api\/v1\/(companies|contacts|opportunities|pipelines|tasks|tags|custom-fields|segments|mcp)(\/|\?|$)/.test(request.originalUrl)) {
      throw new ForbiddenException('Este endpoint não faz parte da API pública');
    }

    const needed = this.reflector.getAllAndOverride<{ resource: string; action: string }>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (needed && !this.hasPermission(request.auth.permissions, needed.resource, needed.action)) {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
    return true;
  }

  private async authenticateSession(request: AuthenticatedRequest, bearerToken?: string) {
    const token = bearerToken || request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Sessão necessária');
    const claims = await this.sessionTokens.verify(token);
    if (!claims) throw new UnauthorizedException('Sessão expirada ou inválida');
    const tokenHash = hash(token);
    const now = new Date();
    let session = this.authCache.getSession(tokenHash, now.getTime());
    if (session && (session.sessionId !== claims.sessionId || session.userId !== claims.userId)) {
      this.authCache.invalidateSession(tokenHash);
      session = undefined;
    }
    if (!session) {
      const record = await this.db.session.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          csrfHash: true,
          expiresAt: true,
          lastSeenAt: true,
          user: {
            select: {
              organizationId: true,
              teamId: true,
              roleId: true,
              name: true,
              email: true,
              status: true,
              messageSignatureEnabled: true,
              profilePhoto: { select: { id: true, createdAt: true } },
              role: {
                select: {
                  key: true,
                  permissions: { select: { resource: true, action: true, scope: true } },
                },
              },
            },
          },
        },
      });
      if (
        !record
        || record.id !== claims.sessionId
        || record.userId !== claims.userId
        || record.expiresAt <= now
        || record.user.status !== 'ACTIVE'
      ) {
        throw new UnauthorizedException('Sessão expirada');
      }
      session = {
        sessionId: record.id,
        userId: record.userId,
        roleId: record.user.roleId,
        csrfHash: record.csrfHash,
        expiresAt: record.expiresAt,
        lastSeenAt: record.lastSeenAt,
        auth: {
          type: 'session',
          organizationId: record.user.organizationId,
          userId: record.userId,
          teamId: record.user.teamId,
          roleKey: record.user.role.key,
          name: record.user.name,
          email: record.user.email,
          sessionExpiresAt: record.expiresAt.toISOString(),
          messageSignatureEnabled: record.user.messageSignatureEnabled,
          profilePhotoId: record.user.profilePhoto?.id ?? null,
          profilePhotoUpdatedAt: record.user.profilePhoto?.createdAt.toISOString(),
          permissions: record.user.role.permissions as Permission[],
        },
      } satisfies CachedSessionAuth;
      this.authCache.setSession(tokenHash, session, now.getTime());
    }
    if (!bearerToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !this.safeHashEquals(csrf, session.csrfHash)) {
        throw new ForbiddenException('Token CSRF inválido');
      }
    }
    request.auth = session.auth;
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
      this.authCache.touchSession(tokenHash, now);
      void this.db.session.update({ where: { id: session.sessionId }, data: { lastSeenAt: now } })
        .catch(() => this.authCache.invalidateSession(tokenHash));
    }
  }

  private async authenticateApiKey(request: AuthenticatedRequest, token: string) {
    const keyHash = hash(token);
    const now = new Date();
    let apiKey = this.authCache.getApiKey(keyHash, now.getTime());
    if (!apiKey) {
      const record = await this.db.apiKey.findUnique({
        where: { keyHash },
        select: { id: true, organizationId: true, name: true, scopes: true, expiresAt: true, lastUsedAt: true, revokedAt: true },
      });
      if (!record || record.revokedAt || (record.expiresAt && record.expiresAt <= now)) {
        throw new UnauthorizedException('Chave de API inválida');
      }
      const scopes = Array.isArray(record.scopes) ? record.scopes.map(String) : [];
      apiKey = {
        apiKeyId: record.id,
        expiresAt: record.expiresAt,
        lastUsedAt: record.lastUsedAt,
        auth: {
          type: 'apiKey',
          organizationId: record.organizationId,
          name: record.name,
          apiScopes: scopes,
          permissions: scopes.map((scope) => {
            const [resource, action = 'read'] = scope.split(':');
            return { resource, action, scope: 'ALL' as const };
          }),
        },
      } satisfies CachedApiKeyAuth;
      this.authCache.setApiKey(keyHash, apiKey, now.getTime());
    }
    request.auth = apiKey.auth;
    if (!apiKey.lastUsedAt || now.getTime() - apiKey.lastUsedAt.getTime() > 5 * 60_000) {
      this.authCache.touchApiKey(keyHash, now);
      void this.db.apiKey.update({ where: { id: apiKey.apiKeyId }, data: { lastUsedAt: now } })
        .catch(() => this.authCache.invalidateApiKey(keyHash));
    }
  }

  private hasPermission(permissions: Permission[], resource: string, action: string) {
    return permissions.some((permission) =>
      (permission.resource === '*' || permission.resource === resource) &&
      (permission.action === '*' || permission.action === action));
  }

  private safeHashEquals(value: string, expectedHash: string) {
    const actual = Buffer.from(hash(value));
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
