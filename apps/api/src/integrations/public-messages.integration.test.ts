import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicMessagesService } from './public-messages.service.js';

// Point this variable at a disposable PostgreSQL database with the project migrations applied.
const databaseUrl = process.env.PUBLIC_MESSAGES_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('API de mensagens com PostgreSQL', () => {
  const db = new PrismaService({ datasourceUrl: databaseUrl });
  const queue = { add: vi.fn() };
  const evolution = { checkWhatsappNumbers: vi.fn() };
  const realtime = { notifyOrganization: vi.fn() };
  const service = new PublicMessagesService(db, evolution as never, queue as never, realtime as never);
  let auth: AuthContext;
  let teamId: string;
  let userId: string;
  let instanceId: string;
  let organizations: string[] = [];
  const input = () => ({ phone: '+5545999990000', text: 'Olá, Maria!', instanceId, teamId, assigneeId: userId, contactName: 'Maria Silva' });

  beforeEach(async () => {
    organizations = [];
    vi.resetAllMocks();
    queue.add.mockResolvedValue({});
    evolution.checkWhatsappNumbers.mockResolvedValue([{ exists: true }]);
    const organization = await db.organization.create({ data: { name: 'Teste mensagens', slug: `test-messages-${randomUUID()}` } });
    organizations = [organization.id];
    const team = await db.team.create({ data: { organizationId: organization.id, name: 'Geral', isDefault: true } });
    teamId = team.id;
    const role = await db.role.create({ data: { organizationId: organization.id, name: 'Atendente', key: 'agent' } });
    const user = await db.user.create({ data: {
      organizationId: organization.id, teamId, roleId: role.id, name: 'Atendente', email: `${randomUUID()}@test.invalid`, status: 'ACTIVE',
      teamMemberships: { create: { teamId } },
    } });
    userId = user.id;
    const instance = await db.whatsappInstance.create({ data: {
      organizationId: organization.id, name: 'Comercial', instanceKey: `test-${randomUUID()}`, status: 'CONNECTED', teams: { create: { teamId } },
    } });
    instanceId = instance.id;
    auth = { type: 'apiKey', organizationId: organization.id, name: 'Integração de teste', permissions: [
      { resource: 'contacts', action: 'write', scope: 'ALL' }, { resource: 'conversations', action: 'write', scope: 'ALL' },
    ] };
  });

  afterEach(async () => {
    if (!organizations.length) return;
    await db.idempotencyRecord.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.organization.deleteMany({ where: { id: { in: organizations } } });
  });
  afterAll(() => db.$disconnect());

  it('cadastra o contato, atribui usuário/equipe/conexão e enfileira uma única mensagem', async () => {
    const result = await service.send(auth, input(), 'request-001');
    expect(result).toMatchObject({ contactCreated: true, instanceId, teamId, assigneeId: userId, status: 'QUEUED' });
    expect(await db.contact.findUnique({ where: { id: result.contactId } })).toMatchObject({
      name: 'Maria Silva', phone: '+5545999990000', phoneKey: '+5545999990000', ownerId: userId, teamId, consentStatus: 'UNKNOWN',
    });
    expect(await db.conversation.findUnique({ where: { id: result.conversationId } })).toMatchObject({ instanceId, contactId: result.contactId, assigneeId: userId, teamId, status: 'OPEN' });
    expect(await db.message.findUnique({ where: { id: result.messageId } })).toMatchObject({ direction: 'OUTBOUND', type: 'text', text: 'Olá, Maria!', status: 'QUEUED' });
    expect(queue.add).toHaveBeenCalledWith('send-message', { messageId: result.messageId }, expect.objectContaining({ jobId: `message-${result.messageId}` }));
    expect(await db.notification.count({ where: { organizationId: auth.organizationId, userId } })).toBe(1);
  });

  it('reutiliza contato e atendimento ao reconhecer telefone brasileiro com e sem nono dígito', async () => {
    const first = await service.send(auth, input(), 'request-001');
    const second = await service.send(auth, { ...input(), phone: '+55 (45) 9999-0000', contactName: 'Outro nome' }, 'request-002');
    expect(second).toMatchObject({ contactId: first.contactId, conversationId: first.conversationId, contactCreated: false });
    expect(second.messageId).not.toBe(first.messageId);
    expect(await db.contact.count({ where: { organizationId: auth.organizationId } })).toBe(1);
    expect(await db.conversation.count({ where: { organizationId: auth.organizationId } })).toBe(1);
    expect((await db.contact.findUnique({ where: { id: first.contactId } }))?.name).toBe('Maria Silva');
  });

  it('serializa requisições simultâneas com a mesma chave', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => service.send(auth, input(), 'request-concurrent')));
    expect(new Set(results.map(({ messageId }) => messageId)).size).toBe(1);
    expect(await db.contact.count({ where: { organizationId: auth.organizationId } })).toBe(1);
    expect(await db.conversation.count({ where: { organizationId: auth.organizationId } })).toBe(1);
    expect(await db.message.count({ where: { conversation: { organizationId: auth.organizationId } } })).toBe(1);
  });

  it('serializa cadastros simultâneos com chaves diferentes para o mesmo telefone', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => service.send(auth, input(), `request-distinct-${i}`)));
    expect(new Set(results.map(({ contactId }) => contactId)).size).toBe(1);
    expect(new Set(results.map(({ conversationId }) => conversationId)).size).toBe(1);
    expect(new Set(results.map(({ messageId }) => messageId)).size).toBe(4);
    expect(results.filter(({ contactCreated }) => contactCreated)).toHaveLength(1);
  });

  it('rejeita a mesma chave com outro conteúdo e preserva o envio original', async () => {
    await service.send(auth, input(), 'request-001');
    await expect(service.send(auth, { ...input(), text: 'Outra mensagem' }, 'request-001')).rejects.toMatchObject({ status: 409 });
    expect(await db.message.count({ where: { conversation: { organizationId: auth.organizationId } } })).toBe(1);
  });

  it('recupera falha da fila com os mesmos registros e evita reenfileirar mensagens já enviadas', async () => {
    queue.add.mockRejectedValueOnce(new Error('Redis indisponível'));
    await expect(service.send(auth, input(), 'request-001')).rejects.toMatchObject({ status: 503 });
    const result = await service.send(auth, input(), 'request-001');
    expect(await db.message.count({ where: { conversation: { organizationId: auth.organizationId } } })).toBe(1);
    await db.message.update({ where: { id: result.messageId }, data: { status: 'SENT' } });
    queue.add.mockClear();
    evolution.checkWhatsappNumbers.mockClear();
    expect(await service.send(auth, input(), 'request-001')).toEqual(result);
    expect(queue.add).not.toHaveBeenCalled();
    expect(evolution.checkWhatsappNumbers).not.toHaveBeenCalled();
  });

  it('usa a equipe Geral sem usuário e preserva atribuições em envios subsequentes', async () => {
    const first = await service.send(auth, { phone: input().phone, text: 'Primeiro', instanceId }, 'request-001');
    expect(first).toMatchObject({ teamId, assigneeId: null });
    expect((await db.conversation.findUnique({ where: { id: first.conversationId } }))?.status).toBe('WAITING');
    const assigned = await service.send(auth, input(), 'request-002');
    const preserved = await service.send(auth, { phone: input().phone, text: 'Terceiro', instanceId }, 'request-003');
    expect(preserved).toMatchObject({ conversationId: assigned.conversationId, teamId, assigneeId: userId });
    const unassigned = await service.send(auth, { ...input(), assigneeId: null }, 'request-004');
    expect(unassigned.assigneeId).toBeNull();
    expect((await db.contact.findUnique({ where: { id: first.contactId } }))?.ownerId).toBeNull();
  });

  it('reabre atendimento encerrado na conexão escolhida', async () => {
    const first = await service.send(auth, input(), 'request-001');
    await db.conversation.update({ where: { id: first.conversationId }, data: { status: 'CLOSED', closedAt: new Date() } });
    const second = await service.send(auth, input(), 'request-002');
    expect(second.conversationId).toBe(first.conversationId);
    expect(await db.conversation.findUnique({ where: { id: first.conversationId } })).toMatchObject({ status: 'OPEN', closedAt: null });
  });

  it('não cadastra contato quando o número não possui WhatsApp', async () => {
    evolution.checkWhatsappNumbers.mockResolvedValueOnce([{ exists: false }]);
    await expect(service.send(auth, input(), 'request-001')).rejects.toMatchObject({ status: 400 });
    expect(await db.contact.count({ where: { organizationId: auth.organizationId } })).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejeita conexão desconectada e usuário que não pertence à equipe, sem cadastros parciais', async () => {
    await db.whatsappInstance.update({ where: { id: instanceId }, data: { status: 'DISCONNECTED' } });
    await expect(service.send(auth, input(), 'request-001')).rejects.toMatchObject({ status: 400 });
    expect(evolution.checkWhatsappNumbers).not.toHaveBeenCalled();
    await db.whatsappInstance.update({ where: { id: instanceId }, data: { status: 'CONNECTED' } });
    const otherTeam = await db.team.create({ data: { organizationId: auth.organizationId, name: 'Outra' } });
    await expect(service.send(auth, { ...input(), teamId: otherTeam.id }, 'request-001')).rejects.toMatchObject({ status: 400 });
    expect(await db.contact.count({ where: { organizationId: auth.organizationId } })).toBe(0);
    expect(await db.idempotencyRecord.count({ where: { organizationId: auth.organizationId } })).toBe(0);
  });

  it('isola a organização da chave em contatos, usuários, equipes e conexões', async () => {
    const otherOrg = await db.organization.create({ data: { name: 'Outra organização de teste', slug: `test-messages-${randomUUID()}` } });
    organizations.push(otherOrg.id);
    const otherAuth = { ...auth, organizationId: otherOrg.id };
    await expect(service.send(otherAuth, input(), 'request-001')).rejects.toMatchObject({ status: 400 });
    expect(await service.users(otherAuth)).toEqual([]);
    expect(await service.teams(otherAuth)).toEqual([]);
    expect(await service.connections(otherAuth)).toEqual([]);
    const otherTeam = await db.team.create({ data: { organizationId: otherOrg.id, name: 'Geral', isDefault: true } });
    await expect(service.send(auth, { ...input(), teamId: otherTeam.id }, 'request-001')).rejects.toMatchObject({ status: 400 });
    await db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    await expect(service.send(auth, input(), 'request-001')).rejects.toMatchObject({ status: 400 });
    expect(await db.contact.count({ where: { organizationId: auth.organizationId } })).toBe(0);
  });

  it('respeita escopo OWN de sessões em contatos e atendimentos existentes', async () => {
    const first = await service.send(auth, input(), 'request-001');
    const ownAuth: AuthContext = { ...auth, type: 'session', userId, teamIds: [teamId], permissions: auth.permissions.map((permission) => ({ ...permission, scope: 'OWN' })) };
    expect(await service.send(ownAuth, input(), 'request-002')).toMatchObject({ contactId: first.contactId });
    await db.contact.update({ where: { id: first.contactId }, data: { ownerId: null } });
    await expect(service.send(ownAuth, input(), 'request-003')).rejects.toMatchObject({ status: 403 });
    expect(await db.message.count({ where: { conversationId: first.conversationId } })).toBe(2);
  });
});
