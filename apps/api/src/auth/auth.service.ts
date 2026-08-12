import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import type { Queue } from 'bullmq';
import type { PasswordResetEmailJob } from '@prospecta/contracts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { TRANSACTIONAL_EMAIL_QUEUE } from '../queue/queue.module.js';
import { AuthCacheService } from './auth-cache.service.js';
import { SessionTokenService } from './session-token.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_LOGIN_ATTEMPT_ENTRIES = 10_000;
type AttemptEntry = { count: number; resetAt: number };

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
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly loginAttempts = new Map<string, { count: number; resetAt: number }>();
  private readonly passwordResetAttempts = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly db: PrismaService,
    private readonly authCache: AuthCacheService,
    private readonly sessionTokens: SessionTokenService,
    @Inject(TRANSACTIONAL_EMAIL_QUEUE) private readonly transactionalEmails: Queue<PasswordResetEmailJob>,
  ) {}

  private ensureLoginAllowed(attemptKey: string, now: number) {
    const attempts = this.loginAttempts.get(attemptKey);
    if (attempts && attempts.resetAt > now && attempts.count >= 5) {
      throw new HttpException('Muitas tentativas. Aguarde 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (attempts && attempts.resetAt <= now) this.loginAttempts.delete(attemptKey);
  }

  private pruneAttemptMap(attempts: Map<string, AttemptEntry>, now: number) {
    if (attempts.size < MAX_LOGIN_ATTEMPT_ENTRIES) return;
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key);
    }
    if (attempts.size < MAX_LOGIN_ATTEMPT_ENTRIES) return;
    const oldestKey = attempts.keys().next().value;
    if (oldestKey) attempts.delete(oldestKey);
  }

  private recordFailedLogin(attemptKey: string, now: number) {
    const current = this.loginAttempts.get(attemptKey);
    if (!current) this.pruneAttemptMap(this.loginAttempts, now);
    this.loginAttempts.set(attemptKey, {
      count: (current?.count ?? 0) + 1,
      resetAt: current?.resetAt ?? now + 15 * 60_000,
    });
  }

  async login(email: string, password: string, metadata: { ip?: string; userAgent?: string }) {
    const normalizedEmail = email.trim().toLowerCase();
    const attemptKey = `${metadata.ip || 'unknown'}:${normalizedEmail}`;
    const now = Date.now();
    this.ensureLoginAllowed(attemptKey, now);
    const user = await this.db.user.findFirst({ where: { email: normalizedEmail, status: 'ACTIVE' } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
      this.recordFailedLogin(attemptKey, now);
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    this.loginAttempts.delete(attemptKey);
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    const sessionId = randomUUID();
    const token = await this.sessionTokens.issue({ sessionId, userId: user.id, expiresAt });
    await this.db.$transaction([
      this.db.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: hash(token),
          csrfHash: hash(csrfToken),
          expiresAt,
          ipAddress: metadata.ip,
          userAgent: metadata.userAgent,
        },
      }),
      this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);
    return { token, csrfToken, expiresAt };
  }

  async logout(token?: string) {
    if (!token) return;
    const tokenHash = hash(token);
    await this.db.session.deleteMany({ where: { tokenHash } });
    this.authCache.invalidateSession(tokenHash);
  }

  async acceptInvite(token: string, password: string, name?: string) {
    if (typeof password !== 'string' || password.length < 5) throw new BadRequestException('A senha deve ter pelo menos 5 caracteres');
    const invite = await this.db.inviteToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) throw new BadRequestException('Convite inválido ou expirado');
    await this.db.$transaction([
      this.db.user.update({
        where: { id: invite.userId },
        data: { passwordHash: await argon2.hash(password), name: name?.trim() || invite.user.name, status: 'ACTIVE' },
      }),
      this.db.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    ]);
    this.authCache.invalidateUser(invite.userId);
  }

  async requestPasswordReset(email: string, metadata: { ip?: string; userAgent?: string }) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const now = Date.now();
    const attemptKey = `${metadata.ip || 'unknown'}:${normalizedEmail}`;
    const attempts = this.passwordResetAttempts.get(attemptKey);
    if (attempts && attempts.resetAt > now && attempts.count >= 3) {
      return { accepted: true };
    }
    if (attempts && attempts.resetAt <= now) this.passwordResetAttempts.delete(attemptKey);
    this.passwordResetAttempts.set(attemptKey, {
      count: (attempts?.count || 0) + 1,
      resetAt: attempts?.resetAt || now + 15 * 60_000,
    });
    this.pruneAttemptMap(this.passwordResetAttempts, now);

    if (!isValidEmailAddress(normalizedEmail)) {
      return { accepted: true };
    }
    const user = await this.db.user.findFirst({
      where: { email: normalizedEmail, status: 'ACTIVE' },
      select: { id: true, organizationId: true, email: true },
    });
    if (!user) return { accepted: true };

    const rawToken = randomBytes(32).toString('base64url');
    const expiresInMinutes = 60;
    const [, reset] = await this.db.$transaction([
      this.db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          createdById: user.id,
          tokenHash: hash(rawToken),
          expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
        },
      }),
      this.db.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: null,
          action: 'user.password_reset_requested',
          entityType: 'User',
          entityId: user.id,
          after: { email: user.email },
          ipAddress: metadata.ip,
          userAgent: metadata.userAgent,
        },
      }),
    ]);
    const appUrl = withoutTrailingSlash(process.env.APP_URL || 'http://localhost:5173');
    const resetUrl = `${appUrl}/redefinir-senha?token=${rawToken}`;
    try {
      await this.transactionalEmails.add(
        'send-password-reset',
        { passwordResetTokenId: reset.id, resetUrl, expiresInMinutes },
        {
          jobId: `password-reset-${reset.id}`,
          attempts: 6,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida ao acessar a fila';
      await this.db.passwordResetToken.update({
        where: { id: reset.id },
        data: { emailStatus: 'FAILED', emailError: message.slice(0, 1000) },
      });
      this.logger.error(`Não foi possível agendar a recuperação de senha para o usuário ${user.id}: ${message}`);
    }
    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    if (typeof password !== 'string' || password.length < 5) throw new BadRequestException('A senha deve ter pelo menos 5 caracteres');
    const reset = await this.db.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw new BadRequestException('Link inválido ou expirado');
    await this.db.$transaction([
      this.db.user.update({ where: { id: reset.userId }, data: { passwordHash: await argon2.hash(password) } }),
      this.db.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.db.session.deleteMany({ where: { userId: reset.userId } }),
    ]);
    this.authCache.invalidateUser(reset.userId);
  }
}
