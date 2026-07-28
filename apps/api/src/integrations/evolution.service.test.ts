import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { EvolutionService } from './evolution.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('conexões do WhatsApp', () => {
  it('desconecta o número na Evolution, atualiza o estado local e notifica as telas abertas', async () => {
    const instance = { id: 'instance-1', name: 'Comercial', instanceKey: 'comercial' };
    const disconnected = { ...instance, status: 'DISCONNECTED', connectedAt: null };
    const update = vi.fn().mockResolvedValue(disconnected);
    const auditCreate = vi.fn().mockResolvedValue({});
    const notifyOrganization = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') });
    const previousApiKey = process.env.EVOLUTION_API_KEY;
    process.env.EVOLUTION_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', fetchMock);
    const service = new EvolutionService({
      whatsappInstance: {
        findFirst: vi.fn().mockResolvedValue(instance),
        update,
      },
      auditLog: { create: auditCreate },
    } as never, {} as never, {} as never, { notifyOrganization } as never);

    try {
      await expect(service.logout(auth, instance.id)).resolves.toEqual(disconnected);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8080/instance/logout/comercial',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: instance.id },
        data: { status: 'DISCONNECTED', connectedAt: null },
      });
      expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'whatsapp.instance_disconnected',
          entityId: instance.id,
        }),
      }));
      expect(notifyOrganization).toHaveBeenCalledWith(
        auth.organizationId,
        'whatsapp.updated',
        { instanceId: instance.id },
      );
    } finally {
      if (previousApiKey === undefined) delete process.env.EVOLUTION_API_KEY;
      else process.env.EVOLUTION_API_KEY = previousApiKey;
      vi.unstubAllGlobals();
    }
  });

  it('reconcilia cada conexão pelo instanceKey sem compartilhar o estado entre os cards', async () => {
    const instances = [
      { id: 'instance-1', instanceKey: 'comercial', status: 'CONNECTED', connectedAt: new Date('2026-07-28T10:00:00Z') },
      { id: 'instance-2', instanceKey: 'teste', status: 'DISCONNECTED', connectedAt: null },
    ];
    const update = vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify([
        { name: 'comercial', connectionStatus: 'close' },
        { name: 'teste', connectionStatus: 'open' },
      ])),
    });
    const previousApiKey = process.env.EVOLUTION_API_KEY;
    process.env.EVOLUTION_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', fetchMock);
    const service = new EvolutionService({
      whatsappInstance: {
        findMany: vi.fn().mockResolvedValue(instances),
        update,
      },
    } as never, {} as never, {} as never, {} as never);

    try {
      const result = await service.listInstances(auth);

      expect(result).toEqual([
        expect.objectContaining({ id: 'instance-1', status: 'DISCONNECTED', connectedAt: null }),
        expect.objectContaining({ id: 'instance-2', status: 'CONNECTED', connectedAt: expect.any(Date) }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'instance-1' },
        data: { status: 'DISCONNECTED', connectedAt: null },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'instance-2' },
        data: { status: 'CONNECTED', connectedAt: expect.any(Date) },
      });
    } finally {
      if (previousApiKey === undefined) delete process.env.EVOLUTION_API_KEY;
      else process.env.EVOLUTION_API_KEY = previousApiKey;
      vi.unstubAllGlobals();
    }
  });

  it('devolve o QR da Evolution como imagem e mantém a instância em conexão', async () => {
    const instance = { id: 'instance-1', instanceKey: 'comercial' };
    const update = vi.fn().mockResolvedValue({});
    const notifyOrganization = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ base64: 'data:image/png;base64,QUJD' })),
    });
    const previousApiKey = process.env.EVOLUTION_API_KEY;
    process.env.EVOLUTION_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', fetchMock);
    const service = new EvolutionService({
      whatsappInstance: {
        findFirst: vi.fn().mockResolvedValue(instance),
        update,
      },
    } as never, {} as never, {} as never, { notifyOrganization } as never);

    try {
      await expect(service.connect(auth, instance.id)).resolves.toEqual({
        qrcode: 'data:image/png;base64,QUJD',
        expiresInSeconds: 30,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: instance.id },
        data: { status: 'CONNECTING', qrExpiresAt: expect.any(Date) },
      });
      expect(notifyOrganization).toHaveBeenCalledWith('organization-1', 'whatsapp.updated', {
        instanceId: instance.id,
      });
    } finally {
      if (previousApiKey === undefined) delete process.env.EVOLUTION_API_KEY;
      else process.env.EVOLUTION_API_KEY = previousApiKey;
      vi.unstubAllGlobals();
    }
  });

  it('arquiva a conexão local mesmo se a sessão remota já estiver quebrada', async () => {
    const instance = { id: 'instance-1', name: 'Comercial', instanceKey: 'comercial' };
    const archived = { ...instance, status: 'DISCONNECTED', archivedAt: new Date() };
    const update = vi.fn().mockResolvedValue(archived);
    const auditCreate = vi.fn().mockResolvedValue({});
    const notifyOrganization = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Connection Closed' })),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const previousApiKey = process.env.EVOLUTION_API_KEY;
    process.env.EVOLUTION_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', fetchMock);
    const service = new EvolutionService({
      whatsappInstance: {
        findFirst: vi.fn().mockResolvedValue(instance),
        update,
      },
      auditLog: { create: auditCreate },
    } as never, {} as never, {} as never, { notifyOrganization } as never);

    try {
      await expect(service.deleteInstance(auth, instance.id)).resolves.toEqual(archived);
      expect(update).toHaveBeenCalledWith({
        where: { id: instance.id },
        data: {
          status: 'DISCONNECTED',
          connectedAt: null,
          archivedAt: expect.any(Date),
          instanceKey: expect.stringMatching(/^comercial__deleted__/),
        },
      });
      expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'whatsapp.instance_deleted',
          after: expect.objectContaining({ providerCleanupPending: true }),
        }),
      }));
      expect(notifyOrganization).toHaveBeenCalledWith('organization-1', 'whatsapp.updated', {
        instanceId: instance.id,
      });
    } finally {
      warn.mockRestore();
      if (previousApiKey === undefined) delete process.env.EVOLUTION_API_KEY;
      else process.env.EVOLUTION_API_KEY = previousApiKey;
      vi.unstubAllGlobals();
    }
  });
});

