import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { OutboundWebhookUrlService } from './outbound-webhook-url.service.js';
import { ReportsService } from './reports.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  name: 'Administrador',
  permissions: [{ resource: '*', action: '*', scope: 'ALL' }],
};

const publicResolver = vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);

function reportsService(db: object) {
  return new ReportsService(db as never, new OutboundWebhookUrlService(publicResolver));
}

describe('configuração de webhooks', () => {
  it('cria vários webhooks desativados e com apenas uma ação por registro', async () => {
    const create = vi.fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: crypto.randomUUID(), ...data }));
    const service = reportsService({ outboundWebhook: { create } });

    await service.createOutboundWebhook(auth, {
      name: 'Novo contato',
      endpoint: 'https://hooks.example.com/contatos',
      action: 'contact.created',
    });
    await service.createOutboundWebhook(auth, {
      name: 'Empresa atualizada',
      endpoint: 'https://hooks.example.com/empresas',
      action: 'company.updated',
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        organizationId: auth.organizationId,
        url: 'https://hooks.example.com/contatos',
        events: ['contact.created'],
        enabled: false,
      }),
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        events: ['company.updated'],
        enabled: false,
      }),
    });
  });

  it('rejeita endpoints e ações inválidas', async () => {
    const service = reportsService({});

    await expect(service.createOutboundWebhook(auth, {
      name: 'Webhook inválido',
      endpoint: 'ftp://example.com/entrada',
      action: 'contact.created',
    })).rejects.toThrow('endpoint HTTP ou HTTPS');
    await expect(service.createOutboundWebhook(auth, {
      name: 'Webhook inválido',
      endpoint: 'http://169.254.169.254/latest/meta-data',
      action: 'contact.created',
    })).rejects.toThrow('endpoint HTTP ou HTTPS público');
    await expect(service.createOutboundWebhook(auth, {
      name: 'Webhook inválido',
      endpoint: 'https://example.com/entrada',
      action: 'qualquer.acao',
    })).rejects.toThrow('ação válida');
  });

  it('ativa somente o webhook pertencente à organização', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 'webhook-1',
      name: 'Novo contato',
      url: 'https://hooks.example.com/contatos',
      events: ['contact.created'],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = reportsService({
      outboundWebhook: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'webhook-1',
          name: 'Novo contato',
          url: 'https://hooks.example.com/contatos',
          events: ['contact.created'],
          enabled: false,
        }),
        update,
      },
    });

    const result = await service.updateOutboundWebhook(auth, 'webhook-1', { enabled: true });

    expect(result.enabled).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'webhook-1' },
      data: expect.objectContaining({ enabled: true }),
    }));
  });
});
