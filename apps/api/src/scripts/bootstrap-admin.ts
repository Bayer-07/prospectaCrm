import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function bootstrap() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrador';
  if (!email || !password || password.length < 5) {
    throw new Error('Defina ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD com pelo menos 5 caracteres');
  }
  const organization = await db.organization.findFirst();
  if (!organization) throw new Error('Execute o seed antes do bootstrap');
  const role = await db.role.findFirst({ where: { organizationId: organization.id, key: 'admin' } });
  if (!role) throw new Error('Papel de administrador não encontrado');
  const team = await db.team.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Geral' } },
    update: { isDefault: true },
    create: { organizationId: organization.id, name: 'Geral', color: '#64748b', isDefault: true },
  });
  const user = await db.user.upsert({
    where: { organizationId_email: { organizationId: organization.id, email } },
    create: { organizationId: organization.id, roleId: role.id, teamId: team.id, name, email, passwordHash: await argon2.hash(password), status: 'ACTIVE' },
    update: { roleId: role.id, teamId: team.id, name, passwordHash: await argon2.hash(password), status: 'ACTIVE' },
  });
  await db.userTeam.upsert({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
    update: {},
    create: { userId: user.id, teamId: team.id },
  });
  console.log(`Administrador ${user.email} pronto.`);
}

try {
  await bootstrap();
} finally {
  await db.$disconnect();
}