describe('paginated conversation history', () => {
  it('returns the newest messages in chronological order and a cursor for older records', async () => {
    const newest = { id: 'message-3', createdAt: new Date('2026-07-20T13:03:00Z'), media: [] };
    const middle = { id: 'message-2', createdAt: new Date('2026-07-20T13:02:00Z'), media: [] };
    const oldest = { id: 'message-1', createdAt: new Date('2026-07-20T13:01:00Z'), media: [] };
    const findMany = vi.fn().mockResolvedValue([newest, middle, oldest]);
    const eventFindMany = vi.fn().mockResolvedValue([]);
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1' }) },
      message: { findMany },
      conversationEvent: { findMany: eventFindMany },
    };
    const service = new EvolutionService(db as never, {} as never, {} as never, {} as never);

    const page = await service.conversationMessages(auth, 'conversation-1', { limit: '2' });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    expect(page.messages.map((message) => message.id)).toEqual(['message-2', 'message-3']);
    expect(page.nextCursor).toBe('message-2');
    expect(eventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: middle.createdAt } }),
    }));
  });
});

describe('busca global de atendimentos', () => {
  it('busca somente conversas aguardando ou abertas dentro da visibilidade do usuário', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new EvolutionService({
      conversation: { findMany },
      conversationPin: { findMany: vi.fn().mockResolvedValue([]) },
    } as never, {} as never, {} as never, {} as never);
    const scopedAuth = { ...auth, roleKey: 'sdr', teamId: 'team-1' };

    await service.conversations(scopedAuth, {
      status: 'active',
      search: 'Bayer',
      limit: '5',
    });

    const request = findMany.mock.calls[0]?.[0] as any;
    expect(request.take).toBe(5);
    expect(request.where.organizationId).toBe('organization-1');
    expect(request.where.AND).toEqual(expect.arrayContaining([
      {
        OR: [
          { assigneeId: 'user-1' },
          { assigneeId: null, instance: { teams: { some: { teamId: 'team-1' } } } },
        ],
      },
      { status: { in: ['WAITING', 'OPEN'] } },
      expect.objectContaining({
        OR: expect.arrayContaining([
          { contact: { name: { contains: 'Bayer', mode: 'insensitive' } } },
          { contact: { phone: { contains: 'Bayer', mode: 'insensitive' } } },
          { contact: { email: { contains: 'Bayer', mode: 'insensitive' } } },
        ]),
      }),
    ]));
  });

  it('aplica conexão, atendente e período da última interação na consulta completa', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new EvolutionService({
      conversation: { findMany },
      conversationPin: { findMany: vi.fn().mockResolvedValue([]) },
    } as never, {} as never, {} as never, {} as never);

    await service.conversations(auth, {
      status: 'open',
      instanceId: 'instance-1',
      assigneeId: 'user-2',
      lastInteractionFrom: '2026-07-01T03:00:00.000Z',
      lastInteractionTo: '2026-08-01T03:00:00.000Z',
    });

    const request = findMany.mock.calls[0]?.[0] as any;
    expect(request.where.AND).toEqual(expect.arrayContaining([
      { instanceId: 'instance-1' },
      { assigneeId: 'user-2' },
      {
        lastMessageAt: {
          gte: new Date('2026-07-01T03:00:00.000Z'),
          lt: new Date('2026-08-01T03:00:00.000Z'),
        },
      },
    ]));
  });

  it('permite filtrar tickets sem atendente', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new EvolutionService({
      conversation: { findMany },
      conversationPin: { findMany: vi.fn().mockResolvedValue([]) },
    } as never, {} as never, {} as never, {} as never);

    await service.conversations(auth, { assigneeId: 'unassigned' });

    const request = findMany.mock.calls[0]?.[0] as any;
    expect(request.where.AND).toContainEqual({ assigneeId: null });
  });
});

