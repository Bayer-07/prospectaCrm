import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailgunWebhookService, verifyMailgunSignature } from './mailgun-webhook.service.js';

describe('webhook do Mailgun', () => {
  afterEach(() => {
    delete process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  });

  it('valida a assinatura HMAC-SHA256 de timestamp + token', () => {
    const timestamp = '1770920772';
    const token = 'token';
    const signature = createHmac('sha256', 'signing-key').update(`${timestamp}${token}`).digest('hex');
    expect(verifyMailgunSignature({ signingKey: 'signing-key', timestamp, token, signature })).toBe(true);
    expect(verifyMailgunSignature({ signingKey: 'wrong', timestamp, token, signature })).toBe(false);
  });

  it('enfileira um evento autenticado para processamento idempotente', async () => {
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY = 'signing-key';
    const add = vi.fn().mockResolvedValue({});
    const service = new MailgunWebhookService({ add } as never);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = 'token-1';
    const signature = createHmac('sha256', 'signing-key').update(`${timestamp}${token}`).digest('hex');

    await expect(service.ingest({
      signature: { timestamp, token, signature },
      'event-data': { id: 'event-1', event: 'delivered' },
    })).resolves.toEqual({ received: true });
    expect(add).toHaveBeenCalledWith('mailgun-event', {
      eventData: { id: 'event-1', event: 'delivered' },
    }, expect.objectContaining({ jobId: 'mailgun-event-1', attempts: 5 }));
  });
});
