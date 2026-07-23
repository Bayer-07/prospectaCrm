import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthCacheService } from './auth-cache.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_LOGIN_ATTEMPT_ENTRIES = 10_000;

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly db: PrismaService, private readonly authCache?: AuthCacheService) {}

  async login(email: string, password: string, metadata: { ip?: string; userAgent?: string }) {
    const normalizedEmail = email.trim().toLowerCase();
    const attemptKey = `${metadata.ip || 'unknown'}:${normalizedEmail}`;
    const now = Date.now();
    const attempts = this.loginAttempts.get(attemptKey);
    if (attempts && attempts.resetAt > now && attempts.count >= 5) throw new HttpException('Muitas tentativas. Aguarde 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    if (attempts && attempts.resetAt <= now) this.loginAttempts.delete(attemptKey);
    const user = await this.db.user.findFirst({ where: { email: normalizedEmail, status: 'ACTIVE' } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
      const current = this.loginAttempts.get(attemptKey);
      if (!current && this.loginAttempts.size >= MAX_LOGIN_ATTEMPT_ENTRIES) {
        for (const [key, entry] of this.loginAttempts) {
          if (entry.resetAt <= now) this.loginAttempts.delete(key);
        }
        if (this.loginAttempts.size >= MAX_LOGIN_ATTEMPT_ENTRIES) {
          const oldestKey = this.loginAttempts.keys().next().value;
          if (oldestKey) this.loginAttempts.delete(oldestKey);
        }
      }
      this.loginAttempts.set(attemptKey, { count: (current?.count || 0) + 1, resetAt: current?.resetAt || now + 15 * 60_000 });
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    this.loginAttempts.delete(attemptKey);
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    await this.db.$transaction([
      this.db.session.create({
        data: { userId: user.id, tokenHash: hash(token), csrfHash: hash(csrfToken), expiresAt, ipAddress: metadata.ip, userAgent: metadata.userAgent },
      }),
      this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);
    return { token, csrfToken, expiresAt };
  }

  async logout(token?: string) {
    if (!token) return;
    const tokenHash = hash(token);
    await this.db.session.deleteMany({ where: { tokenHash } });
    this.authCache?.invalidateSession(tokenHash);
  }

  async acceptInvite(token: string, password: string, name?: string) {
    if (password.length < 12) throw new BadRequestException('A senha deve ter pelo menos 12 caracteres');
    const invite = await this.db.inviteToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) throw new BadRequestException('Convite inválido ou expirado');
    await this.db.$transaction([
      this.db.user.update({
        where: { id: invite.userId },
        data: { passwordHash: await argon2.hash(password), name: name?.trim() || invite.user.name, status: 'ACTIVE' },
      }),
      this.db.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    ]);
    this.authCache?.invalidateUser(invite.userId);
  }

  async resetPassword(token: string, password: string) {
    if (password.length < 12) throw new BadRequestException('A senha deve ter pelo menos 12 caracteres');
    const reset = await this.db.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw new BadRequestException('Link inválido ou expirado');
    await this.db.$transaction([
      this.db.user.update({ where: { id: reset.userId }, data: { passwordHash: await argon2.hash(password) } }),
      this.db.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.db.session.deleteMany({ where: { userId: reset.userId } }),
    ]);
    this.authCache?.invalidateUser(reset.userId);
  }
}