describe('opções dos filtros de atendimento', () => {
  it('expõe todas as conexões e usuários para o administrador no modo de visão geral', async () => {
    const instances = [{ id: 'instance-1', name: 'Comercial', status: 'CONNECTED' }];
    const users = [{ id: 'user-1', name: 'Gabriel', email: 'gabriel@bzs.com.br' }];
    const instanceFindMany = vi.fn().mockResolvedValue(instances);
    const userFindMany = vi.fn().mockResolvedValue(users);
    const service = new EvolutionService({
      whatsappInstance: { findMany: instanceFindMany },
      user: { findMany: userFindMany },
    } as never, {} as never, {} as never, {} as never);

    await expect(service.conversationFilterOptions(auth, 'all')).resolves.toEqual({ instances, users });

    expect(instanceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'organization-1', archivedAt: null },
    }));
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'organization-1', status: 'ACTIVE' },
    }));
  });

  it('limita conexões à equipe e usuários ao próprio operador fora da visão geral', async () => {
    const instanceFindMany = vi.fn().mockResolvedValue([]);
    const userFindMany = vi.fn().mockResolvedValue([]);
    const service = new EvolutionService({
      whatsappInstance: { findMany: instanceFindMany },
      user: { findMany: userFindMany },
    } as never, {} as never, {} as never, {} as never);
    const scopedAuth = { ...auth, roleKey: 'sdr', teamId: 'team-1' };

    await service.conversationFilterOptions(scopedAuth, 'mine');

    expect(instanceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'organization-1',
        archivedAt: null,
        teams: { some: { teamId: 'team-1' } },
      },
    }));
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'organization-1',
        status: 'ACTIVE',
        id: 'user-1',
      },
    }));
  });
});

