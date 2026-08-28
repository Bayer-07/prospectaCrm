import { PrismaClient } from '@prisma/client';
import {
  projectEmailRecipientActivity,
  projectNoteActivity,
  projectTaskActivity,
  projectWhatsappMessageActivity,
} from '../src/activity-projection.js';

const db = new PrismaClient();
const environment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env || {};
const batchSize = Math.min(Math.max(Number(environment.ACTIVITY_BACKFILL_BATCH_SIZE) || 200, 10), 1_000);
const concurrency = Math.min(Math.max(Number(environment.ACTIVITY_BACKFILL_CONCURRENCY) || 10, 1), 50);

type SourceRow = { id: string };

async function backfillSource(
  label: string,
  load: (cursor?: string) => Promise<SourceRow[]>,
  project: (id: string) => Promise<unknown>,
) {
  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const rows = await load(cursor);
    if (!rows.length) break;
    for (let offset = 0; offset < rows.length; offset += concurrency) {
      await Promise.all(rows.slice(offset, offset + concurrency).map((row) => project(row.id)));
    }
    processed += rows.length;
    cursor = rows.at(-1)!.id;
    console.log(`[activities] ${label}: ${processed} origem(ns) verificadas`);
    if (rows.length < batchSize) break;
  }
  return processed;
}

try {
  const totals = {
    notes: await backfillSource(
      'notas',
      (cursor) => db.note.findMany({
        orderBy: { id: 'asc' }, take: batchSize, select: { id: true },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      (id) => projectNoteActivity(db, id),
    ),
    tasks: await backfillSource(
      'tarefas',
      (cursor) => db.task.findMany({
        orderBy: { id: 'asc' }, take: batchSize, select: { id: true },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      (id) => projectTaskActivity(db, id),
    ),
    whatsapp: await backfillSource(
      'mensagens WhatsApp',
      (cursor) => db.message.findMany({
        where: { direction: 'OUTBOUND', sentAt: { not: null } },
        orderBy: { id: 'asc' }, take: batchSize, select: { id: true },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      (id) => projectWhatsappMessageActivity(db, id),
    ),
    emails: await backfillSource(
      'destinatários de e-mail',
      (cursor) => db.campaignRecipient.findMany({
        where: { sentAt: { not: null }, campaign: { channel: 'EMAIL' } },
        orderBy: { id: 'asc' }, take: batchSize, select: { id: true },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      (id) => projectEmailRecipientActivity(db, id),
    ),
  };
  const projected = await db.activity.groupBy({
    by: ['sourceType'],
    where: { deletedAt: null, sourceType: { not: null } },
    _count: { _all: true },
  });
  console.log('[activities] backfill concluído', { batchSize, concurrency, totals, projected });
} finally {
  await db.$disconnect();
}
