import type { Job } from 'bullmq';
import { prisma } from '@prospecta/database';
import { InboundProcessor, normalizeEvolutionEventType } from './inbound.processor.js';

const instanceKey = process.argv[2];
const requestedType = process.argv[3] ? normalizeEvolutionEventType(process.argv[3]) : null;

if (!instanceKey) throw new Error('Informe a chave da instância: pnpm replay:evolution <instanceKey> [eventType]');

const instance = await prisma.whatsappInstance.findFirst({ where: { instanceKey, archivedAt: null } });
if (!instance) throw new Error(`Instância ativa não encontrada: ${instanceKey}`);

const events = await prisma.inboundWebhookEvent.findMany({
  where: { instanceKey, status: { in: ['processed', 'failed'] } },
  orderBy: { receivedAt: 'asc' },
});
const replayable = events.filter((event) => {
  const type = normalizeEvolutionEventType(event.eventType);
  if (requestedType && type !== requestedType) return false;
  return type.includes('CONNECTION') || type.includes('MESSAGES_') || type.includes('SEND_MESSAGE');
});
const processor = new InboundProcessor(prisma);
let processed = 0;

try {
  for (const event of replayable) {
    await prisma.inboundWebhookEvent.update({
      where: { id: event.id },
      data: { status: 'received', processedAt: null, error: null },
    });
    await processor.process({ data: { eventId: event.id } } as Job<{ eventId: string }>);
    processed += 1;
  }
  console.log(`Reprocessados ${processed} evento(s) da instância ${instanceKey}${requestedType ? ` do tipo ${requestedType}` : ''}.`);
} finally {
  await prisma.$disconnect();
}