describe('conversas fixadas', () => {
  it('mantém os fixados do usuário antes das conversas recentes', async () => {
    const pinnedConversation = { id: 'conversation-pinned', contact: { id: 'contact-1', name: 'Fixado' } };
    const recentConversation = { id: 'conversation-recent', contact: { id: 'contact-2', name: 'Recente' } };
    const conversationPinFindMany = vi.fn().mockResolvedValue([{ conversation: pinnedConversation }]);
    const conversationFindMany = vi.fn().mockResolvedValue([recentConversation]);
    const service = new EvolutionService({
      conversationPin: { findMany: conversationPinFindMany },
      conversation: { findMany: conversationFindMany },
    } as never, {} as never, {} as never, {} as never);

    const result = await service.conversations(auth, { status: 'open', limit: '10' });

    expect(result).toEqual([
      { ...pinnedConversation, isPinned: true },
      { ...recentConversation, isPinned: false },
    ]);
    expect(conversationPinFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        conversation: { is: expect.objectContaining({ organizationId: 'organization-1', status: 'OPEN' }) },
      }),
      orderBy: { createdAt: 'desc' },
      take: 10,
    }));
    expect(conversationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { notIn: ['conversation-pinned'] } }),
      take: 9,
    }));
  });

  it('salva e remove a fixação somente depois de validar a visibilidade', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', status: 'OPEN' }) },
      conversationPin: { upsert, deleteMany },
    };
    const service = new EvolutionService(db as never, {} as never, {} as never, {} as never);

    await expect(service.setConversationPinned(auth, 'conversation-1', true)).resolves.toEqual({
      id: 'conversation-1',
      isPinned: true,
    });
    await expect(service.setConversationPinned(auth, 'conversation-1', false)).resolves.toEqual({
      id: 'conversation-1',
      isPinned: false,
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_conversationId: { userId: 'user-1', conversationId: 'conversation-1' } },
      create: { userId: 'user-1', conversationId: 'conversation-1' },
    }));
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', conversationId: 'conversation-1' },
    });
  });

  it.each(['WAITING', 'CLOSED'])('impede fixar uma conversa com status %s', async (status) => {
    const upsert = vi.fn();
    const service = new EvolutionService({
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', status }) },
      conversationPin: { upsert, deleteMany: vi.fn() },
    } as never, {} as never, {} as never, {} as never);

    await expect(service.setConversationPinned(auth, 'conversation-1', true))
      .rejects.toThrow('Somente conversas abertas podem ser fixadas');
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('responsabilidade ao abrir um atendimento', () => {
  it('transfere uma conversa encerrada para o usuário que a reabriu', async () => {
    const previous = {
      id: 'conversation-1',
      remoteJid: '5511999999999@s.whatsapp.net',
      status: 'CLOSED',
      assigneeId: 'user-anterior',
    };
    const updated = {
      ...previous,
      status: 'OPEN',
      assigneeId: 'user-1',
      assignee: { id: 'user-1', name: 'Gabriel' },
    };
    const update = vi.fn().mockResolvedValue(updated);
    const createEvent = vi.fn().mockResolvedValue({ id: 'event-1' });
    const db = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(previous),
        update,
      },
      chatbotSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      conversationEvent: { create: createEvent },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);

    await expect(service.setConversationStatus(auth, 'conversation-1', 'OPEN')).resolves.toEqual(updated);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: {
        status: 'OPEN',
        assigneeId: 'user-1',
        closedAt: null,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-1',
        type: 'reopened',
        text: 'Gabriel reabriu e assumiu o atendimento',
        metadata: {
          previousAssigneeId: 'user-anterior',
          assigneeId: 'user-1',
        },
      }),
    });
    expect(realtime.notifyOrganization).toHaveBeenCalledWith('organization-1', 'inbox.updated', {
      conversationId: 'conversation-1',
    });
  });

  it('atribui ao usuário uma conversa encerrada iniciada pelo seletor de contatos', async () => {
    const existing = {
      id: 'conversation-1',
      status: 'CLOSED',
      assigneeId: 'user-anterior',
    };
    const updated = {
      ...existing,
      status: 'OPEN',
      assigneeId: 'user-1',
      assignee: { id: 'user-1', name: 'Gabriel' },
    };
    const update = vi.fn().mockResolvedValue(updated);
    const createEvent = vi.fn().mockResolvedValue({ id: 'event-1' });
    const db = {
      contact: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'contact-1',
          phone: '+55 (11) 99999-9999',
        }),
      },
      whatsappInstance: { findFirst: vi.fn().mockResolvedValue({ id: 'instance-1' }) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update,
      },
      conversationEvent: { create: createEvent },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);

    await expect(service.startConversation(auth, {
      contactId: 'contact-1',
      instanceId: 'instance-1',
    })).resolves.toEqual(updated);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: {
        contactId: 'contact-1',
        assigneeId: 'user-1',
        status: 'OPEN',
        closedAt: null,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'reopened',
        text: 'Gabriel reabriu e assumiu o atendimento',
        metadata: expect.objectContaining({
          previousAssigneeId: 'user-anterior',
          assigneeId: 'user-1',
        }),
      }),
    });
  });
});

