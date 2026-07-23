import type { Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { createDecipheriv, createHash, createHmac } from 'node:crypto';

let decryptionKey: Buffer | undefined;

function decryptSecret(value: string) {
  if (!value.startsWith('v1.')) return Buffer.from(value, 'base64').toString();
  const [, iv, tag, encrypted] = value.split('.');
  decryptionKey ||= createHash('sha256').update(process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'prospecta-development-key').digest();
  const decipher = createDecipheriv('aes-256-gcm', decryptionKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export async function processExternalWebhook(db: PrismaClient, job: Job<{ deliveryId: string }>) {
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
  const body = JSON.stringify({ id: delivery.eventId, type: delivery.eventType, createdAt: delivery.createdAt, data: delivery.payload });
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  try {
    const response = await fetch(delivery.webhook.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Prospecta-Event': delivery.eventId, 'X-Prospecta-Timestamp': timestamp, 'X-Prospecta-Signature': `sha256=${signature}` }, body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'delivered', deliveredAt: new Date(), attempts: { increment: 1 } } });
  } catch (error) {
    await db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: job.attemptsMade >= 7 ? 'dead_letter' : 'retrying', attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : String(error), nextAttemptAt: new Date(Date.now() + 2 ** Math.min(job.attemptsMade, 8) * 1000) } });
    throw error;
  }
}
