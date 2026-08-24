import { describe, expect, it, vi } from 'vitest';
import { permissionScope, scopedWhere } from './data-scope.js';
import { AuthService } from './auth.service.js';

describe('permissionScope', () => {
  it('prioriza a permissão correspondente ao recurso e ação', () => {
    const scope = permissionScope({
      type: 'session', organizationId: 'o', userId: 'u', name: 'Teste',
      permissions: [{ resource: 'contacts', action: 'read', scope: 'TEAM' }],
    }, 'contacts');
    expect(scope).toBe('TEAM');
  });

  it('gera filtros diferentes para equipe e registros próprios', () => {
    const base = { type: 'session' as const, organizationId: 'o', userId: 'u', teamId: 't', name: 'Teste' };
    expect(scopedWhere({ ...base, permissions: [{ resource: 'contacts', action: 'read', scope: 'TEAM' }] }, 'contacts')).toEqual({ teamId: { in: ['t'] } });
    expect(scopedWhere({ ...base, permissions: [{ resource: 'contacts', action: 'read', scope: 'OWN' }] }, 'contacts')).toEqual({ ownerId: 'u' });
    expect(scopedWhere({ ...base, permissions: [{ resource: '*', action: '*', scope: 'ALL' }] }, 'contacts')).toEqual({});
  });
});

describe('recuperação de senha', () => {
  function dependencies(user: { id: string; organizationId: string; email: string } | null) {
    const reset = { id: 'reset-1' };
    const db = {
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue(reset),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new AuthService(
      db as never,
      { invalidateUser: vi.fn() } as never,
      {} as never,
      queue as never,
    );
    return { db, queue, service };
  }

  it('cria um token de uso único e agenda o e-mail', async () => {
    const { db, queue, service } = dependencies({
      id: 'user-1',
      organizationId: 'organization-1',
      email: 'gabriel@example.com',
    });

    await expect(service.requestPasswordReset(' GABRIEL@example.com ', {
      ip: '127.0.0.1',
      userAgent: 'Vitest',
    })).resolves.toEqual({ accepted: true });

    expect(db.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(db.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        createdById: 'user-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'send-password-reset',
      expect.objectContaining({
        passwordResetTokenId: 'reset-1',
        resetUrl: expect.stringContaining('/redefinir-senha?token='),
        expiresInMinutes: 60,
      }),
      expect.objectContaining({ jobId: 'password-reset-reset-1', attempts: 6 }),
    );
  });

  it('retorna a mesma resposta e não cria token para e-mail desconhecido', async () => {
    const { db, queue, service } = dependencies(null);

    await expect(service.requestPasswordReset('desconhecido@example.com', {
      ip: '127.0.0.2',
    })).resolves.toEqual({ accepted: true });

    expect(db.passwordResetToken.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('exige somente cinco caracteres na nova política de senha', async () => {
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      { add: vi.fn() } as never,
    );

    await expect(service.resetPassword('token', '1234')).rejects.toThrow('5 caracteres');
    await expect(service.acceptInvite('token', '1234')).rejects.toThrow('5 caracteres');
  });
});