describe('troca da conexão de uma conversa', () => {
  it('troca somente a conexão da conversa, registra o histórico e preserva as mensagens existentes', async () => {
    const currentConversation = {
      id: 'conversation-1',
      instanceId: 'instance-old',
      contactId: 'contact-1',
      remoteJid: '83953759293475@lid',
      phoneJid: null,
      instance: {
        id: 'instance-old',
        name: 'Comercial',
        status: 'DISCONNECTED',
        archivedAt: null,
      },
      contact: { phone: '+55 (45) 99922-5389' },
    };
    const targetInstance = {
      id: 'instance-new',
      name: 'Atendimento',
      phone: '+55 (45) 99999-0000',
      status: 'CONNECTED',
    };
    const updatedConversation = {
      id: currentConversation.id,
      instanceId: targetInstance.id,
      remoteJid: '5545999225389@s.whatsapp.net',
      phoneJid: '5545999225389@s.whatsapp.net',
      instance: targetInstance,
    };
    const findConversation = vi.fn()
      .mockResolvedValueOnce(currentConversation)
      .mockResolvedValueOnce(null);
    const updateConversation = vi.fn().mockResolvedValue(updatedConversation);
    const createEvent = vi.fn().mockResolvedValue({ id: 'event-1' });
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const db = {
      conversation: {
        findFirst: findConversation,
        update: updateConversation,
      },
      whatsappInstance: { findFirst: vi.fn().mockResolvedValue(targetInstance) },
      conversationEvent: { create: createEvent },
      auditLog: { create: createAudit },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);

    await expect(service.changeConversationInstance(auth, currentConversation.id, targetInstance.id))
      .resolves.toEqual(updatedConversation);

    expect(updateConversation).toHaveBeenCalledWith({
      where: { id: currentConversation.id },
      data: {
        instanceId: targetInstance.id,
        remoteJid: '5545999225389@s.whatsapp.net',
        phoneJid: '5545999225389@s.whatsapp.net',
      },
      include: {
        instance: { select: { id: true, name: true, phone: true, status: true, archivedAt: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: currentConversation.id,
        type: 'instance_changed',
        text: 'Gabriel alterou a conexão de “Comercial” para “Atendimento”',
        metadata: {
          previousInstanceId: 'instance-old',
          previousInstanceName: 'Comercial',
          instanceId: 'instance-new',
          instanceName: 'Atendimento',
        },
      }),
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'conversation.instance_changed',
        entityId: currentConversation.id,
        before: expect.objectContaining({ instanceId: 'instance-old' }),
        after: expect.objectContaining({ instanceId: 'instance-new' }),
      }),
    });
    expect(realtime.notifyOrganization).toHaveBeenCalledWith(auth.organizationId, 'inbox.updated', {
      conversationId: currentConversation.id,
      previousInstanceId: 'instance-old',
      instanceId: 'instance-new',
    });
    expect(db).not.toHaveProperty('message');
  });

  it.each(['CONNECTED', 'CONNECTING', 'ERROR', 'PAUSED'])('recusa a troca enquanto a conexão atual está em %s', async (status) => {
    const targetFindFirst = vi.fn();
    const updateConversation = vi.fn();
    const service = new EvolutionService({
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'conversation-1',
          instanceId: 'instance-current',
          contactId: 'contact-1',
          remoteJid: '5545999225389@s.whatsapp.net',
          phoneJid: '5545999225389@s.whatsapp.net',
          instance: {
            id: 'instance-current',
            name: 'Comercial',
            status,
            archivedAt: null,
          },
          contact: { phone: '+5545999225389' },
        }),
        update: updateConversation,
      },
      whatsappInstance: { findFirst: targetFindFirst },
    } as never, {} as never, {} as never, {} as never);

    await expect(service.changeConversationInstance(auth, 'conversation-1', 'instance-new'))
      .rejects.toThrow('A conexão atual precisa estar desconectada ou excluída para ser substituída');
    expect(targetFindFirst).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it('reenvia uma mensagem que falhou usando a nova conexão da conversa', async () => {
    const updateMessage = vi.fn().mockResolvedValue({ id: 'message-1', instanceId: 'instance-new', status: 'QUEUED' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const service = new EvolutionService({
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'conversation-1',
          instanceId: 'instance-new',
          status: 'OPEN',
          assigneeId: 'user-1',
        }),
      },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'message-1',
          conversationId: 'conversation-1',
          instanceId: 'instance-old',
          direction: 'OUTBOUND',
          status: 'FAILED',
          payload: {},
        }),
        update: updateMessage,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as never, {} as never, outboundQueue as never, { notifyOrganization: vi.fn() } as never);

    await service.retryMessage(auth, 'conversation-1', 'message-1');

    expect(updateMessage).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: expect.objectContaining({
        instanceId: 'instance-new',
        status: 'QUEUED',
      }),
    }));
    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send-message',
      { messageId: 'message-1' },
      expect.objectContaining({ attempts: 5 }),
    );
  });
});

