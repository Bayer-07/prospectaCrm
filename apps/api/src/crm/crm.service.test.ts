import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { CrmService } from './crm.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Administrador',
  permissions: [{ resource: '*', action: '*', scope: 'ALL' }],
};

describe('filtros da listagem de empresas', () => {
  it('combina responsável, equipe, setor, porte e presença de contatos', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CrmService({ company: { findMany } } as never, {} as never);
    const teamId = '5e782196-23bc-4321-a044-e299da34dd89';

    await service.listCompanies(auth, {
      ownerId: 'none',
      teamId,
      sector: ' Tecnologia ',
      size: ' Médio ',
      hasContacts: 'true',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: auth.organizationId,
        archivedAt: null,
        AND: expect.arrayContaining([
          { ownerId: null },
          { teamId },
          { sector: { contains: 'Tecnologia', mode: 'insensitive' } },
          { size: { contains: 'Médio', mode: 'insensitive' } },
          { contacts: { some: { contact: { archivedAt: null } } } },
        ]),
      }),
    }));
  });

  it('permite filtrar empresas sem contatos ativos', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CrmService({ company: { findMany } } as never, {} as never);

    await service.listCompanies(auth, { hasContacts: 'false' });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { contacts: { none: { contact: { archivedAt: null } } } },
        ]),
      }),
    }));
  });

  it('rejeita identificadores e valores booleanos inválidos', () => {
    const findMany = vi.fn();
    const service = new CrmService({ company: { findMany } } as never, {} as never);

    expect(() => service.listCompanies(auth, { ownerId: 'inválido' }))
      .toThrow('Filtro de responsável inválido');
    expect(() => service.listCompanies(auth, { hasContacts: 'talvez' }))
      .toThrow('Filtro de contatos inválido');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('filtros da listagem de contatos', () => {
  it('combina filtros comerciais sem substituir o escopo de acesso', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CrmService({ contact: { findMany } } as never, {} as never);
    const teamId = '5e782196-23bc-4321-a044-e299da34dd89';
    const tagId = '2de40104-a827-4b60-ad28-3f85f6a0464c';

    await service.listContacts(auth, {
      ownerId: 'none',
      teamId,
      tagId,
      company: ' BZS ',
      hasPhone: 'true',
      hasEmail: 'false',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1',
        archivedAt: null,
        AND: expect.arrayContaining([
          { ownerId: null },
          { teamId },
          { tags: { some: { tagId } } },
          { companies: { some: { isPrimary: true, company: { name: { contains: 'BZS', mode: 'insensitive' } } } } },
          { phone: { not: null } },
          { email: null },
        ]),
      }),
    }));
  });

  it('rejeita identificadores inválidos antes de consultar o banco', () => {
    const findMany = vi.fn();
    const service = new CrmService({ contact: { findMany } } as never, {} as never);

    expect(() => service.listContacts(auth, { ownerId: 'qualquer-coisa' }))
      .toThrow('Filtro de responsável inválido');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('tarefas criadas por integrações', () => {
  const apiKeyAuth: AuthContext = {
    type: 'apiKey',
    organizationId: 'organization-1',
    name: 'MCP',
    permissions: [{ resource: 'tasks', action: 'write', scope: 'ALL' }],
    apiScopes: ['tasks:write'],
  };

  it('exige um responsável explícito para uma chave de API', async () => {
    const service = new CrmService({} as never, {} as never);
    await expect(service.createTask(apiKeyAuth, {
      title: 'Retornar contato',
      dueAt: '2026-07-29T12:00:00.000Z',
    })).rejects.toThrow('Informe o responsável pela tarefa');
  });

  it('valida o responsável e o usa como criador técnico da tarefa', async () => {
    const assigneeId = '70fab9f0-4308-4b26-8f2e-4ffbb32ba0c3';
    const teamId = '7537c3c3-064c-431c-b7c5-c4f1fd2a72c5';
    const findFirst = vi.fn().mockResolvedValue({ id: assigneeId, teamId });
    const create = vi.fn().mockResolvedValue({ id: 'task-1' });
    const service = new CrmService({
      user: { findFirst },
      task: { create },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      outboundWebhook: { findMany: vi.fn().mockResolvedValue([]) },
    } as never, { add: vi.fn() } as never);

    await service.createTask(apiKeyAuth, {
      title: 'Retornar contato',
      dueAt: '2026-07-29T12:00:00.000Z',
      assigneeId,
      priority: 'high',
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: assigneeId, organizationId: apiKeyAuth.organizationId, status: 'ACTIVE' },
    }));
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: apiKeyAuth.organizationId,
        teamId,
        createdById: assigneeId,
        assigneeId,
        priority: 'HIGH',
      }),
    });
  });

  it('enfileira todos os webhooks ativos configurados para a ação', async () => {
    const deliveryCreate = vi.fn()
      .mockResolvedValueOnce({ id: 'delivery-1' })
      .mockResolvedValueOnce({ id: 'delivery-2' });
    const queueAdd = vi.fn().mockResolvedValue({});
    const service = new CrmService({
      task: { create: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Retornar contato' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      outboundWebhook: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'webhook-1', events: ['task.created'] },
          { id: 'webhook-2', events: ['contact.created'] },
          { id: 'webhook-3', events: ['task.created'] },
        ]),
      },
      webhookDelivery: { create: deliveryCreate },
    } as never, { add: queueAdd } as never);

    await service.createTask(auth, {
      title: 'Retornar contato',
      dueAt: '2026-07-29T12:00:00.000Z',
      priority: 'medium',
    });

    expect(deliveryCreate).toHaveBeenCalledTimes(2);
    expect(deliveryCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ webhookId: 'webhook-1', eventType: 'task.created' }),
    });
    expect(deliveryCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ webhookId: 'webhook-3', eventType: 'task.created' }),
    });
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });
});

