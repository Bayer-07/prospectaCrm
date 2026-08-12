import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCipheriv, createHash } from 'node:crypto';
import { processExternalWebhook } from './external-webhook.processor.js';

function encryptWebhookSecret(value: string, secret: string) {
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

describe('webhooks externos via GET', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('chama o endpoint ativo com GET e metadados da ação', async () => {
    const encryptionSecret = ' chave preservada sem trim ';
    vi.stubEnv('ENCRYPTION_KEY', encryptionSecret);
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
            secretEncrypted: encryptWebhookSecret('segredo', encryptionSecret),
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

  it.each([
    { attemptsMade: 0, expectedStatus: 'retrying' },
    { attemptsMade: 7, expectedStatus: 'dead_letter' },
  ])('falha de forma segura sem chave e registra $expectedStatus', async ({ attemptsMade, expectedStatus }) => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    vi.stubEnv('SESSION_SECRET', '');
    const getMock = vi.fn();
    const update = vi.fn().mockResolvedValue({});
    const db = {
      webhookDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'delivery-1',
          status: 'pending',
          eventId: 'event-1',
          eventType: 'contact.created',
          createdAt: new Date('2026-07-28T14:00:00.000Z'),
          payload: {},
          webhook: {
            enabled: true,
            secretEncrypted: 'v1.iv.tag.encrypted',
            url: 'https://hooks.example.com/entrada',
          },
        }),
        update,
      },
    };

    await expect(processExternalWebhook(db as never, {
      data: { deliveryId: 'delivery-1' },
      attemptsMade,
    } as never, { get: getMock })).rejects.toThrow('ENCRYPTION_KEY ou SESSION_SECRET precisa ser configurada');

    expect(getMock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        status: expectedStatus,
        lastError: 'ENCRYPTION_KEY ou SESSION_SECRET precisa ser configurada',
        attempts: { increment: 1 },
      }),
    }));
  });
});
