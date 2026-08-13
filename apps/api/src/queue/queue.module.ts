import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUES = {
  inbound: 'inbound-webhooks', outbound: 'outbound-messages', campaigns: 'campaigns',
  automations: 'automations', externalWebhooks: 'external-webhooks', maintenance: 'maintenance',
  transactionalEmails: 'transactional-emails', transcriptions: 'audio-transcriptions',
  followUps: 'follow-ups',
} as const;

export const QUEUE_CONNECTION = Symbol('QUEUE_CONNECTION');
export const INBOUND_QUEUE = Symbol('INBOUND_QUEUE');
export const OUTBOUND_QUEUE = Symbol('OUTBOUND_QUEUE');
export const CAMPAIGN_QUEUE = Symbol('CAMPAIGN_QUEUE');
export const AUTOMATION_QUEUE = Symbol('AUTOMATION_QUEUE');
export const EXTERNAL_WEBHOOK_QUEUE = Symbol('EXTERNAL_WEBHOOK_QUEUE');
export const TRANSACTIONAL_EMAIL_QUEUE = Symbol('TRANSACTIONAL_EMAIL_QUEUE');
export const TRANSCRIPTION_QUEUE = Symbol('TRANSCRIPTION_QUEUE');
export const FOLLOW_UP_QUEUE = Symbol('FOLLOW_UP_QUEUE');

const queueOptions = (connection: Redis) => ({
  connection,
  defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 5_000 },
});

@Global()
@Module({
  providers: [
    { provide: QUEUE_CONNECTION, useFactory: () => new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null, lazyConnect: true }) },
    { provide: INBOUND_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.inbound, queueOptions(connection)) },
    { provide: OUTBOUND_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.outbound, queueOptions(connection)) },
    { provide: CAMPAIGN_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.campaigns, queueOptions(connection)) },
    { provide: AUTOMATION_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.automations, queueOptions(connection)) },
    { provide: EXTERNAL_WEBHOOK_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.externalWebhooks, queueOptions(connection)) },
    { provide: TRANSACTIONAL_EMAIL_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.transactionalEmails, queueOptions(connection)) },
    { provide: TRANSCRIPTION_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.transcriptions, queueOptions(connection)) },
    { provide: FOLLOW_UP_QUEUE, inject: [QUEUE_CONNECTION], useFactory: (connection: Redis) => new Queue(QUEUES.followUps, queueOptions(connection)) },
  ],
  exports: [QUEUE_CONNECTION, INBOUND_QUEUE, OUTBOUND_QUEUE, CAMPAIGN_QUEUE, AUTOMATION_QUEUE, EXTERNAL_WEBHOOK_QUEUE, TRANSACTIONAL_EMAIL_QUEUE, TRANSCRIPTION_QUEUE, FOLLOW_UP_QUEUE],
})
export class QueueModule {}
