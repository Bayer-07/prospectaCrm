import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { UsersService } from './users.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'admin-1',
  name: 'Gabriel Bayer',
  permissions: [{ resource: 'users', action: 'write', scope: 'ALL' }],
};

function dependencies(queueAdd = vi.fn().mockResolvedValue({ id: 'job-1' })) {
  const db = {
    role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Vendedor' }) },
    team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-1' }) },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'user-1' }),
      update: vi.fn(),
    },
    inviteToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'invite-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return { db, queue: { add: queueAdd } };
}

describe('convite de usuário por e-mail', () => {
  it('cria o token e agenda o envio transacional', async () => {
    const { db, queue } = dependencies();
    const service = new UsersService(db as never, queue as never);

    const result = await service.createInvite(auth, {
      name: 'Novo Usuário',
      email: 'NOVO.USUARIO@example.com',
      roleId: 'role-1',
      teamId: 'team-1',
    });

    expect(result).toEqual(expect.objectContaining({
      userId: 'user-1',
      email: 'novo.usuario@example.com',
      expiresInHours: 72,
      emailDelivery: 'QUEUED',
    }));
    expect(queue.add).toHaveBeenCalledWith(
      'send-user-invite',
      expect.objectContaining({
        inviteTokenId: 'invite-1',
        inviteUrl: expect.stringContaining('/aceitar-convite?token='),
        expiresInHours: 72,
      }),
      expect.objectContaining({
        jobId: 'user-invite-invite-1',
        attempts: 6,
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.invite_created',
        after: expect.objectContaining({ emailDelivery: 'QUEUED' }),
      }),
    });
  });

  it('registra falha quando a fila de e-mail está indisponível', async () => {
    const { db, queue } = dependencies(vi.fn().mockRejectedValue(new Error('Redis indisponível')));
    const service = new UsersService(db as never, queue as never);

    await expect(service.createInvite(auth, {
      name: 'Novo Usuário',
      email: 'novo.usuario@example.com',
      roleId: 'role-1',
      teamId: 'team-1',
    })).rejects.toThrow('não foi possível agendar o e-mail');

    expect(db.inviteToken.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { emailStatus: 'FAILED', emailError: 'Redis indisponível' },
    });
  });
});
