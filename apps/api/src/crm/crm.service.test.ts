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
