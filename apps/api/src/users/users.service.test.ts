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
  const db: any = {
    role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Vendedor' }) },
    team: {
      findFirst: vi.fn().mockResolvedValue({ id: 'team-1' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'team-1' }]),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'user-1' }),
      update: vi.fn().mockResolvedValue({ id: 'user-1' }),
    },
    inviteToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'invite-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  db.$transaction = vi.fn(async (operation: ((tx: typeof db) => Promise<unknown>) | Array<Promise<unknown>>) => (
    typeof operation === 'function' ? operation(db) : Promise.all(operation)
  ));
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
      teamIds: ['team-1'],
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
      teamIds: ['team-1'],
    })).rejects.toThrow('não foi possível agendar o e-mail');

    expect(db.inviteToken.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { emailStatus: 'FAILED', emailError: 'Redis indisponível' },
    });
  });

  it('libera o e-mail de um usuário excluído e cria uma nova identidade', async () => {
    const { db, queue } = dependencies();
    db.user.findFirst.mockResolvedValue({
      id: 'deleted-user-1',
      status: 'SUSPENDED',
    });
    db.user.create.mockResolvedValue({ id: 'new-user-1' });
    const authCache = { invalidateUser: vi.fn() };
    const service = new UsersService(db as never, queue as never, authCache as never);

    await expect(service.createInvite(auth, {
      name: 'Usuário recriado',
      email: 'REUTILIZADO@example.com',
      roleId: 'role-1',
      teamIds: ['team-1'],
    })).resolves.toEqual(expect.objectContaining({
      userId: 'new-user-1',
      email: 'reutilizado@example.com',
    }));

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'deleted-user-1' },
      data: {
        email: 'deleted.deleted-user-1@users.invalid',
        passwordHash: null,
      },
    });
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'reutilizado@example.com',
        status: 'INVITED',
      }),
    });
    expect(authCache.invalidateUser).toHaveBeenCalledWith('deleted-user-1');
    expect(authCache.invalidateUser).toHaveBeenCalledWith('new-user-1');
  });
});

