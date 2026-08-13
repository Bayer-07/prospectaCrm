import type { Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import {
  renderPasswordResetEmail,
  renderBzsEmailLayout,
  renderUserInviteEmail,
  escapeEmailHtml,
  type FollowUpAlertEmailJob,
  type PasswordResetEmailJob,
  type UserInviteEmailJob,
} from '@prospecta/contracts';
import { MailgunClient } from './mailgun-client.js';

export class UserInviteProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly mailgun = new MailgunClient(),
  ) {}

  async process(job: Job<UserInviteEmailJob | PasswordResetEmailJob | FollowUpAlertEmailJob>) {
    if (job.name === 'send-follow-up-alert') {
      return this.processFollowUpAlert(job as Job<FollowUpAlertEmailJob>);
    }
    if (job.name === 'send-password-reset') {
      return this.processPasswordReset(job as Job<PasswordResetEmailJob>);
    }
    if (job.name !== 'send-user-invite') return { skipped: true, reason: 'job desconhecido' };
    const inviteJob = job as Job<UserInviteEmailJob>;
    const invite = await this.db.inviteToken.findUnique({
      where: { id: inviteJob.data.inviteTokenId },
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
      inviteUrl: inviteJob.data.inviteUrl,
      expiresInHours: inviteJob.data.expiresInHours,
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

  private async processPasswordReset(job: Job<PasswordResetEmailJob>) {
    const reset = await this.db.passwordResetToken.findUnique({
      where: { id: job.data.passwordResetTokenId },
      include: {
        user: {
          include: {
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!reset) return { skipped: true, reason: 'redefinição não encontrada' };
    if (reset.emailStatus === 'SENT') return { skipped: true, reason: 'e-mail já enviado' };
    if (reset.usedAt || reset.expiresAt <= new Date()) {
      await this.db.passwordResetToken.update({
        where: { id: reset.id },
        data: {
          emailStatus: 'FAILED',
          emailError: reset.usedAt ? 'Link já utilizado' : 'Link expirado antes do envio',
        },
      });
      return { skipped: true, reason: reset.usedAt ? 'link utilizado' : 'link expirado' };
    }

    await this.db.passwordResetToken.update({
      where: { id: reset.id },
      data: {
        emailStatus: 'PENDING',
        emailAttempts: { increment: 1 },
        emailError: null,
      },
    });
    const content = renderPasswordResetEmail({
      recipientName: reset.user.name,
      resetUrl: job.data.resetUrl,
      expiresInMinutes: job.data.expiresInMinutes,
    });

    try {
      const result = await this.mailgun.sendPasswordReset({
        to: reset.user.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        passwordResetTokenId: reset.id,
        userId: reset.user.id,
      });
      await this.db.passwordResetToken.update({
        where: { id: reset.id },
        data: {
          emailStatus: 'SENT',
          emailSentAt: new Date(),
          providerMessageId: result.id,
          emailError: null,
        },
      });
      await this.db.auditLog.create({
        data: {
          organizationId: reset.user.organization.id,
          userId: null,
          action: 'user.password_reset_email_sent',
          entityType: 'PasswordResetToken',
          entityId: reset.id,
          after: {
            targetUserId: reset.user.id,
            recipient: reset.user.email,
            providerMessageId: result.id,
          },
        },
      });
      return { sent: true, passwordResetTokenId: reset.id, providerMessageId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida no envio da recuperação';
      await this.db.passwordResetToken.update({
        where: { id: reset.id },
        data: { emailStatus: 'FAILED', emailError: message.slice(0, 1000) },
      });
      throw error;
    }
  }

  private async processFollowUpAlert(job: Job<FollowUpAlertEmailJob>) {
    const followUp = await this.db.conversationFollowUp.findUnique({
      where: { id: job.data.followUpId },
      include: {
        organization: { select: { name: true } },
        responsible: { select: { id: true, name: true, email: true, status: true } },
        conversation: { include: { contact: { select: { name: true } } } },
      },
    });
    if (!followUp) return { skipped: true, reason: 'follow-up não encontrado' };
    if (followUp.responsible.status !== 'ACTIVE' || !followUp.responsible.email) {
      return { skipped: true, reason: 'responsável sem e-mail ativo' };
    }
    const replied = job.data.reason === 'contact_replied_before_start';
    const title = replied ? 'Follow-up cancelado por resposta' : 'Follow-up precisa da sua atenção';
    const explanation = replied
      ? `${followUp.conversation.contact.name} respondeu antes do horário agendado. O envio automático foi cancelado.`
      : `O follow-up de ${followUp.conversation.contact.name} não pôde ser executado: ${followUp.failureReason || 'falha não informada'}.`;
    const appUrl = withoutTrailingSlashes(String(process.env.APP_URL || 'http://localhost:5173'));
    const text = [
      `Olá, ${followUp.responsible.name}.`,
      '',
      explanation,
      '',
      `Abrir conversa: ${appUrl}/inbox/${followUp.conversationId}`,
    ].join('\n');
    const html = renderBzsEmailLayout({
      preheader: explanation,
      eyebrow: 'FOLLOW-UP AUTOMÁTICO',
      brandLabel: 'BZS ONE',
      title,
      bodyHtml: `<p style="margin:0">Olá, <strong>${escapeEmailHtml(followUp.responsible.name)}</strong>.</p><p style="margin:16px 0 0">${escapeEmailHtml(explanation)}</p>`,
      callToAction: { label: 'Abrir conversa', href: `${appUrl}/inbox/${followUp.conversationId}` },
      footerText: `Aviso automático de ${followUp.organization.name}.`,
    });
    const result = await this.mailgun.sendFollowUpAlert({
      to: followUp.responsible.email,
      subject: title,
      html,
      text,
      followUpId: followUp.id,
      userId: followUp.responsible.id,
    });
    await this.db.auditLog.create({ data: {
      organizationId: followUp.organizationId,
      userId: followUp.responsible.id,
      action: 'follow_up.alert_email_sent',
      entityType: 'ConversationFollowUp',
      entityId: followUp.id,
      after: { reason: job.data.reason, recipient: followUp.responsible.email, providerMessageId: result.id },
    } });
    return { sent: true, followUpId: followUp.id, providerMessageId: result.id };
  }
}

function withoutTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}
