import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@prospecta/database';
import { CampaignProcessor } from './campaign.processor.js';
import { ChatbotProcessor } from './chatbot.processor.js';
import { EvolutionClient } from './evolution-client.js';
import { processExternalWebhook } from './external-webhook.processor.js';
import { InboundProcessor } from './inbound.processor.js';
import { runMaintenance } from './maintenance.processor.js';
import { OutboundProcessor } from './outbound.processor.js';
import { WorkflowProcessor } from './workflow.processor.js';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const evolution = new EvolutionClient();
const queueOptions = { connection, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } };
const campaignQueue = new Queue('campaigns', queueOptions);
const automationQueue = new Queue('automations', queueOptions);
const outboundQueue = new Queue('outbound-messages', queueOptions);
const chatbotQueue = new Queue('chatbots', queueOptions);
const inboundQueue = new Queue('inbound-webhooks', queueOptions);

const inbound = new InboundProcessor(prisma, chatbotQueue, evolution, inboundQueue);
const outbound = new OutboundProcessor(prisma, evolution);
const campaigns = new CampaignProcessor(prisma, campaignQueue, evolution);
const workflows = new WorkflowProcessor(prisma, automationQueue, outboundQueue);
const chatbots = new ChatbotProcessor(prisma, outboundQueue);

const workers = [
  new Worker('inbound-webhooks', async (job) => {
    const event = await inbound.process(job);
    if (event) await connection.publish('prospecta:realtime', JSON.stringify(event));
  }, { connection, concurrency: 10 }),
  new Worker('outbound-messages', (job) => outbound.process(job), { connection, concurrency: 5, limiter: { max: 20, duration: 1000 } }),
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
];

for (const worker of workers) {
  worker.on('failed', (job, error) => console.error(`[${worker.name}] Job ${job?.id} falhou:`, error.message));
}

await runMaintenance(prisma);
const maintenanceTimer = setInterval(() => void runMaintenance(prisma).catch((error) => console.error('Falha de manutenção:', error)), 60 * 60_000);

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
void syncRecentEvolutionMessages();
const recentSyncTimer = setInterval(() => void syncRecentEvolutionMessages(), 5_000);

const shutdown = async () => {
  clearInterval(maintenanceTimer);
  clearInterval(recentSyncTimer);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([campaignQueue.close(), automationQueue.close(), chatbotQueue.close(), outboundQueue.close(), inboundQueue.close()]);
  await prisma.$disconnect();
  await connection.quit();
};
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));

console.log('Prospecta worker ativo: mensagens, campanhas, automações e manutenção.');
