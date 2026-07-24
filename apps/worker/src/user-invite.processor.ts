import type { Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { renderUserInviteEmail, type UserInviteEmailJob } from '@prospecta/contracts';
import { MailgunClient } from './mailgun-client.js';

export class UserInviteProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly mailgun = new MailgunClient(),
  ) {}

  async process(job: Job<UserInviteEmailJob>) {
    if (job.name !== 'send-user-invite') return { skipped: true, reason: 'job desconhecido' };
    const invite = await this.db.inviteToken.findUnique({
      where: { id: job.data.inviteTokenId },
      include: {
        user: {
          include: {
            organization: { select: { id: true, name: true } },
            role: { select: { name: true } },
          },
        },
        createdBy: { select: { name: true } },
      },
    });
    if (!invite) return { skipped: true, reason: 'convite não encontrado' };
    if (invite.emailStatus === 'SENT') return { skipped: true, reason: 'e-mail já enviado' };
    if (invite.usedAt || invite.expiresAt <= new Date()) {
      await this.db.inviteToken.update({
        where: { id: invite.id },
        data: {
          emailStatus: 'FAILED',
          emailError: invite.usedAt ? 'Convite já utilizado' : 'Convite expirado antes do envio',
        },
      });
      return { skipped: true, reason: invite.usedAt ? 'convite utilizado' : 'convite expirado' };
    }

    await this.db.inviteToken.update({
      where: { id: invite.id },
      data: {
        emailStatus: 'PENDING',
        emailAttempts: { increment: 1 },
        emailError: null,
      },
    });
    const content = renderUserInviteEmail({
      recipientName: invite.user.name,
      inviterName: invite.createdBy.name,
      organizationName: invite.user.organization.name,
      roleName: invite.user.role.name,
      inviteUrl: job.data.inviteUrl,
      expiresInHours: job.data.expiresInHours,
    });

    try {
      const result = await this.mailgun.sendUserInvite({
        to: invite.user.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        inviteTokenId: invite.id,
        userId: invite.user.id,
      });
      await this.db.inviteToken.update({
        where: { id: invite.id },
        data: {
          emailStatus: 'SENT',
          emailSentAt: new Date(),
          providerMessageId: result.id,
          emailError: null,
        },
      });
      await this.db.auditLog.create({
        data: {
          organizationId: invite.user.organization.id,
          userId: invite.createdById,
          action: 'user.invite_email_sent',
          entityType: 'InviteToken',
          entityId: invite.id,
          after: {
            invitedUserId: invite.user.id,
            recipient: invite.user.email,
            providerMessageId: result.id,
          },
        },
      });
      return { sent: true, inviteTokenId: invite.id, providerMessageId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida no envio do convite';
      await this.db.inviteToken.update({
        where: { id: invite.id },
        data: { emailStatus: 'FAILED', emailError: message.slice(0, 1000) },
      });
      throw error;
    }
  }
}
