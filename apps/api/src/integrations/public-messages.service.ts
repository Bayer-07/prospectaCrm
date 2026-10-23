import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizePhoneKey, phoneSchema } from '@prospecta/contracts';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authTeamIds, permissionScope, scopedWhere } from '../auth/data-scope.js';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OUTBOUND_QUEUE } from '../queue/queue.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { EvolutionService } from './evolution.service.js';

const sendSchema = z.object({
  phone: z.string().trim().max(32).regex(/^\+?[1-9][\d\s().-]*$/)
    .transform((value) => `+${value.replace(/\D/g, '')}`).pipe(phoneSchema),
  text: z.string().trim().min(1).max(10_000),
  instanceId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  contactName: z.string().trim().min(2).max(180).optional(),
}).strict();

export type PublicMessageResult = {
  contactId: string;
  contactCreated: boolean;
  conversationId: string;
  messageId: string;
  instanceId: string;
  teamId: string;
  assigneeId: string | null;
  status: 'QUEUED';
};
const SEND_ROUTE = '/api/v1/messages/send';

@Injectable()
export class PublicMessagesService {
  constructor(
    private readonly db: PrismaService,
    private readonly evolution: EvolutionService,
    @Inject(OUTBOUND_QUEUE) private readonly outboundQueue: Queue,
    private readonly realtime: RealtimeGateway,
  ) {}

  async users(auth: AuthContext) {
    const users = await this.db.user.findMany({
      where: {
        organizationId: auth.organizationId,
        status: 'ACTIVE',
        ...(permissionScope(auth, 'conversations', 'write') === 'OWN' ? { id: auth.userId || '__none__' } : {}),
        ...(permissionScope(auth, 'conversations', 'write') === 'TEAM'
          ? { teamMemberships: { some: { teamId: { in: authTeamIds(auth) } } } } : {}),
      },
      select: { id: true, name: true, teamMemberships: { select: { teamId: true } } },
      orderBy: { name: 'asc' },
    });
    return users.map(({ teamMemberships, ...user }) => ({ ...user, teamIds: teamMemberships.map(({ teamId }) => teamId) }));
  }

  teams(auth: AuthContext) {
    return this.db.team.findMany({
      where: { organizationId: auth.organizationId, ...this.teamAccess(auth) },
      select: { id: true, name: true, isDefault: true },
      orderBy: { name: 'asc' },
    });
  }

