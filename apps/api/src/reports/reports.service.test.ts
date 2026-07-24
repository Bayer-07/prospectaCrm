import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service.js';
import type { AuthContext } from '../auth/types.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  name: 'Operador',
  permissions: [],
};

describe('leitura de notificações', () => {
  it('marca somente as notificações não lidas do usuário atual', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 });
    const service = new ReportsService({ notification: { updateMany } } as never);

    await expect(service.readAllNotifications(auth)).resolves.toEqual({ count: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('não permite marcar uma notificação sem um usuário autenticado', async () => {
    const findFirst = vi.fn();
    const service = new ReportsService({ notification: { findFirst } } as never);

    await expect(service.readNotification({ ...auth, userId: undefined }, 'notification-1')).rejects.toThrow('Notificação não encontrada');
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('modelos de e-mail', () => {
  it('inicializa uma vez os modelos padrão do SGA para a organização', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 5 });
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const findMany = vi.fn().mockResolvedValue([{ id: 'template-1' }]);
    const service = new ReportsService({
      emailTemplate: { createMany, findMany },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createAudit,
      },
    } as never);

    await expect(service.emailTemplates(auth)).resolves.toEqual([{ id: 'template-1' }]);
    await service.emailTemplates(auth);

    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ organizationId: auth.organizationId, name: 'SGA · 01 Primeiro contato' }),
      ]),
      skipDuplicates: true,
    }));
    expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'email_templates.sga_initialized',
      entityId: 'sga-v1',
    }) });
  });

  it('exclui um modelo da organização e registra auditoria', async () => {
    const remove = vi.fn().mockResolvedValue({});
    const audit = vi.fn().mockResolvedValue({});
    const transaction = vi.fn().mockResolvedValue([]);
    const service = new ReportsService({
      emailTemplate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'template-1',
          name: 'Prospecção',
          subject: 'Olá',
        }),
        delete: remove,
      },
      auditLog: { create: audit },
      $transaction: transaction,
    } as never);

    const result = await service.deleteEmailTemplate(auth, 'template-1');

    expect(remove).toHaveBeenCalledWith({ where: { id: 'template-1' } });
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId: auth.organizationId,
      action: 'email_template.deleted',
      entityId: 'template-1',
    }) });
    expect(transaction).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'template-1', deletedAt: expect.any(String) });
  });
});
