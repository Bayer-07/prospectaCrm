import { prisma } from '@prospecta/database';
import { InboundProcessor } from './inbound.processor.js';

const processor = new InboundProcessor(prisma);
const candidates = await prisma.message.findMany({
  where: { type: { in: ['text', 'sticker', 'image', 'audio', 'video', 'document'] }, media: { none: {} } },
  orderBy: { createdAt: 'desc' },
  take: 2_000,
  select: { id: true },
});

let repaired = 0;
let failed = 0;
try {
  for (const candidate of candidates) {
    try {
      if (await processor.repairStoredMedia(candidate.id)) repaired += 1;
    } catch (error) {
      failed += 1;
      console.error(`Falha ao recuperar a mídia da mensagem ${candidate.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`Mídias recuperadas: ${repaired}. Falhas: ${failed}.`);
} finally {
  await prisma.$disconnect();
}
