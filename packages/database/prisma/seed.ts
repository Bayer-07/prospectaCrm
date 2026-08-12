import { PrismaClient, UserStatus } from '@prisma/client';
import argon2 from 'argon2';
import { sgaProspectingEmailTemplates } from '../../contracts/src/email-templates.js';

const db = new PrismaClient();

const permissions = {
  admin: [['*', '*', 'ALL']],
  manager: [
    ['companies', '*', 'TEAM'], ['contacts', '*', 'TEAM'], ['opportunities', '*', 'TEAM'],
    ['tasks', '*', 'TEAM'], ['conversations', '*', 'TEAM'], ['campaigns', '*', 'TEAM'],
    ['workflows', '*', 'TEAM'], ['reports', 'read', 'TEAM'], ['users', 'read', 'TEAM'],
  ],
  sdr: [
    ['companies', 'read', 'TEAM'], ['companies', 'write', 'OWN'], ['contacts', '*', 'TEAM'],
    ['opportunities', '*', 'OWN'], ['tasks', '*', 'OWN'], ['conversations', '*', 'TEAM'],
    ['campaigns', 'read', 'TEAM'], ['campaigns', 'write', 'TEAM'], ['campaigns', 'launch', 'TEAM'],
  ],
  seller: [
    ['companies', 'read', 'TEAM'], ['contacts', 'read', 'TEAM'], ['opportunities', '*', 'OWN'],
    ['tasks', '*', 'OWN'], ['conversations', '*', 'OWN'], ['reports', 'read', 'OWN'],
  ],
} as const;

async function main() {
  const organization = await db.organization.upsert({
    where: { slug: 'empresa' },
    update: {},
    create: { name: 'Minha Empresa', slug: 'empresa' },
  });

  await db.team.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Prospecção' } },
    update: {}, create: { organizationId: organization.id, name: 'Prospecção', color: '#635bff' },
  });
  const vendas = await db.team.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Vendas' } },
    update: {}, create: { organizationId: organization.id, name: 'Vendas', color: '#0f9f6e' },
  });

  const roles: Record<string, { id: string }> = {};
  for (const [key, name] of Object.entries({ admin: 'Administrador', manager: 'Gestor', sdr: 'SDR', seller: 'Vendedor' })) {
    const role = await db.role.upsert({
      where: { organizationId_key: { organizationId: organization.id, key } },
      update: { name }, create: { organizationId: organization.id, key, name, isSystem: true },
    });
    roles[key] = role;
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: permissions[key as keyof typeof permissions].map(([resource, action, scope]) => ({
        roleId: role.id, resource, action, scope,
      })),
    });
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('Defina SEED_ADMIN_PASSWORD antes de executar o seed');
  await db.user.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: 'admin@empresa.local' } },
    update: {},
    create: {
      organizationId: organization.id, teamId: vendas.id, roleId: roles.admin.id,
      name: 'Administrador', email: 'admin@empresa.local',
      passwordHash: await argon2.hash(adminPassword), status: UserStatus.ACTIVE,
    },
  });

  const pipeline = await db.pipeline.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Prospecção e Vendas' } },
    update: {}, create: { organizationId: organization.id, name: 'Prospecção e Vendas' },
  });

  const stageData = [
    ['Novos leads', '#7c6ff2', 10], ['Contato iniciado', '#2f80ed', 25],
    ['Qualificado', '#f59e0b', 50], ['Proposta', '#ef7c3a', 75], ['Fechado', '#16a36a', 100],
  ] as const;
  for (let position = 0; position < stageData.length; position += 1) {
    const [name, color, probability] = stageData[position];
    await db.pipelineStage.upsert({
      where: { pipelineId_position: { pipelineId: pipeline.id, position } },
      update: { name, color, probability },
      create: { pipelineId: pipeline.id, position, name, color, probability, isWon: name === 'Fechado' },
    });
  }

  await db.tag.createMany({
    data: [
      { organizationId: organization.id, name: 'Prioridade', color: '#e5484d' },
      { organizationId: organization.id, name: 'Inbound', color: '#635bff' },
      { organizationId: organization.id, name: 'Enterprise', color: '#0f9f6e' },
    ], skipDuplicates: true,
  });

  await db.emailTemplate.createMany({
    data: sgaProspectingEmailTemplates.map((template) => ({
      organizationId: organization.id,
      name: template.name,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })),
    skipDuplicates: true,
  });

  console.log('Seed concluído. Login: admin@empresa.local');
}

try {
  await main();
} finally {
  await db.$disconnect();
}