describe('verificação de números no WhatsApp', () => {
  it('consulta a Evolution e marca respostas ausentes como inexistentes', async () => {
    const service = new EvolutionService({} as never, {} as never, {} as never, {} as never);
    service.request = vi.fn().mockResolvedValue({
      numbers: [{ number: '5511999999999', exists: true, jid: '5511999999999@s.whatsapp.net' }],
    });

    const result = await service.checkWhatsappNumbers('comercial', ['+55 (11) 99999-9999', '+55 11 98888-8888']);

    expect(service.request).toHaveBeenCalledWith('/chat/whatsappNumbers/comercial', {
      method: 'POST',
      body: JSON.stringify({ numbers: ['5511999999999', '5511988888888'] }),
    });
    expect(result).toEqual([
      { number: '5511999999999', exists: true, jid: '5511999999999@s.whatsapp.net' },
      { number: '5511988888888', exists: false },
    ]);
  });
});

describe('assinatura do operador', () => {
  it('adiciona o nome autenticado antes da mensagem quando a preferência está ativa', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'message-1' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', status: 'OPEN', assigneeId: 'user-1' }) },
      message: { create },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, outboundQueue as never, realtime as never);

    await service.sendMessage({ ...auth, name: 'Gabriel Bayer', messageSignatureEnabled: true }, 'conversation-1', { type: 'text', text: 'Olá' });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      text: '*Gabriel Bayer:*\nOlá',
      payload: expect.objectContaining({ signature: { userId: 'user-1', name: 'Gabriel Bayer' } }),
    }) });
  });

  it('aplica a assinatura na legenda de um anexo conforme a opção visível no composer', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'message-2' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', status: 'OPEN', assigneeId: 'user-1' }) },
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ id: 'media-1', key: 'organization-1/imagem.png' }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      message: { create },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, outboundQueue as never, realtime as never);

    await service.sendMessage(
      { ...auth, name: 'Gabriel Bayer', messageSignatureEnabled: false },
      'conversation-1',
      { type: 'image', text: 'Oi', mediaKey: 'organization-1/imagem.png', signatureEnabled: true },
    );

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'image',
      text: '*Gabriel Bayer:*\nOi',
      payload: expect.objectContaining({
        mediaKey: 'organization-1/imagem.png',
        signature: { userId: 'user-1', name: 'Gabriel Bayer' },
      }),
    }) });
  });

  it('não cria uma legenda apenas para incluir a assinatura quando o anexo não tem texto', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'message-3' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', status: 'OPEN', assigneeId: 'user-1' }) },
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ id: 'media-1', key: 'organization-1/imagem.png' }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      message: { create },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, outboundQueue as never, realtime as never);

    await service.sendMessage(
      { ...auth, name: 'Gabriel Bayer', messageSignatureEnabled: true },
      'conversation-1',
      { type: 'image', mediaKey: 'organization-1/imagem.png', signatureEnabled: true },
    );

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'image',
      text: undefined,
      payload: expect.objectContaining({ signature: null }),
    }) });
  });
});

