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
