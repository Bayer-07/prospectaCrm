import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@prospecta/database';
import { AudioTranscriptionProcessor } from './audio-transcription.processor.js';
import { CampaignProcessor } from './campaign.processor.js';
import { ChatbotProcessor } from './chatbot.processor.js';
import { EvolutionClient } from './evolution-client.js';
import { processExternalWebhook } from './external-webhook.processor.js';
import { InboundProcessor } from './inbound.processor.js';
import { runMaintenance } from './maintenance.processor.js';
import { OutboundProcessor } from './outbound.processor.js';
import { TaskDigestProcessor } from './task-digest.processor.js';
import { UserInviteProcessor } from './user-invite.processor.js';
import { WorkflowProcessor } from './workflow.processor.js';
import { FollowUpProcessor } from './follow-up.processor.js';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const evolution = new EvolutionClient();
const queueOptions = { connection, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } };
const campaignQueue = new Queue('campaigns', queueOptions);
const automationQueue = new Queue('automations', queueOptions);
const outboundQueue = new Queue('outbound-messages', queueOptions);
const chatbotQueue = new Queue('chatbots', queueOptions);
const inboundQueue = new Queue('inbound-webhooks', queueOptions);
const taskDigestQueue = new Queue('task-digests', queueOptions);
const transactionalEmailQueue = new Queue('transactional-emails', queueOptions);
const followUpQueue = new Queue('follow-ups', queueOptions);

const inbound = new InboundProcessor(prisma, chatbotQueue, evolution, inboundQueue, transactionalEmailQueue);
const outbound = new OutboundProcessor(prisma, evolution, followUpQueue, transactionalEmailQueue);
const campaigns = new CampaignProcessor(prisma, campaignQueue, evolution);
const workflows = new WorkflowProcessor(prisma, automationQueue, outboundQueue);
const chatbots = new ChatbotProcessor(prisma, outboundQueue);
const taskDigests = new TaskDigestProcessor(prisma);
const userInvites = new UserInviteProcessor(prisma);
const audioTranscriptions = new AudioTranscriptionProcessor(prisma);
const followUps = new FollowUpProcessor(prisma, followUpQueue, outboundQueue, automationQueue, transactionalEmailQueue);

const workers = [
  new Worker('inbound-webhooks', async (job) => {
    const event = await inbound.process(job);
    if (event) {
      await connection.publish('prospecta:realtime', JSON.stringify(event));
      if (event.payload && 'tasksUpdated' in event.payload && event.payload.tasksUpdated) {
        await connection.publish('prospecta:realtime', JSON.stringify({ organizationId: event.organizationId, event: 'tasks.updated', payload: event.payload }));
      }
    }
  }, { connection, concurrency: 10 }),
  new Worker('outbound-messages', async (job) => {
    const event = await outbound.process(job);
    if (event?.organizationId) {
      await connection.publish('prospecta:realtime', JSON.stringify({ organizationId: event.organizationId, event: 'inbox.updated', payload: { conversationId: event.conversationId } }));
      if (event.tasksUpdated) await connection.publish('prospecta:realtime', JSON.stringify({ organizationId: event.organizationId, event: 'tasks.updated', payload: { conversationId: event.conversationId } }));
    }
  }, { connection, concurrency: 5, limiter: { max: 20, duration: 1000 } }),
  new Worker('campaigns', (job) => campaigns.process(job), { connection, concurrency: 10 }),
  new Worker('automations', async (job) => {
    const event = await workflows.process(job);
    if (event) await connection.publish('prospecta:realtime', JSON.stringify(event));
  }, { connection, concurrency: 10 }),
  new Worker('chatbots', async (job) => {
    const event = await chatbots.process(job);
    if (event) await connection.publish('prospecta:realtime', JSON.stringify(event));
  }, { connection, concurrency: 5 }),
  new Worker('external-webhooks', (job) => processExternalWebhook(prisma, job), { connection, concurrency: 5 }),
  new Worker('task-digests', () => taskDigests.process(), { connection, concurrency: 1 }),
  new Worker('transactional-emails', (job) => userInvites.process(job), { connection, concurrency: 3 }),
  new Worker('audio-transcriptions', async (job) => {
    const event = await audioTranscriptions.process(job);
    if (event) await connection.publish('prospecta:realtime', JSON.stringify(event));
  }, {
    connection,
    concurrency: Math.min(Math.max(Number(process.env.TRANSCRIPTION_CONCURRENCY) || 1, 1), 3),
  }),
  new Worker('follow-ups', async (job) => {
    const result = await followUps.process(job);
    if (result && 'organizationId' in result && result.organizationId && 'conversationId' in result) {
      await connection.publish('prospecta:realtime', JSON.stringify({ organizationId: result.organizationId, event: 'inbox.updated', payload: { conversationId: result.conversationId } }));
      await connection.publish('prospecta:realtime', JSON.stringify({ organizationId: result.organizationId, event: 'tasks.updated', payload: { conversationId: result.conversationId } }));
    }
  }, { connection, concurrency: 3 }),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => console.error(`[${worker.name}] Job ${job?.id} falhou:`, error.message));
}