  connections(auth: AuthContext) {
    return this.db.whatsappInstance.findMany({
      where: this.instanceWhere(auth),
      select: { id: true, name: true, phone: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  async send(auth: AuthContext, raw: unknown, key?: string) {
    this.requireContactWrite(auth);
    const parsed = sendSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ message: 'Dados de envio inválidos', errors: parsed.error.flatten() });
    if (!key || key.trim().length < 8 || key.length > 160) throw new BadRequestException('Idempotency-Key obrigatório (8 a 160 caracteres)');
    const input = parsed.data;
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const recordWhere = { organizationId_key_route: { organizationId: auth.organizationId, key, route: SEND_ROUTE } };
    const previous = await this.db.idempotencyRecord.findUnique({ where: recordWhere });
    if (previous) return this.enqueue(auth, this.replay(previous, requestHash));

    const instance = await this.db.whatsappInstance.findFirst({
      where: { id: input.instanceId, ...this.instanceWhere(auth) },
      select: { id: true, instanceKey: true },
    });
    if (!instance) throw new BadRequestException('Selecione uma conexão do WhatsApp conectada e acessível');
    const [whatsapp] = await this.evolution.checkWhatsappNumbers(instance.instanceKey, [input.phone]);
    if (!whatsapp?.exists) throw new BadRequestException('O número informado não possui WhatsApp');

    const phoneKey = normalizePhoneKey(input.phone)!;
    const result = await this.db.$transaction(async (tx) => {
      // Serialize retries before touching contacts or messages, including requests handled by other API processes.
      await this.lock(tx, `message-request:${auth.organizationId}:${key}`);
      const record = await tx.idempotencyRecord.findUnique({ where: recordWhere });
      if (record) return this.replay(record, requestHash);
      await this.lock(tx, `message-contact:${auth.organizationId}:${phoneKey}`);

      const existingContact = await tx.contact.findFirst({
        where: { organizationId: auth.organizationId, archivedAt: null, phoneKey },
      });
      if (existingContact) await this.assertContactAccess(tx, auth, existingContact.id);
      const phoneJid = `${phoneKey.slice(1)}@s.whatsapp.net`;
      const originalJid = `${input.phone.slice(1)}@s.whatsapp.net`;
      const existingConversation = await tx.conversation.findFirst({
        where: {
          organizationId: auth.organizationId,
          instanceId: instance.id,
          OR: [
            ...(existingContact ? [{ contactId: existingContact.id }] : []),
            { remoteJid: { in: [phoneJid, originalJid] } },
            { phoneJid: { in: [phoneJid, originalJid] } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (existingConversation) {
        const accessible = await tx.conversation.findFirst({
          where: { id: existingConversation.id, organizationId: auth.organizationId, AND: [this.conversationAccess(auth)] },
          select: { id: true },
        });
        if (!accessible) throw new ForbiddenException('Você não tem acesso a este atendimento');
      }

      const teamId = input.teamId || existingConversation?.teamId || existingContact?.teamId;
      const team = await tx.team.findFirst({
        where: { organizationId: auth.organizationId, ...(teamId ? { id: teamId } : { isDefault: true }), AND: [this.teamAccess(auth)] },
        select: { id: true, name: true },
      });
      if (!team) throw new BadRequestException('Selecione uma equipe acessível ou configure a equipe Geral');
      const assigneeId = input.assigneeId !== undefined ? input.assigneeId : existingConversation?.assigneeId || auth.userId || null;
      await this.validateAssignments(tx, auth, assigneeId, team.id);

      const newContactId = randomUUID();
      let contact = existingContact || await tx.contact.upsert({
        where: { organizationId_phoneKey: { organizationId: auth.organizationId, phoneKey } },
        create: {
          id: newContactId,
          organizationId: auth.organizationId,
          phone: phoneKey,
          phoneKey,
          name: input.contactName || phoneKey,
          ownerId: assigneeId,
          teamId: team.id,
          source: 'API de mensagens',
        },
        update: {},
      });
      const contactCreated = contact.id === newContactId;
      if (!contactCreated) {
        await this.assertContactAccess(tx, auth, contact.id);
        contact = await tx.contact.update({ where: { id: contact.id }, data: {
          ...(input.assigneeId !== undefined ? { ownerId: assigneeId } : {}),
          ...(input.teamId ? { teamId: team.id } : {}),
          ...(!contact.phone ? { phone: phoneKey } : {}),
        } });
      }
      const conversationData = { contactId: contact.id, assigneeId, teamId: team.id, status: assigneeId ? 'OPEN' as const : 'WAITING' as const, closedAt: null };
      const conversation = existingConversation
        ? await tx.conversation.update({ where: { id: existingConversation.id }, data: conversationData })
        : await tx.conversation.create({ data: {
          ...conversationData, organizationId: auth.organizationId, instanceId: instance.id, remoteJid: phoneJid, phoneJid,
        } });
      const assignmentChanged = existingConversation && (existingConversation.assigneeId !== assigneeId || existingConversation.teamId !== team.id);
      if (assignmentChanged) {
        const stopReason = 'Atendimento transferido pela API';
        await tx.chatbotSession.updateMany({ where: { conversationId: conversation.id, status: { in: ['ACTIVE', 'WAITING', 'HANDED_OFF'] } }, data: { status: 'STOPPED', wakeAt: null, stopReason, completedAt: new Date() } });
        await tx.conversationAiGeneration.updateMany({ where: { conversationId: conversation.id, type: 'CHATBOT_REPLY', status: { in: ['PENDING', 'WAITING_INPUT', 'RUNNING'] } }, data: { status: 'CANCELLED', error: stopReason, completedAt: new Date() } });
        if (assigneeId) {
          await tx.conversationFollowUp.updateMany({ where: { conversationId: conversation.id, status: { in: ['SCHEDULED', 'RUNNING'] } }, data: { responsibleId: assigneeId } });
          await tx.task.updateMany({ where: { followUp: { conversationId: conversation.id, status: { in: ['SCHEDULED', 'RUNNING'] } } }, data: { assigneeId, teamId: team.id } });
        }
      }
      const message = await tx.message.create({ data: {
        instanceId: instance.id,
        conversationId: conversation.id,
        providerMessageId: `local:${randomUUID()}`,
        direction: 'OUTBOUND', type: 'text', text: input.text, status: 'QUEUED',
        payload: { authorId: auth.userId || null, source: 'api', mediaKey: null, replyToMessageId: null, signature: null },
      } });
      await tx.conversationAiGeneration.updateMany({ where: { conversationId: conversation.id, type: 'SUMMARY', status: 'COMPLETED' }, data: { status: 'STALE' } });
      const data: PublicMessageResult = {
        contactId: contact.id, contactCreated, conversationId: conversation.id, messageId: message.id,
        instanceId: instance.id, teamId: team.id, assigneeId, status: 'QUEUED',
      };
      if (!existingConversation || existingConversation.status === 'CLOSED' || assignmentChanged) {
        await tx.conversationEvent.create({ data: {
          organizationId: auth.organizationId, conversationId: conversation.id, actorId: auth.userId,
          type: !existingConversation ? 'started' : existingConversation.status === 'CLOSED' ? 'reopened' : 'transferred',
          text: `${auth.name} enviou uma mensagem pela API na fila ${team.name}`,
          metadata: data,
        } });
      }
      if (assigneeId && (!existingConversation || assignmentChanged)) await tx.notification.create({ data: {
        organizationId: auth.organizationId, userId: assigneeId, type: 'conversation.assigned',
        title: `Conversa atribuída: ${contact.name}`, actionUrl: `/inbox/${conversation.id}`,
      } });
      await tx.auditLog.create({ data: {
        organizationId: auth.organizationId, userId: auth.userId, action: 'message.api_queued',
        entityType: 'Message', entityId: message.id, after: data,
      } });
      if (contactCreated) await tx.auditLog.create({ data: {
        organizationId: auth.organizationId, userId: auth.userId, action: 'contact.created',
        entityType: 'Contact', entityId: contact.id, after: { source: 'API de mensagens', phone: phoneKey, ownerId: assigneeId, teamId: team.id },
      } });
      await tx.idempotencyRecord.create({ data: {
        ...recordWhere.organizationId_key_route, requestHash, responseCode: 202, responseBody: { data },
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      } });
      return data;
    }, { timeout: 15_000 });
    return this.enqueue(auth, result);
  }

  private requireContactWrite(auth: AuthContext) {
    if (!auth.permissions.some(({ resource, action }) => (resource === '*' || resource === 'contacts') && (action === '*' || action === 'write'))) {
      throw new ForbiddenException('A rota exige permissão contacts:write');
    }
  }

  private teamAccess(auth: AuthContext, resource = 'conversations'): Prisma.TeamWhereInput {
    return permissionScope(auth, resource, 'write') === 'ALL' ? {} : { id: { in: authTeamIds(auth) } };
  }

  private instanceWhere(auth: AuthContext): Prisma.WhatsappInstanceWhereInput {
    return {
      organizationId: auth.organizationId, archivedAt: null, status: 'CONNECTED',
      ...(permissionScope(auth, 'conversations', 'write') === 'ALL' ? {} : { teams: { some: { teamId: { in: authTeamIds(auth) } } } }),
    };
  }

  private conversationAccess(auth: AuthContext): Prisma.ConversationWhereInput {
    const scope = permissionScope(auth, 'conversations', 'write');
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') return { teamId: { in: authTeamIds(auth) } };
    return auth.userId ? { OR: [{ assigneeId: auth.userId }, { assigneeId: null }] } : { id: '__none__' };
  }

  private async assertContactAccess(tx: Prisma.TransactionClient, auth: AuthContext, id: string) {
    const contact = await tx.contact.findFirst({
      where: { id, organizationId: auth.organizationId, archivedAt: null, AND: [scopedWhere(auth, 'contacts', 'write')] },
      select: { id: true },
    });
    if (!contact) throw new ForbiddenException('Você não tem acesso a este contato');
  }

  private async validateAssignments(tx: Prisma.TransactionClient, auth: AuthContext, assigneeId: string | null, teamId: string) {
    if (permissionScope(auth, 'conversations', 'write') === 'OWN' && assigneeId && assigneeId !== auth.userId) {
      throw new ForbiddenException('Você só pode atribuir atendimentos a si mesmo');
    }
    if (permissionScope(auth, 'contacts', 'write') === 'OWN' && assigneeId !== auth.userId) {
      throw new ForbiddenException('Você só pode atribuir contatos a si mesmo');
    }
    if (permissionScope(auth, 'contacts', 'write') === 'TEAM' && !authTeamIds(auth).includes(teamId)) {
      throw new ForbiddenException('Você não tem acesso à equipe do contato');
    }
    if (assigneeId) {
      const user = await tx.user.findFirst({
        where: { id: assigneeId, organizationId: auth.organizationId, status: 'ACTIVE', teamMemberships: { some: { teamId } } },
        select: { id: true },
      });
      if (!user) throw new BadRequestException('O usuário precisa estar ativo e pertencer à equipe selecionada');
    }
  }

  private lock(tx: Prisma.TransactionClient, identity: string) {
    return tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
  }

  private replay(record: { requestHash: string; responseBody: Prisma.JsonValue }, requestHash: string) {
    if (record.requestHash !== requestHash) throw new ConflictException('Idempotency-Key já utilizado com outro conteúdo');
    return (record.responseBody as unknown as { data: PublicMessageResult }).data;
  }

  private async enqueue(auth: AuthContext, data: PublicMessageResult) {
    const message = await this.db.message.findUnique({ where: { id: data.messageId }, select: { status: true } });
    if (message?.status === 'QUEUED') {
      try {
        await this.outboundQueue.add('send-message', { messageId: data.messageId }, {
          jobId: `message-${data.messageId}`, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000,
        });
      } catch {
        throw new ServiceUnavailableException('Mensagem registrada. Repita a requisição com o mesmo Idempotency-Key para enfileirar o envio');
      }
    }
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId: data.conversationId });
    return data;
  }
}