describe('unicidade do telefone de contatos', () => {
  it('impede cadastrar outro contato com o mesmo telefone', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'contact-existing' });
    const service = new CrmService({ contact: { findFirst } } as never, {} as never);

    await expect(service.createContact(auth, {
      name: 'Novo contato',
      phone: '+5545999225389',
    })).rejects.toThrow(/Já existe um contato com este número/);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        phoneKey: '+5545999225389',
      },
      select: { id: true },
    });
  });

  it('impede editar um contato para o telefone de outro', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: 'contact-1', consentStatus: 'UNKNOWN' })
      .mockResolvedValueOnce({ id: 'contact-2' });
    const service = new CrmService({ contact: { findFirst } } as never, {} as never);

    await expect(service.updateContact(auth, 'contact-1', {
      phone: '+5545999225389',
    })).rejects.toThrow(/Já existe um contato com este número/);

    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        phoneKey: '+5545999225389',
        id: { not: 'contact-1' },
      },
      select: { id: true },
    });
  });

  it('impede o mesmo celular brasileiro sem o nono dígito', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'contact-existing' });
    const service = new CrmService({ contact: { findFirst } } as never, {} as never);

    await expect(service.createContact(auth, {
      name: 'Mesmo contato',
      phone: '+554599225389',
    })).rejects.toThrow(/Já existe um contato com este número/);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        phoneKey: '+5545999225389',
      },
      select: { id: true },
    });
  });
});

describe('contato compartilhado no WhatsApp', () => {
  it('reutiliza o contato já salvo com o mesmo telefone normalizado', async () => {
    const existing = { id: 'contact-existing', name: 'José Inácio', phone: '+5537991911020' };
    const findFirst = vi.fn().mockResolvedValue(existing);
    const service = new CrmService({ contact: { findFirst } } as never, {} as never);

    await expect(service.saveSharedContact(auth, {
      name: 'José Inácio',
      phone: '+5537991911020',
    })).resolves.toEqual(existing);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        phoneKey: '+5537991911020',
      },
    });
  });
});

describe('importação de contatos por CSV', () => {
  it('aceita o modelo brasileiro separado por ponto e vírgula e campos opcionais vazios', async () => {
    const service = new CrmService({} as never, {} as never);
    const result = await service.importCsv(auth, {
      entityType: 'contacts',
      csv: '\uFEFFnome;email;telefone;cargo\r\nMaria Silva;;(45) 99999-9999;',
      mapping: { nome: 'name', email: 'email', telefone: 'phone', cargo: 'jobTitle' },
    });

    expect(result).toMatchObject({ total: 1, valid: 1, errors: 0 });
    expect(result.results).toEqual([{ row: 2, status: 'valid' }]);
  });

  it('normaliza telefone nacional antes de criar o contato', async () => {
    const service = new CrmService({} as never, {} as never);
    const createContact = vi.spyOn(service, 'createContact').mockResolvedValue({ id: 'contact-1' } as never);

    const result = await service.importCsv(auth, {
      entityType: 'contacts',
      csv: 'nome,telefone\nMaria Silva,45999999999',
      mapping: { nome: 'name', telefone: 'phone' },
      commit: true,
    });

    expect(createContact).toHaveBeenCalledWith(auth, expect.objectContaining({
      name: 'Maria Silva',
      phone: '+5545999999999',
    }));
    expect(result).toMatchObject({ total: 1, valid: 1, errors: 0 });
  });

  it('informa a linha e a causa quando um contato é inválido', async () => {
    const service = new CrmService({} as never, {} as never);
    const result = await service.importCsv(auth, {
      entityType: 'contacts',
      csv: 'nome;email\nA;email-invalido',
      mapping: { nome: 'name', email: 'email' },
    });

    expect(result).toMatchObject({ total: 1, valid: 0, errors: 1 });
    expect(result.results[0]).toMatchObject({ row: 2, status: 'error' });
    expect(result.results[0]?.error).toContain('name');
    expect(result.results[0]?.error).toContain('email');
  });
});
