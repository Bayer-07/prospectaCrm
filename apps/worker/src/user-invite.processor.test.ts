import { describe, expect, it, vi } from 'vitest';
import { UserInviteProcessor } from './user-invite.processor.js';

const invite = {
  id: 'invite-1',
  createdById: 'admin-1',
  emailStatus: 'PENDING',
  usedAt: null,
  expiresAt: new Date(Date.now() + 72 * 3600_000),
  createdBy: { name: 'Gabriel Bayer' },
  user: {
    id: 'user-1',
    name: 'Novo Usuário',
    email: 'novo.usuario@example.com',
    organization: { id: 'organization-1', name: 'BZS Tecnologia' },
    role: { name: 'Vendedor' },
  },
};

const job = {
  name: 'send-user-invite',
  data: {
    inviteTokenId: 'invite-1',
    inviteUrl: 'https://one.bzs.com.br/aceitar-convite?token=seguro',
    expiresInHours: 72,
  },
};

describe('UserInviteProcessor', () => {
  it('renderiza e envia o convite, registrando a entrega', async () => {
    const update = vi.fn().mockResolvedValue({});
    const audit = vi.fn().mockResolvedValue({});
    const sendUserInvite = vi.fn().mockResolvedValue({ id: 'mailgun-message-id' });
    const processor = new UserInviteProcessor({
      inviteToken: { findUnique: vi.fn().mockResolvedValue(invite), update },
      auditLog: { create: audit },
    } as never, { sendUserInvite } as never);

    await expect(processor.process(job as never)).resolves.toEqual({
      sent: true,
      inviteTokenId: 'invite-1',
      providerMessageId: 'mailgun-message-id',
    });
    expect(sendUserInvite).toHaveBeenCalledWith(expect.objectContaining({
      to: 'novo.usuario@example.com',
      inviteTokenId: 'invite-1',
      userId: 'user-1',
    }));
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'invite-1' },
      data: expect.objectContaining({
        emailStatus: 'SENT',
        providerMessageId: 'mailgun-message-id',
        emailSentAt: expect.any(Date),
      }),
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.invite_email_sent',
        entityId: 'invite-1',
      }),
    });
  });

  it('não reenvia um convite que já foi entregue', async () => {
    const sendUserInvite = vi.fn();
    const processor = new UserInviteProcessor({
      inviteToken: { findUnique: vi.fn().mockResolvedValue({ ...invite, emailStatus: 'SENT' }) },
    } as never, { sendUserInvite } as never);

    await expect(processor.process(job as never)).resolves.toEqual({
      skipped: true,
      reason: 'e-mail já enviado',
    });
    expect(sendUserInvite).not.toHaveBeenCalled();
  });

  it('marca a entrega como falha para permitir retentativas da fila', async () => {
    const update = vi.fn().mockResolvedValue({});
    const processor = new UserInviteProcessor({
      inviteToken: { findUnique: vi.fn().mockResolvedValue(invite), update },
      auditLog: { create: vi.fn() },
    } as never, {
      sendUserInvite: vi.fn().mockRejectedValue(new Error('Mailgun indisponível')),
    } as never);

    await expect(processor.process(job as never)).rejects.toThrow('Mailgun indisponível');
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'invite-1' },
      data: { emailStatus: 'FAILED', emailError: 'Mailgun indisponível' },
    });
  });
});

describe('recuperação de senha por e-mail', () => {
  const reset = {
    id: 'reset-1',
    emailStatus: 'PENDING',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60_000),
    user: {
      id: 'user-1',
      name: 'Gabriel Bayer',
      email: 'gabriel@example.com',
      organization: { id: 'organization-1', name: 'BZS Tecnologia' },
    },
  };
  const resetJob = {
    name: 'send-password-reset',
    data: {
      passwordResetTokenId: 'reset-1',
      resetUrl: 'https://one.bzs.com.br/redefinir-senha?token=seguro',
      expiresInMinutes: 60,
    },
  };

  it('envia o link e registra a entrega de forma idempotente', async () => {
    const update = vi.fn().mockResolvedValue({});
    const audit = vi.fn().mockResolvedValue({});
    const sendPasswordReset = vi.fn().mockResolvedValue({ id: 'reset-message-id' });
    const processor = new UserInviteProcessor({
      passwordResetToken: { findUnique: vi.fn().mockResolvedValue(reset), update },
      auditLog: { create: audit },
    } as never, { sendPasswordReset } as never);

    await expect(processor.process(resetJob as never)).resolves.toEqual({
      sent: true,
      passwordResetTokenId: 'reset-1',
      providerMessageId: 'reset-message-id',
    });
    expect(sendPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      to: 'gabriel@example.com',
      passwordResetTokenId: 'reset-1',
      userId: 'user-1',
    }));
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'reset-1' },
      data: expect.objectContaining({
        emailStatus: 'SENT',
        providerMessageId: 'reset-message-id',
        emailSentAt: expect.any(Date),
      }),
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.password_reset_email_sent',
        entityId: 'reset-1',
      }),
    });
  });

  it('não envia novamente quando o provedor já aceitou a mensagem', async () => {
    const sendPasswordReset = vi.fn();
    const processor = new UserInviteProcessor({
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({ ...reset, emailStatus: 'SENT' }),
      },
    } as never, { sendPasswordReset } as never);

    await expect(processor.process(resetJob as never)).resolves.toEqual({
      skipped: true,
      reason: 'e-mail já enviado',
    });
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe('alerta de follow-up por e-mail', () => {
  it('avisa o responsável atual pelo Mailgun quando o contato responde antes do início', async () => {
    const sendFollowUpAlert = vi.fn().mockResolvedValue({ id: 'follow-up-alert-id' });
    const audit = vi.fn().mockResolvedValue({});
    const processor = new UserInviteProcessor({
      conversationFollowUp: { findUnique: vi.fn().mockResolvedValue({
        id: 'follow-up-1',
        organizationId: 'organization-1',
        conversationId: 'conversation-1',
        failureReason: null,
        organization: { name: 'BZS Tecnologia' },
        responsible: { id: 'user-1', name: 'Gabriel Bayer', email: 'gabriel@example.com', status: 'ACTIVE' },
        conversation: { contact: { name: 'Maria' } },
      }) },
      auditLog: { create: audit },
    } as never, { sendFollowUpAlert } as never);

    await expect(processor.process({
      name: 'send-follow-up-alert',
      data: { followUpId: 'follow-up-1', reason: 'contact_replied_before_start' },
    } as never)).resolves.toEqual({ sent: true, followUpId: 'follow-up-1', providerMessageId: 'follow-up-alert-id' });
    expect(sendFollowUpAlert).toHaveBeenCalledWith(expect.objectContaining({
      to: 'gabriel@example.com',
      subject: 'Follow-up cancelado por resposta',
      followUpId: 'follow-up-1',
    }));
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'follow_up.alert_email_sent' }) });
  });
});
