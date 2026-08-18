import type { PrismaClient } from '@prisma/client';
import { nextWarmupCap } from '@prospecta/contracts';
import { deleteStoredMedia } from './storage.js';

const saoPauloDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const RETENTION_DELETE_BATCH_SIZE = 1_000;
const MAX_RETENTION_BATCHES_PER_RUN = 10;

export async function runMaintenance(db: PrismaClient) {
  const now = new Date();
  const currentDay = saoPauloDayFormatter.format(now);
  const profiles = await db.warmupProfile.findMany({
    select: {
      id: true,
      currentDailyCap: true,
      dailyIncrement: true,
      maximumDailyCap: true,
      sentToday: true,
      failedToday: true,
      lastResetAt: true,
      instance: { select: { status: true } },
    },
  });
  const updates = [];
  for (const profile of profiles) {
    const resetDay = saoPauloDayFormatter.format(profile.lastResetAt);
    if (currentDay === resetDay) continue;
    const decision = nextWarmupCap({ currentCap: profile.currentDailyCap, increment: profile.dailyIncrement, maximumCap: profile.maximumDailyCap, sent: profile.sentToday, failed: profile.failedToday, connected: profile.instance.status === 'CONNECTED' });
    updates.push(db.warmupProfile.update({ where: { id: profile.id }, data: {
      currentDailyCap: decision.cap,
      sentToday: 0, failedToday: 0, lastResetAt: now,
    } }));
  }
  const organizations = await db.organization.findMany({ select: { id: true, messageRetentionMonths: true } });
  const suggestionCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const diagnosticCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  await db.$transaction([
    ...updates,
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.conversationAiGeneration.deleteMany({ where: { type: 'REPLY_SUGGESTION', createdAt: { lt: suggestionCutoff } } }),
    db.conversationAiGeneration.deleteMany({ where: { OR: [{ type: 'CONFIG_TEST' }, { type: 'CHATBOT_REPLY', proposal: null }], createdAt: { lt: diagnosticCutoff } } }),
  ]);
  for (const organization of organizations) {
    await purgeExpiredMessages(db, organization, now);
  }
}

async function purgeExpiredMessages(
  db: PrismaClient,
  organization: { id: string; messageRetentionMonths: number },
  now: Date,
) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - organization.messageRetentionMonths);
  for (let batch = 0; batch < MAX_RETENTION_BATCHES_PER_RUN; batch += 1) {
    const expired = await db.message.findMany({
      where: { conversation: { organizationId: organization.id }, createdAt: { lt: cutoff } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: RETENTION_DELETE_BATCH_SIZE,
      select: { id: true, media: { select: { key: true } } },
    });
    if (!expired.length) break;
    const mediaKeys = expired.flatMap((message) => message.media.map((media) => media.key));
    try {
      await deleteStoredMedia(mediaKeys);
    } catch (error) {
      console.error(`[retention] Falha ao excluir mídias da organização ${organization.id}:`, error instanceof Error ? error.message : error);
      break;
    }
    await db.message.deleteMany({ where: { id: { in: expired.map((message) => message.id) } } });
    if (expired.length < RETENTION_DELETE_BATCH_SIZE) break;
  }
}
