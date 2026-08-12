import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const campaigns = await db.campaign.deleteMany({ where: { name: 'E-mail Smoke', channel: 'EMAIL' } });
  const opportunities = await db.opportunity.deleteMany({ where: { OR: [{ externalId: { startsWith: 'demo-opp-' } }, { externalId: { startsWith: 'qa-temp-' } }] } });
  const contacts = await db.contact.deleteMany({ where: { OR: [
    { externalId: { startsWith: 'demo-contact-' } },
    { externalId: { startsWith: 'qa-temp-' } },
    { externalId: { startsWith: 'smoke-' } },
    { email: { endsWith: '@empresa.test' } },
    { name: { in: ['Contato Smoke', 'Lead Optout Smoke', 'Lead Idempotente'] } },
  ] } });
  const companies = await db.company.deleteMany({ where: { OR: [{ externalId: { startsWith: 'demo-company-' } }, { externalId: { startsWith: 'qa-temp-' } }] } });
  const apiKeys = await db.apiKey.deleteMany({ where: { name: 'Smoke API' } });
  const idempotencyRecords = await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: 'smoke-' } } });
  const webhookEvents = await db.inboundWebhookEvent.deleteMany({ where: { OR: [{ instanceKey: 'smoke-instance' }, { instanceKey: { startsWith: 'qa-delete-' } }] } });
  const whatsappInstances = await db.whatsappInstance.deleteMany({ where: { archivedAt: { not: null }, OR: [{ instanceKey: { startsWith: 'qa-delete-' } }, { instanceKey: { startsWith: 'smoke-instance__deleted__' } }] } });
  console.log(JSON.stringify({ campaigns: campaigns.count, opportunities: opportunities.count, contacts: contacts.count, companies: companies.count, apiKeys: apiKeys.count, idempotencyRecords: idempotencyRecords.count, webhookEvents: webhookEvents.count, whatsappInstances: whatsappInstances.count }));
}

try {
  await main();
} finally {
  await db.$disconnect();
}