await taskDigestQueue.upsertJobScheduler(
  'daily-task-digest-08h',
  { pattern: '0 8 * * *', tz: 'America/Sao_Paulo' },
  {
    name: 'daily-task-digest',
    data: {},
    opts: { attempts: 6, backoff: { type: 'exponential', delay: 5 * 60_000 } },
  },
);
const saoPauloNow = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
}).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
  if (part.type !== 'literal') parts[part.type] = part.value;
  return parts;
}, {});
if (Number(saoPauloNow.hour) >= 8) {
  const dateKey = `${saoPauloNow.year}-${saoPauloNow.month}-${saoPauloNow.day}`;
  await taskDigestQueue.add('daily-task-digest', {}, {
    jobId: `task-digest-catchup-${dateKey}`,
    attempts: 6,
    backoff: { type: 'exponential', delay: 5 * 60_000 },
  });
}

await runMaintenance(prisma);
await campaigns.reconcileActiveCampaigns();
await followUps.reconcile();
const maintenanceTimer = setInterval(() => void (async () => {
  await runMaintenance(prisma);
  await campaigns.reconcileActiveCampaigns();
})().catch((error) => console.error('Falha de manutenção:', error)), 60 * 60_000);
const followUpTimer = setInterval(() => void followUps.reconcile()
  .catch((error) => console.error('Falha ao reconciliar follow-ups:', error)), 60_000);

let recentSyncRunning = false;
const syncRecentEvolutionMessages = async () => {
  if (recentSyncRunning) return;
  recentSyncRunning = true;
  const lockOwner = `${process.pid}-${Date.now()}`;
  let acquired = false;
  try {
    acquired = Boolean(await connection.set('prospecta:evolution-recent-sync-lock', lockOwner, 'PX', 30_000, 'NX'));
    if (!acquired) return;
    const events = await inbound.syncRecentMessages();
    await Promise.all(events.map((event) => connection.publish('prospecta:realtime', JSON.stringify(event))));
  } catch (error) {
    console.error('Falha na sincronização incremental da Evolution:', error instanceof Error ? error.message : error);
  } finally {
    if (acquired) {
      await connection.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        'prospecta:evolution-recent-sync-lock',
        lockOwner,
      ).catch(() => undefined);
    }
    recentSyncRunning = false;
  }
};
await syncRecentEvolutionMessages();
const recentSyncTimer = setInterval(() => void syncRecentEvolutionMessages(), 5_000);

const shutdown = async () => {
  clearInterval(maintenanceTimer);
  clearInterval(followUpTimer);
  clearInterval(recentSyncTimer);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([campaignQueue.close(), automationQueue.close(), chatbotQueue.close(), outboundQueue.close(), inboundQueue.close(), taskDigestQueue.close(), transactionalEmailQueue.close(), followUpQueue.close()]);
  await prisma.$disconnect();
  await connection.quit();
};
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));

console.log('BZS One worker ativo: mensagens, e-mails, campanhas, automações, follow-ups e manutenção.');
