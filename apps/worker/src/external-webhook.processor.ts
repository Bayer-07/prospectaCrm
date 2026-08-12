import type { Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import { publicHttpGet } from './public-http-get.js';

let decryptionKey: Buffer | undefined;

function decryptSecret(value: string) {
  if (!value.startsWith('v1.')) return Buffer.from(value, 'base64').toString();
  const [, iv, tag, encrypted] = value.split('.');
  decryptionKey ||= createHash('sha256').update(process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'prospecta-development-key').digest();
  const decipher = createDecipheriv('aes-256-gcm', decryptionKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

type ExternalWebhookDependencies = { get: typeof publicHttpGet };

export async function processExternalWebhook(
  db: PrismaClient,
  job: Job<{ deliveryId: string }>,
  dependencies: ExternalWebhookDependencies = { get: publicHttpGet },
) {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: job.data.deliveryId },
    select: {
      id: true,
      status: true,
      eventId: true,
      eventType: true,
      createdAt: true,
      payload: true,
      webhook: { select: { enabled: true, secretEncrypted: true, url: true } },
    },
  });
  if (!delivery || delivery.status === 'delivered' || !delivery.webhook.enabled) return;
  const secret = decryptSecret(delivery.webhook.secretEncrypted);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = delivery.payload && typeof delivery.payload === 'object' && !Array.isArray(delivery.payload)
    ? delivery.payload as Record<string, unknown>
    : {};
  const entityType = typeof payload.entityType === 'string' ? payload.entityType : '';
  const entityId = typeof payload.entityId === 'string' ? payload.entityId : '';
  try {
    const target = new URL(delivery.webhook.url);
    target.searchParams.set('event', delivery.eventType);
    target.searchParams.set('event_id', delivery.eventId);
    target.searchParams.set('created_at', delivery.createdAt.toISOString());
    if (entityType) target.searchParams.set('entity_type', entityType);
    if (entityId) target.searchParams.set('entity_id', entityId);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${delivery.eventId}.${delivery.eventType}.${entityType}.${entityId}`)
      .digest('hex');
    const response = await dependencies.get(target.toString(), {
      headers: {
        Accept: 'application/json',
        'X-BZS-One-Event': delivery.eventType,
        'X-BZS-One-Event-Id': delivery.eventId,
        'X-BZS-One-Timestamp': timestamp,
        'X-BZS-One-Signature': `sha256=${signature}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'delivered', deliveredAt: new Date(), attempts: { increment: 1 } } });
  } catch (error) {
    await db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: job.attemptsMade >= 7 ? 'dead_letter' : 'retrying', attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : String(error), nextAttemptAt: new Date(Date.now() + 2 ** Math.min(job.attemptsMade, 8) * 1000) } });
    throw error;
  }
}
