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
