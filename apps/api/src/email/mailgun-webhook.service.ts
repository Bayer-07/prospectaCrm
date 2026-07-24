import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CAMPAIGN_QUEUE } from '../queue/queue.module.js';

type MailgunWebhookPayload = {
  signature?: {
    timestamp?: string;
    token?: string;
    signature?: string;
  };
  'event-data'?: Record<string, unknown> & { id?: string; event?: string };
};

export function verifyMailgunSignature(input: {
  signingKey: string;
  timestamp: string;
  token: string;
  signature: string;
}) {
  const expected = createHmac('sha256', input.signingKey)
    .update(`${input.timestamp}${input.token}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(input.signature, 'hex');
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

@Injectable()
export class MailgunWebhookService {
  constructor(@Inject(CAMPAIGN_QUEUE) private readonly queue: Queue) {}

  async ingest(payload: MailgunWebhookPayload) {
    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim();
    if (!signingKey) throw new ServiceUnavailableException('Webhook do Mailgun ainda não foi configurado');

    const timestamp = String(payload.signature?.timestamp || '');
    const token = String(payload.signature?.token || '');
    const signature = String(payload.signature?.signature || '');
    if (!timestamp || !token || !signature || !verifyMailgunSignature({ signingKey, timestamp, token, signature })) {
      throw new UnauthorizedException('Assinatura do webhook Mailgun inválida');
    }

    const toleranceSeconds = Math.max(
      300,
      Number(process.env.MAILGUN_WEBHOOK_TOLERANCE_SECONDS || 3600),
    );
    if (!Number.isFinite(Number(timestamp))
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
      throw new UnauthorizedException('Webhook Mailgun expirado');
    }

    const eventData = payload['event-data'];
    const eventId = String(eventData?.id || '');
    const eventType = String(eventData?.event || '');
    if (!eventData || !eventId || !eventType) {
      throw new UnauthorizedException('Evento Mailgun incompleto');
    }

    await this.queue.add('mailgun-event', { eventData }, {
      jobId: `mailgun-${eventId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
    });
    return { received: true };
  }
}