describe('reações em mensagens do WhatsApp', () => {
  it('envia a chave original da mensagem recebida e persiste a reação', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'message-1' });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', remoteJid: '5511999999999@s.whatsapp.net', status: 'OPEN', assigneeId: 'user-1', instance: { instanceKey: 'comercial' } }) },
      whatsappInstance: { findUnique: vi.fn().mockResolvedValue({ id: 'instance-1', instanceKey: 'comercial' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({ id: 'message-1', providerMessageId: 'provider-1', direction: 'INBOUND', payload: {} }),
        update,
      },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);
    service.request = vi.fn().mockResolvedValue({});

    await service.reactToMessage(auth, 'conversation-1', 'message-1', '👍');

    expect(service.request).toHaveBeenCalledWith('/message/sendReaction/comercial', {
      method: 'POST',
      body: JSON.stringify({
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'provider-1' },
        reaction: '👍',
      }),
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: { payload: expect.objectContaining({ reactions: [expect.objectContaining({ emoji: '👍', userId: 'user-1', userName: 'Gabriel' })] }) },
    }));
  });
});

describe('edição e exclusão de mensagens enviadas', () => {
  function setup(messageOverrides: Record<string, unknown> = {}) {
    const update = vi.fn().mockResolvedValue({ id: 'message-1' });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', contactId: 'contact-1', remoteJid: '5511999999999@s.whatsapp.net', status: 'OPEN', assigneeId: 'user-1', instance: { instanceKey: 'comercial' } }) },
      whatsappInstance: { findUnique: vi.fn().mockResolvedValue({ id: 'instance-1', instanceKey: 'comercial' }) },
      contact: { findUnique: vi.fn().mockResolvedValue({ phone: '+5511999999999' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'message-1',
          providerMessageId: 'provider-1',
          conversationId: 'conversation-1',
          direction: 'OUTBOUND',
          type: 'text',
          text: 'Texto original',
          status: 'SENT',
          payload: { provider: { key: { remoteJid: '5511999999999@s.whatsapp.net' } } },
          ...messageOverrides,
        }),
        update,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);
    service.request = vi.fn().mockResolvedValue({});
    return { db, service, update };
  }

  it('envia o contrato de edição esperado pela Evolution', async () => {
    const { service, update } = setup();

    await service.editMessage(auth, 'conversation-1', 'message-1', 'Texto corrigido');

    expect(service.request).toHaveBeenCalledWith('/chat/updateMessage/comercial', {
      method: 'POST',
      body: JSON.stringify({
        number: '5511999999999@s.whatsapp.net',
        text: 'Texto corrigido',
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: 'provider-1' },
      }),
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: expect.objectContaining({
        text: 'Texto corrigido',
        payload: expect.objectContaining({
          edited: true,
          editedAt: expect.any(String),
          editedBy: 'user-1',
          editHistory: [
            expect.objectContaining({
              text: 'Texto original',
              editedAt: expect.any(String),
              editedBy: 'user-1',
            }),
          ],
        }),
      }),
    }));
  });

  it('preserva o identificador LID usado pela mensagem ao editar', async () => {
    const remoteJid = '83953759293475@lid';
    const { service } = setup({ payload: { provider: { key: { remoteJid } } } });

    await service.editMessage(auth, 'conversation-1', 'message-1', 'Texto corrigido');

    expect(service.request).toHaveBeenCalledWith('/chat/updateMessage/comercial', {
      method: 'POST',
      body: JSON.stringify({
        number: remoteJid,
        text: 'Texto corrigido',
        key: { remoteJid, fromMe: true, id: 'provider-1' },
      }),
    });
  });

  it('envia o contrato de exclusão para todos esperado pela Evolution', async () => {
    const { service, update } = setup({ type: 'image', text: 'Legenda' });

    await service.deleteMessage(auth, 'conversation-1', 'message-1');

    expect(service.request).toHaveBeenCalledWith('/chat/deleteMessageForEveryone/comercial', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'provider-1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: true }),
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: {
        payload: expect.objectContaining({
          deleted: true,
          originalType: 'image',
          originalText: 'Legenda',
        }),
      },
    }));
  });
});