describe('gestão de usuários', () => {
  it('troca a foto de perfil, invalida a sessão em cache e remove a foto anterior', async () => {
    const previousPhotoId = '21fcf811-2021-4aa5-9377-c0ffdf310a9c';
    const newPhotoId = '51e73c23-502d-4958-b5da-93ab2d9b01a8';
    const createdAt = new Date('2026-07-27T15:00:00Z');
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ profilePhotoId: previousPhotoId }),
        update: vi.fn().mockResolvedValue({
          id: 'admin-1',
          profilePhotoId: newPhotoId,
          profilePhoto: { createdAt },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const authCache = { invalidateUser: vi.fn() };
    const media = {
      confirmProfilePhotoAsset: vi.fn().mockResolvedValue({ id: newPhotoId, createdAt }),
      deleteAsset: vi.fn().mockResolvedValue(undefined),
    };
    const service = new UsersService(
      db as never,
      { add: vi.fn() } as never,
      authCache as never,
      undefined,
      media as never,
    );

    await expect(service.setMyProfilePhoto(auth, newPhotoId)).resolves.toEqual({
      id: 'admin-1',
      profilePhotoId: newPhotoId,
      profilePhotoUpdatedAt: createdAt.toISOString(),
    });

    expect(media.confirmProfilePhotoAsset).toHaveBeenCalledWith(auth, newPhotoId);
    expect(media.deleteAsset).toHaveBeenCalledWith(auth, previousPhotoId);
    expect(authCache.invalidateUser).toHaveBeenCalledWith('admin-1');
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.profile_photo_updated',
        before: { profilePhotoId: previousPhotoId },
        after: { profilePhotoId: newPhotoId },
      }),
    });
  });

  it('edita os dados, papel e equipe do usuário com auditoria', async () => {
    const target = {
      id: 'user-1',
      organizationId: 'organization-1',
      name: 'Nome antigo',
      email: 'antigo@example.com',
      status: 'ACTIVE',
      roleId: 'role-old',
      teamId: 'team-old',
      teamMemberships: [{ teamId: 'team-old' }],
      role: { id: 'role-old', key: 'seller', name: 'Vendedor' },
    };
    const updated = {
      id: 'user-1',
      name: 'Nome novo',
      email: 'novo@example.com',
      status: 'ACTIVE',
      role: { id: 'role-new', key: 'manager', name: 'Gestor' },
      teamMemberships: [{ team: { id: 'team-new', name: 'Prospecção', color: '#123456', isDefault: false } }],
    };
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValueOnce(target).mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
      role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-new', key: 'manager', name: 'Gestor' }) },
      team: {
        findFirst: vi.fn().mockResolvedValue({ id: 'team-default' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'team-new' }]),
      },
      userTeam: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      conversation: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const authCache = { invalidateUser: vi.fn() };
    const service = new UsersService(db as never, { add: vi.fn() } as never, authCache as never);

    await expect(service.updateUser(auth, 'user-1', {
      name: ' Nome novo ',
      email: 'NOVO@example.com',
      roleId: 'role-new',
      teamIds: ['team-new'],
    })).resolves.toEqual(expect.objectContaining({
      id: 'user-1',
      teams: [{ id: 'team-new', name: 'Prospecção', color: '#123456', isDefault: false }],
    }));

    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { name: 'Nome novo', email: 'novo@example.com', roleId: 'role-new', teamId: 'team-default' },
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.updated',
        entityId: 'user-1',
        before: expect.objectContaining({ email: 'antigo@example.com' }),
        after: expect.objectContaining({ email: 'novo@example.com' }),
      }),
    });
    expect(authCache.invalidateUser).toHaveBeenCalledWith('user-1');
  });

  it('retira atribuições abertas e encerradas ao remover uma equipe do usuário', async () => {
    const target = {
      id: 'user-1', organizationId: 'organization-1', name: 'Atendente', email: 'atendente@example.com',
      status: 'ACTIVE', roleId: 'role-1', role: { id: 'role-1', key: 'seller', name: 'Vendedor' },
      teamMemberships: [{ teamId: 'team-old' }, { teamId: 'team-new' }],
    };
    const conversationUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValueOnce(target).mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Atendente', email: 'atendente@example.com', status: 'ACTIVE', role: target.role, teamMemberships: [] }),
      },
      role: { findFirst: vi.fn().mockResolvedValue(target.role) },
      team: { findMany: vi.fn().mockResolvedValue([{ id: 'team-new' }]), findFirst: vi.fn().mockResolvedValue({ id: 'team-geral' }) },
      userTeam: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      conversation: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'open-1', status: 'OPEN', team: { id: 'team-old', name: 'Suporte' } },
          { id: 'closed-1', status: 'CLOSED', team: { id: 'team-old', name: 'Suporte' } },
        ]),
        updateMany: conversationUpdateMany,
      },
      conversationEvent: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const service = new UsersService(db as never, { add: vi.fn() } as never, { invalidateUser: vi.fn() } as never, { notifyOrganization: vi.fn() } as never);
    await service.updateUser(auth, 'user-1', { name: 'Atendente', email: 'atendente@example.com', roleId: 'role-1', teamIds: ['team-new'] });
    expect(conversationUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['open-1', 'closed-1'] } }, data: { assigneeId: null } });
    expect(conversationUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['open-1'] } }, data: { status: 'WAITING' } });
  });

  it('exclui logicamente o usuário, revoga sessões e libera atribuições', async () => {
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1',
          organizationId: 'organization-1',
          name: 'Usuário removido',
          email: 'removido@example.com',
          status: 'ACTIVE',
          roleId: 'role-1',
          teamId: 'team-1',
          role: { key: 'seller', name: 'Vendedor' },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      inviteToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      passwordResetToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      conversation: {
        findMany: vi.fn().mockResolvedValue([{ id: 'conversation-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      conversationEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      task: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      company: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      contact: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      opportunity: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const authCache = { invalidateUser: vi.fn() };
    const realtime = { disconnectUser: vi.fn() };
    const service = new UsersService(db as never, { add: vi.fn() } as never, authCache as never, realtime as never);

    await expect(service.deleteUser(auth, 'user-1')).resolves.toEqual({ id: 'user-1', deleted: true });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        status: 'SUSPENDED',
        email: 'deleted.user-1@users.invalid',
        passwordHash: null,
      },
    });
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { assigneeId: 'user-1', status: 'OPEN' },
      data: { assigneeId: null, status: 'WAITING' },
    });
    expect(db.conversationEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        conversationId: 'conversation-1',
        type: 'ASSIGNEE_REMOVED',
        metadata: { removedUserId: 'user-1' },
      })],
    });
    expect(db.task.updateMany).toHaveBeenCalledWith({
      where: { assigneeId: 'user-1', status: 'OPEN' },
      data: { assigneeId: null },
    });
    expect(authCache.invalidateUser).toHaveBeenCalledWith('user-1');
    expect(realtime.disconnectUser).toHaveBeenCalledWith('user-1');
  });

  it('impede que o usuário exclua a própria conta', async () => {
    const service = new UsersService({} as never, { add: vi.fn() } as never);
    await expect(service.deleteUser(auth, 'admin-1')).rejects.toThrow('própria conta');
  });

  it('protege o último administrador ativo', async () => {
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'admin-2',
          organizationId: 'organization-1',
          name: 'Administrador',
          email: 'admin@example.com',
          status: 'ACTIVE',
          roleId: 'role-admin',
          teamId: null,
          role: { key: 'admin', name: 'Administrador' },
        }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new UsersService(db as never, { add: vi.fn() } as never);
    await expect(service.deleteUser(auth, 'admin-2')).rejects.toThrow('pelo menos um administrador');
  });
});
