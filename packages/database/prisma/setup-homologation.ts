import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const instanceKey = process.env.HOMOLOGATION_INSTANCE_KEY || 'homologacao';

const organization = await db.organization.findFirstOrThrow();
const team = await db.team.findFirstOrThrow({ where: { organizationId: organization.id }, orderBy: { createdAt: 'asc' } });
const instance = await db.whatsappInstance.upsert({
  where: { organizationId_instanceKey: { organizationId: organization.id, instanceKey } },
  update: {},
  create: { organizationId: organization.id, name: 'Número de homologação', instanceKey },
});
await db.whatsappInstanceTeam.upsert({ where: { instanceId_teamId: { instanceId: instance.id, teamId: team.id } }, update: {}, create: { instanceId: instance.id, teamId: team.id } });
await db.warmupProfile.upsert({ where: { instanceId: instance.id }, update: {}, create: { instanceId: instance.id } });
console.log(`Instância de homologação preparada: ${instance.instanceKey} (${instance.id})`);
await db.$disconnect();
