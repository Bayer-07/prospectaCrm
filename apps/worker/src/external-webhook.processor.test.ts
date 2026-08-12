import { afterEach, describe, expect, it, vi } from 'vitest';
import { processExternalWebhook } from './external-webhook.processor.js';

describe('webhooks externos via GET', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chama o endpoint ativo com GET e metadados da ação', async () => {
    const getMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const update = vi.fn().mockResolvedValue({});
    const db = {
      webhookDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'delivery-1',
          status: 'pending',
          eventId: 'event-1',
          eventType: 'contact.created',
          createdAt: new Date('2026-07-28T14:00:00.000Z'),
          payload: { entityType: 'Contact', entityId: 'contact-1' },
          webhook: {
            enabled: true,
            secretEncrypted: Buffer.from('segredo').toString('base64'),
            url: 'https://hooks.example.com/entrada?origem=bzs',
          },
        }),
        update,
      },
    };

    await processExternalWebhook(db as never, {
      data: { deliveryId: 'delivery-1' },
      attemptsMade: 0,
    } as never, { get: getMock });

    expect(getMock).toHaveBeenCalledOnce();
    const [rawTarget, options] = getMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    const target = new URL(rawTarget);
    expect(target.origin + target.pathname).toBe('https://hooks.example.com/entrada');
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      origem: 'bzs',
      event: 'contact.created',
      event_id: 'event-1',
      entity_type: 'Contact',
      entity_id: 'contact-1',
    });
    expect(options.headers).toMatchObject({
      'X-BZS-One-Event': 'contact.created',
      'X-BZS-One-Event-Id': 'event-1',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({ status: 'delivered' }),
    }));
  });

  it('não chama webhooks desativados', async () => {
    const getMock = vi.fn();
    const db = {
      webhookDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'delivery-1',
          status: 'pending',
          webhook: { enabled: false },
        }),
      },
    };

    await processExternalWebhook(db as never, {
      data: { deliveryId: 'delivery-1' },
      attemptsMade: 0,
    } as never, { get: getMock });

    expect(getMock).not.toHaveBeenCalled();
  });
});
