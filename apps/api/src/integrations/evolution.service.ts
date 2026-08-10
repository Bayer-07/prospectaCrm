import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { contactTemplateVariables, isOptOutMessage, normalizeEvolutionInstanceStatus, renderTemplateVariables, type EvolutionInstanceStatus } from '@prospecta/contracts';
import { permissionScope, scopedWhere } from '../auth/data-scope.js';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INBOUND_QUEUE, OUTBOUND_QUEUE } from '../queue/queue.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { ConversationPdfItem } from './conversation-pdf.js';
import { conversationVisibilityWhere } from './conversation-visibility.js';
import { TranscriptionsService } from './transcriptions.service.js';

type ProfilePictureCacheEntry = { expiresAt: number; sizeBytes: number; picture: { body: Buffer; contentType: string } | null };
type ConversationPdfMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  text: string | null;
  status: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
  transcriptionStatus: string | null;
  transcriptionText: string | null;
  transcriptionError: string | null;
  media: Array<{ filename: string; contentType: string }>;
};
const MAX_PROFILE_PICTURE_CACHE_ENTRIES = 250;
const MAX_PROFILE_PICTURE_CACHE_BYTES = 64 * 1024 * 1024;
const PDF_TRANSCRIPTION_POLL_INTERVAL_MS = 500;
const PDF_TRANSCRIPTION_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.PDF_TRANSCRIPTION_TIMEOUT_MS) || 5 * 60_000, 10_000),
  15 * 60_000,
);

@Injectable()
export class EvolutionService {
  private readonly baseUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY || '';
  private readonly profilePictureCache = new Map<string, ProfilePictureCacheEntry>();
  private readonly pendingProfilePictures = new Map<string, Promise<ProfilePictureCacheEntry['picture']>>();
  private profilePictureCacheBytes = 0;

  constructor(
    private readonly db: PrismaService,
    @Inject(INBOUND_QUEUE) private readonly inboundQueue: Queue,
    @Inject(OUTBOUND_QUEUE) private readonly outboundQueue: Queue,
    private readonly realtime: RealtimeGateway,
    @Optional() private readonly transcriptions?: TranscriptionsService,
  ) {}

  async listInstances(auth: AuthContext) {
    const scope = permissionScope(auth, 'integrations');
    const instances = await this.db.whatsappInstance.findMany({
      where: { organizationId: auth.organizationId, archivedAt: null, ...(scope === 'ALL' ? {} : auth.teamId ? { teams: { some: { teamId: auth.teamId } } } : { id: '__none__' }) },
      include: { teams: { include: { team: true } }, warmupProfile: true, _count: { select: { conversations: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!instances.length) return instances;
    return this.reconcileProviderInstanceStatuses(instances);
  }

  async checkWhatsappNumbers(instanceKey: string, numbers: string[]) {
    const normalized = [...new Set(numbers.map((number) => number.replace(/\D/g, '')).filter(Boolean))];
    const checked: Array<{ number: string; exists: boolean; jid?: string }> = [];
    const batches: string[][] = [];
    for (let index = 0; index < normalized.length; index += 100) {
      batches.push(normalized.slice(index, index + 100));
    }
    for (let index = 0; index < batches.length; index += 3) {
      const groupResults = await Promise.all(batches.slice(index, index + 3).map(async (batch) => {
        const response = await this.request(`/chat/whatsappNumbers/${encodeURIComponent(instanceKey)}`, {
          method: 'POST',
          body: JSON.stringify({ numbers: batch }),
        });
        const responseNumbers = Array.isArray(response)
          ? response
          : Array.isArray(response.numbers)
            ? response.numbers
            : Array.isArray(response.data)
              ? response.data
              : [];
        const byNumber = new Map(responseNumbers.map((item: Record<string, unknown>) => {
          const number = String(item.number || item.jid || '').split('@')[0].replace(/\D/g, '');
          return [number, item];
        }));
        return batch.map((number) => {
          const item = byNumber.get(number);
          return {
            number,
            exists: item?.exists === true,
            ...(typeof item?.jid === 'string' ? { jid: item.jid } : {}),
          };
        });
      }));
      checked.push(...groupResults.flat());
    }
    return checked;
  }

  async createInstance(auth: AuthContext, input: { name: string; instanceKey: string; teamIds: string[] }) {
    const writeScope = permissionScope(auth, 'integrations', 'write');
    if (writeScope !== 'ALL' && (!auth.teamId || input.teamIds.some((id) => id !== auth.teamId))) throw new BadRequestException('Você só pode conectar números da sua equipe');
    const teams = await this.db.team.count({ where: { organizationId: auth.organizationId, id: { in: input.teamIds } } });
    if (!input.teamIds.length || teams !== new Set(input.teamIds).size) throw new BadRequestException('Selecione equipes válidas');
    const instance = await this.db.whatsappInstance.create({
      data: {
        organizationId: auth.organizationId, name: input.name, instanceKey: input.instanceKey, status: 'CONNECTING',
        teams: { create: input.teamIds.map((teamId) => ({ teamId })) },
        warmupProfile: { create: {} },
      },
    });
    try {
      const response = await this.createProviderInstance(input.instanceKey);
      await this.audit(auth, 'whatsapp.instance_created', instance.id, { instanceKey: input.instanceKey, teamIds: input.teamIds });
      return { instance, qrcode: this.extractQrCode(response) };
    } catch (error) {
      await this.db.whatsappInstance.update({ where: { id: instance.id }, data: { status: 'ERROR' } });
      throw error;
    }
  }

  async connect(auth: AuthContext, id: string) {
    const instance = await this.getInstance(auth, id);
    let result: Record<string, any>;
    try {
      result = await this.request(`/instance/connect/${encodeURIComponent(instance.instanceKey)}`, { method: 'GET' });
    } catch (error) {
      if (!this.isProviderNotFound(error)) throw error;
      result = await this.createProviderInstance(instance.instanceKey);
    }
    const qrcode = this.extractQrCode(result);
    if (!qrcode) {
      const providerStatus = normalizeEvolutionInstanceStatus(result.instance?.state || result.state);
      if (providerStatus === 'CONNECTED') throw new BadRequestException('Este número já está conectado');
      throw new BadGatewayException('A Evolution API não retornou um QR Code válido');
    }
    await this.db.whatsappInstance.update({ where: { id }, data: { status: 'CONNECTING', qrExpiresAt: new Date(Date.now() + 30_000) } });
    this.realtime.notifyOrganization(auth.organizationId, 'whatsapp.updated', { instanceId: id });
    return { qrcode, expiresInSeconds: 30 };
  }

  async restart(auth: AuthContext, id: string) {
    const instance = await this.getInstance(auth, id);
    await this.request(`/instance/restart/${encodeURIComponent(instance.instanceKey)}`, { method: 'PUT' });
    return this.db.whatsappInstance.update({ where: { id }, data: { status: 'CONNECTING' } });
  }

  async logout(auth: AuthContext, id: string) {
    const instance = await this.getInstance(auth, id);
    try {
      await this.request(`/instance/logout/${encodeURIComponent(instance.instanceKey)}`, { method: 'DELETE' });
    } catch (error) {
      if (!this.isProviderNotFound(error)) throw error;
    }
    const disconnected = await this.db.whatsappInstance.update({
      where: { id },
      data: { status: 'DISCONNECTED', connectedAt: null },
    });
    await this.audit(auth, 'whatsapp.instance_disconnected', id, { name: instance.name, instanceKey: instance.instanceKey });
    this.realtime.notifyOrganization(auth.organizationId, 'whatsapp.updated', { instanceId: id });
    return disconnected;
  }

  async deleteInstance(auth: AuthContext, id: string) {
    const instance = await this.getInstance(auth, id);
    let providerCleanupError: string | null = null;
    try {
      await this.request(`/instance/delete/${encodeURIComponent(instance.instanceKey)}`, { method: 'DELETE' });
    } catch (error) {
      if (!this.isProviderNotFound(error)) {
        providerCleanupError = this.errorMessage(error);
        console.warn('[evolution:delete-instance] Falha ao remover sessão remota; a conexão local será arquivada.', {
          instanceId: id,
          instanceKey: instance.instanceKey,
          error: providerCleanupError,
        });
      }
    }
    const archived = await this.db.whatsappInstance.update({
      where: { id },
      data: {
        status: 'DISCONNECTED',
        connectedAt: null,
        archivedAt: new Date(),
        instanceKey: `${instance.instanceKey}__deleted__${randomUUID()}`,
      },
    });
    await this.audit(auth, 'whatsapp.instance_deleted', id, {
      name: instance.name,
      instanceKey: instance.instanceKey,
      providerCleanupPending: Boolean(providerCleanupError),
      ...(providerCleanupError ? { providerCleanupError } : {}),
    });
    this.realtime.notifyOrganization(auth.organizationId, 'whatsapp.updated', { instanceId: id });
    return archived;
  }

  async conversations(auth: AuthContext, query: {
    status?: string;
    assignee?: string;
    view?: string;
    search?: string;
    limit?: string;
    instanceId?: string;
    assigneeId?: string;
    lastInteractionFrom?: string;
    lastInteractionTo?: string;
  }) {
    const requestedStatus = query.status?.toUpperCase();
    const statusWhere: Prisma.ConversationWhereInput = requestedStatus === 'ACTIVE'
      ? { status: { in: ['WAITING', 'OPEN'] } }
      : requestedStatus && ['WAITING', 'OPEN', 'CLOSED'].includes(requestedStatus)
        ? { status: requestedStatus as never }
        : {};
    const search = query.search?.trim().slice(0, 120);
    const requestedLimit = Number.parseInt(query.limit || '', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
    const searchWhere: Prisma.ConversationWhereInput = search ? {
      OR: [
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { phone: { contains: search, mode: 'insensitive' } } },
        { contact: { email: { contains: search, mode: 'insensitive' } } },
        { contact: { companies: { some: { company: { name: { contains: search, mode: 'insensitive' } } } } } },
        { assignee: { name: { contains: search, mode: 'insensitive' } } },
        { instance: { name: { contains: search, mode: 'insensitive' } } },
      ],
    } : {};
    const parseInteractionDate = (value: string | undefined, label: string) => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} inválida`);
      return parsed;
    };
    const lastInteractionFrom = parseInteractionDate(query.lastInteractionFrom, 'Data inicial');
    const lastInteractionTo = parseInteractionDate(query.lastInteractionTo, 'Data final');
    if (lastInteractionFrom && lastInteractionTo && lastInteractionFrom >= lastInteractionTo) {
      throw new BadRequestException('A data final deve ser posterior à data inicial');
    }
    const lastInteractionWhere: Prisma.ConversationWhereInput = lastInteractionFrom || lastInteractionTo
      ? {
        lastMessageAt: {
          ...(lastInteractionFrom ? { gte: lastInteractionFrom } : {}),
          ...(lastInteractionTo ? { lt: lastInteractionTo } : {}),
        },
      }
      : {};
    const instanceWhere: Prisma.ConversationWhereInput = query.instanceId
      ? { instanceId: query.instanceId }
      : {};
    const assigneeWhere: Prisma.ConversationWhereInput = query.assigneeId === 'unassigned'
      ? { assigneeId: null }
      : query.assigneeId
        ? { assigneeId: query.assigneeId }
        : query.assignee === 'me'
          ? { assigneeId: auth.userId }
          : {};
    const where: Prisma.ConversationWhereInput = {
      organizationId: auth.organizationId,
      AND: [
        conversationVisibilityWhere(auth, query.view === 'all'),
        statusWhere,
        searchWhere,
        lastInteractionWhere,
        instanceWhere,
        assigneeWhere,
      ],
    };
    const select = {
      id: true, unreadCount: true, status: true, lastMessageAt: true,
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          consentStatus: true,
          companies: {
            select: {
              isPrimary: true,
              company: { select: { id: true, name: true } },
            },
            orderBy: { isPrimary: 'desc' as const },
            take: 1,
          },
        },
      },
      assignee: { select: { id: true, name: true } },
      instance: { select: { id: true, name: true, phone: true, status: true } },
      messages: {
        where: { type: { not: 'reaction' } },
        select: { id: true, text: true, type: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        take: 1,
      },
    } satisfies Prisma.ConversationSelect;
    const pinnedRows = auth.userId
      ? await this.db.conversationPin.findMany({
        where: { userId: auth.userId, conversation: { is: { ...where, status: 'OPEN' } } },
        select: { conversation: { select } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      : [];
    const pinned = pinnedRows.map((row) => ({ ...row.conversation, isPinned: true }));
    const remaining = limit - pinned.length;
    if (remaining <= 0) return pinned;
    const pinnedIds = pinned.map((conversation) => conversation.id);
    const recent = await this.db.conversation.findMany({
      where: {
        ...where,
        ...(pinnedIds.length ? { id: { notIn: pinnedIds } } : {}),
      },
      select,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: remaining,
    });
    return [...pinned, ...recent.map((conversation) => ({ ...conversation, isPinned: false }))];
  }

  async setConversationPinned(auth: AuthContext, id: string, pinned: boolean) {
    if (!auth.userId) throw new BadRequestException('Fixar conversas exige sessão de usuário');
    const conversation = await this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.conversationScope(auth) },
      select: { id: true, status: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (pinned && conversation.status !== 'OPEN') {
      throw new BadRequestException('Somente conversas abertas podem ser fixadas');
    }
    if (pinned) {
      await this.db.conversationPin.upsert({
        where: { userId_conversationId: { userId: auth.userId, conversationId: id } },
        create: { userId: auth.userId, conversationId: id },
        update: { createdAt: new Date() },
      });
    } else {
      await this.db.conversationPin.deleteMany({
        where: { userId: auth.userId, conversationId: id },
      });
    }
    return { id, isPinned: pinned };
  }

  async conversationCounts(auth: AuthContext, view?: string) {
    const where = { organizationId: auth.organizationId, ...conversationVisibilityWhere(auth, view === 'all') };
    const counts = await this.db.conversation.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const result = { waiting: 0, open: 0, closed: 0 };
    for (const item of counts) result[item.status.toLowerCase() as keyof typeof result] = item._count._all;
    return result;
  }

  async conversationFilterOptions(auth: AuthContext, view?: string) {
    void view;
    const canViewAllUsers = auth.roleKey === 'admin';
    const instanceScope: Prisma.WhatsappInstanceWhereInput = auth.roleKey === 'admin'
      ? {}
      : auth.teamId
        ? { teams: { some: { teamId: auth.teamId } } }
        : { id: '__none__' };
    const [instances, users] = await Promise.all([
      this.db.whatsappInstance.findMany({
        where: {
          organizationId: auth.organizationId,
          archivedAt: null,
          ...instanceScope,
        },
        select: { id: true, name: true, phone: true, status: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.user.findMany({
        where: {
          organizationId: auth.organizationId,
          status: 'ACTIVE',
          ...(canViewAllUsers ? {} : { id: auth.userId || '__none__' }),
        },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { instances, users };
  }

  conversationInstances(auth: AuthContext) {
    return this.db.whatsappInstance.findMany({
      where: this.conversationInstanceWhere(auth),
      select: { id: true, name: true, phone: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  async startConversation(auth: AuthContext, input: { contactId: string; instanceId: string }) {
    if (!auth.userId) throw new BadRequestException('Iniciar atendimento exige sessão de usuário');
    const assigneeId = auth.userId;
    const [contact, instance] = await Promise.all([
      this.db.contact.findFirst({
        where: {
          id: input.contactId,
          organizationId: auth.organizationId,
          archivedAt: null,
          ...scopedWhere(auth, 'contacts'),
        },
      }),
      this.db.whatsappInstance.findFirst({
        where: { id: input.instanceId, ...this.conversationInstanceWhere(auth) },
        select: { id: true },
      }),
    ]);
    if (!contact) throw new NotFoundException('Contato não encontrado');
    if (!contact.phone) throw new BadRequestException('O contato precisa ter um telefone para iniciar uma conversa');
    if (!instance) throw new BadRequestException('Selecione uma conexão do WhatsApp ativa');

    const remoteJid = `${contact.phone.replace(/\D/g, '')}@s.whatsapp.net`;
    const existing = await this.db.conversation.findFirst({
      where: { instanceId: instance.id, OR: [{ remoteJid }, { phoneJid: remoteJid }, { contactId: contact.id }] },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, assigneeId: true, status: true },
    });
    if (existing?.status === 'OPEN' && auth.roleKey !== 'admin' && existing.assigneeId && existing.assigneeId !== assigneeId) {
      throw new NotFoundException('Conversa não encontrada');
    }

    const conversation = existing
      ? await this.db.conversation.update({
        where: { id: existing.id },
        data: { contactId: contact.id, assigneeId, status: 'OPEN', closedAt: null },
        include: { assignee: { select: { id: true, name: true } } },
      })
      : await this.db.conversation.create({
        data: {
          organizationId: auth.organizationId,
          instanceId: instance.id,
          contactId: contact.id,
          assigneeId,
          remoteJid,
          status: 'OPEN',
        },
        include: { assignee: { select: { id: true, name: true } } },
      });
    const tookOwnership = Boolean(existing?.assigneeId && existing.assigneeId !== assigneeId);
    const event = !existing
      ? { type: 'started', text: `${auth.name} iniciou o atendimento` }
      : existing.status === 'CLOSED'
        ? { type: 'reopened', text: `${auth.name} reabriu${tookOwnership ? ' e assumiu' : ''} o atendimento` }
        : existing.status !== 'OPEN' || !existing.assigneeId
          ? { type: 'started', text: `${auth.name} iniciou o atendimento` }
          : tookOwnership
            ? { type: 'transferred', text: `${auth.name} assumiu o atendimento` }
            : null;
    if (event) await this.conversationEvent(auth, conversation.id, event.type, event.text, {
      contactId: contact.id,
      instanceId: instance.id,
      previousAssigneeId: existing?.assigneeId || null,
      assigneeId,
    });
    await this.db.auditLog.create({
      data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: existing ? 'conversation.reopened' : 'conversation.started',
        entityType: 'Conversation',
        entityId: conversation.id,
        after: {
          contactId: contact.id,
          instanceId: instance.id,
          previousAssigneeId: existing?.assigneeId || null,
          assigneeId,
        },
      },
    });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId: conversation.id });
    return conversation;
  }

  async conversation(auth: AuthContext, id: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.conversationScope(auth) },
      include: {
        contact: {
          include: {
            companies: { include: { company: true } },
            tags: { include: { tag: true } },
            owner: { select: { id: true, name: true } },
            team: { select: { id: true, name: true, color: true } },
            opportunities: {
              include: {
                opportunity: {
                  include: {
                    stage: { select: { id: true, name: true, color: true } },
                    owner: { select: { id: true, name: true } },
                    team: { select: { id: true, name: true, color: true } },
                  },
                },
              },
              orderBy: { opportunity: { updatedAt: 'desc' } },
              take: 10,
            },
            tasks: { orderBy: { dueAt: 'asc' }, take: 10 },
            consentEvents: { orderBy: { occurredAt: 'desc' }, take: 5 },
          },
        },
        assignee: { select: { id: true, name: true } }, instance: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return { ...conversation, messages: [], events: [] };
  }

  async conversationMessages(auth: AuthContext, id: string, query: { cursor?: string; limit?: string }) {
    await this.assertConversation(auth, id);
    const parsedLimit = Number.parseInt(query.limit || '', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 30;
    const cursor = query.cursor?.trim() || undefined;
    const cursorMessage = cursor ? await this.db.message.findFirst({
      where: { id: cursor, conversationId: id, type: { not: 'reaction' } },
      select: { id: true, createdAt: true },
    }) : null;
    if (cursor && !cursorMessage) throw new BadRequestException('Cursor de mensagens invÃ¡lido');

    const rows = await this.db.message.findMany({
      where: { conversationId: id, type: { not: 'reaction' } },
      include: { media: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorMessage ? { cursor: { id: cursorMessage.id }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const oldestMessage = page.at(-1);
    const eventDateRange: Prisma.DateTimeFilter = {
      ...(cursorMessage ? { lt: cursorMessage.createdAt } : {}),
      ...(hasMore && oldestMessage ? { gte: oldestMessage.createdAt } : {}),
    };
    const events = await this.db.conversationEvent.findMany({
      where: {
        conversationId: id,
        ...(cursorMessage || (hasMore && oldestMessage) ? { createdAt: eventDateRange } : {}),
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      messages: page.reverse(),
      events,
      nextCursor: hasMore ? oldestMessage?.id || null : null,
    };
  }

  conversationAssignees(auth: AuthContext) {
    return this.db.user.findMany({
      where: {
        organizationId: auth.organizationId,
        status: 'ACTIVE',
        ...(auth.roleKey === 'admin' ? {} : auth.teamId ? { teamId: auth.teamId } : { id: auth.userId || '__none__' }),
      },
      select: { id: true, name: true, email: true, team: { select: { id: true, name: true, color: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async exportConversationPdf(auth: AuthContext, id: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.conversationScope(auth) },
      select: {
        id: true,
        status: true,
        createdAt: true,
        organization: { select: { name: true } },
        contact: { select: { name: true, phone: true } },
        instance: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const latestStart = await this.db.conversationEvent.findFirst({
      where: {
        organizationId: auth.organizationId,
        conversationId: conversation.id,
        type: { in: ['started', 'reopened'] },
      },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const attendanceStartedAt = latestStart?.createdAt || conversation.createdAt;
    const previousAttendanceEnd = latestStart
      ? await this.db.conversationEvent.findFirst({
        where: {
          organizationId: auth.organizationId,
          conversationId: conversation.id,
          type: 'closed',
          createdAt: { lt: latestStart.createdAt },
        },
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      : null;
    // The message that reopens a ticket can be persisted with the provider's
    // timestamp a few milliseconds before the `started` event. The previous
    // closing event is therefore the reliable exclusive boundary between two
    // attendances.
    const attendanceDateFilter = previousAttendanceEnd
      ? { createdAt: { gt: previousAttendanceEnd.createdAt } }
      : {};
    const [storedMessages, storedEvents] = await Promise.all([
      this.db.message.findMany({
        where: {
          conversationId: conversation.id,
          type: { not: 'reaction' },
          ...attendanceDateFilter,
        },
        select: {
          id: true,
          direction: true,
          type: true,
          text: true,
          status: true,
          payload: true,
          createdAt: true,
          transcriptionStatus: true,
          transcriptionText: true,
          transcriptionError: true,
          media: { select: { filename: true, contentType: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.conversationEvent.findMany({
        where: { conversationId: conversation.id, ...attendanceDateFilter },
        select: { id: true, type: true, text: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const conversationMessages = await this.ensurePdfAudioTranscriptions(auth, conversation.id, storedMessages);

    const mediaLabels: Record<string, string> = { image: 'Imagem', sticker: 'Figurinha', audio: 'Áudio', video: 'Vídeo', document: 'Documento', deleted: 'Mensagem apagada' };
    const messages: ConversationPdfItem[] = conversationMessages.map((message) => {
      const attachments = message.media.map((media) => `[${mediaLabels[message.type] || 'Arquivo'}: ${media.filename}]`);
      const text = [message.text, ...attachments].filter(Boolean).join('\n') || `[${mediaLabels[message.type] || message.type}]`;
      return {
        kind: 'message',
        createdAt: message.createdAt,
        direction: message.direction,
        text,
        status: message.status,
        ...(this.isPdfAudioMessage(message) && message.transcriptionText
          ? { transcription: message.transcriptionText }
          : {}),
      };
    });
    const events: ConversationPdfItem[] = storedEvents.map((event) => ({ kind: 'event', createdAt: event.createdAt, text: event.text }));
    const exportedAt = new Date();
    const { buildConversationPdf } = await import('./conversation-pdf.js');
    const buffer = await buildConversationPdf({
      organizationName: conversation.organization.name,
      contactName: conversation.contact.name,
      contactPhone: conversation.contact.phone,
      instanceName: conversation.instance.name,
      assigneeName: conversation.assignee?.name,
      status: conversation.status,
      createdAt: attendanceStartedAt,
      exportedAt,
      items: [...messages, ...events],
    });
    await this.db.auditLog.create({ data: {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'conversation.pdf_exported',
      entityType: 'Conversation',
      entityId: conversation.id,
      after: {
        exportedAt: exportedAt.toISOString(),
        attendanceStartedAt: attendanceStartedAt.toISOString(),
        messageCount: messages.length,
        transcribedAudioCount: messages.filter((message) => Boolean(message.transcription)).length,
      },
    } });
    const safeName = conversation.contact.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'contato';
    return { buffer, filename: `atendimento-${safeName}.pdf` };
  }

  private isPdfAudioMessage(message: Pick<ConversationPdfMessage, 'type' | 'payload' | 'media'>) {
    const payload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
      ? message.payload as Record<string, Prisma.JsonValue>
      : {};
    const originalType = typeof payload.originalType === 'string' ? payload.originalType : message.type;
    return originalType === 'audio'
      || message.type === 'audio'
      || message.media.some((media) => media.contentType.toLowerCase().startsWith('audio/'));
  }

  private async ensurePdfAudioTranscriptions(
    auth: AuthContext,
    conversationId: string,
    messages: ConversationPdfMessage[],
  ) {
    const missing = messages.filter((message) => this.isPdfAudioMessage(message) && !message.transcriptionText?.trim());
    if (!missing.length) return messages;
    if (!this.transcriptions) {
      throw new ServiceUnavailableException('O serviço de transcrição não está disponível para gerar o PDF');
    }

    const requests = await Promise.allSettled(
      missing.map((message) => this.transcriptions!.request(auth, conversationId, message.id)),
    );
    const rejected = requests.find((request) => request.status === 'rejected');
    if (rejected?.status === 'rejected') {
      const detail = rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason);
      throw new ServiceUnavailableException(`Não foi possível iniciar a transcrição dos áudios: ${detail}`);
    }

    const pendingIds = new Set(missing.map((message) => message.id));
    const transcriptions = new Map<string, string>();
    const deadline = Date.now() + PDF_TRANSCRIPTION_TIMEOUT_MS;
    while (pendingIds.size && Date.now() < deadline) {
      const states = await this.db.message.findMany({
        where: { conversationId, id: { in: [...pendingIds] } },
        select: {
          id: true,
          transcriptionStatus: true,
          transcriptionText: true,
          transcriptionError: true,
        },
      });
      for (const state of states) {
        if (state.transcriptionStatus === 'COMPLETED' && state.transcriptionText?.trim()) {
          transcriptions.set(state.id, state.transcriptionText.trim());
          pendingIds.delete(state.id);
          continue;
        }
        if (state.transcriptionStatus === 'FAILED') {
          throw new ServiceUnavailableException(
            `Não foi possível transcrever um áudio do atendimento: ${state.transcriptionError || 'erro desconhecido'}`,
          );
        }
      }
      if (pendingIds.size) {
        await new Promise((resolve) => setTimeout(resolve, PDF_TRANSCRIPTION_POLL_INTERVAL_MS));
      }
    }
    if (pendingIds.size) {
      throw new ServiceUnavailableException('A transcrição dos áudios não terminou a tempo. Tente exportar novamente.');
    }

    return messages.map((message) => ({
      ...message,
      transcriptionText: transcriptions.get(message.id) || message.transcriptionText,
      transcriptionStatus: transcriptions.has(message.id) ? 'COMPLETED' : message.transcriptionStatus,
    }));
  }

  async profilePicture(auth: AuthContext, id: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.conversationScope(auth) },
      select: {
        instanceId: true,
        remoteJid: true,
        phoneJid: true,
        contact: { select: { phone: true } },
        instance: { select: { instanceKey: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    const number = conversation.contact.phone?.replace(/\D/g, '')
      || conversation.phoneJid?.split('@')[0].replace(/\D/g, '')
      || (conversation.remoteJid.includes('@s.whatsapp.net') ? conversation.remoteJid.split('@')[0].replace(/\D/g, '') : '');
    if (!number) return null;

    const cacheKey = `${conversation.instanceId}:${number}`;
    const cached = this.profilePictureCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.profilePictureCache.delete(cacheKey);
      this.profilePictureCache.set(cacheKey, cached);
      return cached.picture;
    }
    if (cached) this.removeProfilePictureCacheEntry(cacheKey);

    const pending = this.pendingProfilePictures.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      let picture: ProfilePictureCacheEntry['picture'] = null;
      try {
        const metadata = await this.request(`/chat/fetchProfilePictureUrl/${encodeURIComponent(conversation.instance.instanceKey)}`, {
          method: 'POST',
          body: JSON.stringify({ number }),
        });
        const rawUrl = String(metadata.profilePictureUrl || metadata.picture || metadata.url || '');
        if (rawUrl) picture = await this.downloadProfilePicture(rawUrl);
      } catch {
        picture = null;
      }
      this.cacheProfilePicture(cacheKey, picture);
      return picture;
    })();
    this.pendingProfilePictures.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.pendingProfilePictures.delete(cacheKey);
    }
  }

  async assign(auth: AuthContext, id: string, assigneeId: string | null) {
    const conversation = await this.assertConversation(auth, id);
    if (conversation.status === 'CLOSED') throw new BadRequestException('Reabra a conversa antes de alterar o responsável');
    let assignee: { id: string; name: string } | null = null;
    if (assigneeId) {
      if (auth.roleKey !== 'admin' && !auth.teamId && assigneeId !== auth.userId) throw new BadRequestException('Responsável inválido');
      assignee = await this.db.user.findFirst({ where: {
        id: assigneeId,
        organizationId: auth.organizationId,
        status: 'ACTIVE',
        ...(auth.roleKey !== 'admin' && auth.teamId ? { teamId: auth.teamId } : {}),
      }, select: { id: true, name: true } });
      if (!assignee) throw new BadRequestException('Responsável inválido');
    }
    const event = assigneeId === conversation.assigneeId
      ? null
      : assignee
        ? { type: conversation.assigneeId ? 'transferred' : 'assigned', text: conversation.assigneeId ? `${auth.name} transferiu o atendimento para ${assignee.name}` : `${auth.name} assumiu o atendimento` }
        : { type: 'unassigned', text: `${auth.name} devolveu o atendimento para a fila de espera` };
    const [updated] = await this.db.$transaction([
      this.db.conversation.update({ where: { id }, data: {
        assigneeId,
        status: assigneeId ? 'OPEN' : 'WAITING',
        closedAt: null,
      } }),
      ...(assigneeId ? [this.db.chatbotSession.updateMany({
        where: { conversationId: id, status: { in: ['ACTIVE', 'WAITING', 'HANDED_OFF'] } },
        data: { status: 'STOPPED' as const, stopReason: 'Atendimento assumido por um usuário', completedAt: new Date() },
      })] : []),
      ...(event ? [this.conversationEvent(auth, id, event.type, event.text, { assigneeId })] : []),
    ]);
    if (assigneeId) await this.db.notification.create({ data: {
      organizationId: auth.organizationId, userId: assigneeId, type: 'conversation.assigned',
      title: `Conversa atribuída: ${conversation.remoteJid}`, actionUrl: `/inbox/${id}`,
    } });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId: id });
    return updated;
  }

  async changeConversationInstance(auth: AuthContext, id: string, instanceId: string) {
    const requestedInstanceId = String(instanceId || '').trim();
    if (!requestedInstanceId) throw new BadRequestException('Selecione a nova conexão');

    const conversation = await this.db.conversation.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        ...this.conversationScope(auth, 'write'),
      },
      select: {
        id: true,
        instanceId: true,
        contactId: true,
        remoteJid: true,
        phoneJid: true,
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            archivedAt: true,
          },
        },
        contact: { select: { phone: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.instance.status !== 'DISCONNECTED' && !conversation.instance.archivedAt) {
      throw new BadRequestException('A conexão atual precisa estar desconectada ou excluída para ser substituída');
    }
    if (conversation.instanceId === requestedInstanceId) {
      throw new BadRequestException('Selecione uma conexão diferente da atual');
    }

    const target = await this.db.whatsappInstance.findFirst({
      where: {
        id: requestedInstanceId,
        ...this.conversationInstanceWhere(auth),
      },
      select: { id: true, name: true, phone: true, status: true },
    });
    if (!target) throw new BadRequestException('Selecione uma conexão do WhatsApp ativa');

    const contactNumber = conversation.contact.phone?.replace(/\D/g, '') || '';
    const phoneJid = contactNumber
      ? `${contactNumber}@s.whatsapp.net`
      : conversation.phoneJid || (conversation.remoteJid.endsWith('@s.whatsapp.net') ? conversation.remoteJid : '');
    if (!phoneJid) {
      throw new BadRequestException('O contato precisa ter um telefone válido para trocar a conexão');
    }

    const conflictingConversation = await this.db.conversation.findFirst({
      where: {
        id: { not: conversation.id },
        instanceId: target.id,
        OR: [
          { contactId: conversation.contactId },
          { remoteJid: phoneJid },
          { phoneJid },
        ],
      },
      select: { id: true },
    });
    if (conflictingConversation) {
      throw new BadRequestException({
        message: 'Já existe uma conversa com este contato na conexão selecionada',
        conversationId: conflictingConversation.id,
      });
    }

    const [updated] = await this.db.$transaction([
      this.db.conversation.update({
        where: { id: conversation.id },
        data: {
          instanceId: target.id,
          remoteJid: phoneJid,
          phoneJid,
        },
        include: {
          instance: { select: { id: true, name: true, phone: true, status: true, archivedAt: true } },
          assignee: { select: { id: true, name: true } },
        },
      }),
      this.conversationEvent(
        auth,
        conversation.id,
        'instance_changed',
        `${auth.name} alterou a conexão de “${conversation.instance.name}” para “${target.name}”`,
        {
          previousInstanceId: conversation.instanceId,
          previousInstanceName: conversation.instance.name,
          instanceId: target.id,
          instanceName: target.name,
        },
      ),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'conversation.instance_changed',
          entityType: 'Conversation',
          entityId: conversation.id,
          before: {
            instanceId: conversation.instanceId,
            instanceName: conversation.instance.name,
            remoteJid: conversation.remoteJid,
            phoneJid: conversation.phoneJid,
          },
          after: {
            instanceId: target.id,
            instanceName: target.name,
            remoteJid: phoneJid,
            phoneJid,
          },
        },
      }),
    ]);
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', {
      conversationId: conversation.id,
      previousInstanceId: conversation.instanceId,
      instanceId: target.id,
    });
    return updated;
  }

  async setConversationStatus(auth: AuthContext, id: string, status: 'OPEN' | 'CLOSED') {
    const conversation = await this.assertConversation(auth, id);
    const nextAssigneeId = status === 'OPEN'
      ? auth.userId || conversation.assigneeId
      : conversation.assigneeId;
    const nextStatus = status === 'CLOSED' ? 'CLOSED' : nextAssigneeId ? 'OPEN' : 'WAITING';
    const tookOwnership = nextStatus === 'OPEN'
      && Boolean(nextAssigneeId)
      && nextAssigneeId !== conversation.assigneeId;
    const event = nextStatus === 'CLOSED' && conversation.status !== 'CLOSED'
      ? { type: 'closed', text: `${auth.name} finalizou o atendimento` }
      : nextStatus === 'OPEN' && conversation.status === 'CLOSED'
        ? { type: 'reopened', text: `${auth.name} reabriu${tookOwnership ? ' e assumiu' : ''} o atendimento` }
        : tookOwnership
          ? { type: 'transferred', text: `${auth.name} assumiu o atendimento` }
          : null;
    const [updated] = await this.db.$transaction([
      this.db.conversation.update({
        where: { id },
        data: {
          status: nextStatus,
          assigneeId: nextAssigneeId,
          closedAt: nextStatus === 'CLOSED' ? new Date() : null,
        },
        include: { assignee: { select: { id: true, name: true } } },
      }),
      ...(nextStatus === 'CLOSED' ? [this.db.chatbotSession.updateMany({
        where: { conversationId: id, status: { in: ['ACTIVE', 'WAITING', 'HANDED_OFF', 'STOPPED'] } },
        data: { status: 'COMPLETED' as const, stopReason: 'Atendimento encerrado por um usuário', completedAt: new Date() },
      })] : []),
      ...(event ? [this.conversationEvent(auth, id, event.type, event.text, {
        previousAssigneeId: conversation.assigneeId,
        assigneeId: nextAssigneeId,
      })] : []),
    ]);
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId: id });
    return updated;
  }

  async markRead(auth: AuthContext, id: string) {
    const conversation = await this.assertConversation(auth, id);
    if (conversation.unreadCount === 0) return conversation;
    const updated = await this.db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId: id });
    return updated;
  }

  async sendMessage(auth: AuthContext, conversationId: string, input: { type?: string; text?: string; mediaKey?: string; replyToMessageId?: string; signatureEnabled?: boolean }) {
    const conversation = await this.assertConversation(auth, conversationId);
    if (conversation.status !== 'OPEN' || !conversation.assigneeId) throw new BadRequestException('Assuma a conversa antes de responder');
    if (!input.text && !input.mediaKey) throw new BadRequestException('Informe texto ou mídia');
    const [media, replyTarget] = await Promise.all([
      input.mediaKey
        ? this.db.mediaAsset.findUnique({ where: { key: input.mediaKey }, select: { id: true, key: true } })
        : null,
      input.replyToMessageId
        ? this.db.message.findFirst({
            where: { id: input.replyToMessageId, conversationId },
            select: { id: true, providerMessageId: true, status: true },
          })
        : null,
    ]);
    if (input.mediaKey && (!media || !media.key.startsWith(`${auth.organizationId}/`))) throw new BadRequestException('Mídia inválida');
    if (input.replyToMessageId && !replyTarget) throw new BadRequestException('A mensagem respondida não pertence a esta conversa');
    if (replyTarget && (replyTarget.providerMessageId.startsWith('local:') || ['QUEUED', 'PENDING', 'FAILED', 'SKIPPED'].includes(replyTarget.status))) {
      throw new BadRequestException('Aguarde a mensagem ser enviada antes de respondê-la');
    }
    // The request value mirrors the checkbox that was visible when the operator
    // clicked send. Falling back to the persisted preference keeps older clients
    // working and avoids a race while that preference is being saved.
    const signatureEnabled = auth.type === 'session'
      ? input.signatureEnabled ?? auth.messageSignatureEnabled
      : false;
    const renderedText = input.text
      ? await this.renderConversationTemplate(conversationId, conversation.contactId, input.text)
      : input.text;
    const signedText = renderedText && signatureEnabled
      ? `*${auth.name.trim()}:*\n${renderedText}`
      : renderedText;
    const localMessageId = randomUUID();
    const message = await this.db.message.create({ data: {
      instanceId: conversation.instanceId, conversationId, providerMessageId: `local:${localMessageId}`,
      direction: 'OUTBOUND', type: input.type || 'text', text: signedText, status: 'QUEUED',
      payload: {
        mediaKey: input.mediaKey || null,
        authorId: auth.userId || null,
        replyToMessageId: replyTarget?.id || null,
        signature: signatureEnabled && input.text ? { userId: auth.userId || null, name: auth.name } : null,
      },
      ...(media ? { media: { connect: { id: media.id } } } : {}),
    } });
    await this.outboundQueue.add('send-message', { messageId: message.id }, { jobId: `message-${message.id}`, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId });
    return message;
  }

  async reactToMessage(auth: AuthContext, conversationId: string, messageId: string, reaction: string) {
    const conversation = await this.assertConversationWithInstance(auth, conversationId);
    if (conversation.status !== 'OPEN' || !conversation.assigneeId) throw new BadRequestException('Assuma a conversa antes de reagir');
    const allowedReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    if (reaction && !allowedReactions.includes(reaction)) throw new BadRequestException('Reação inválida');
    const message = await this.db.message.findFirst({ where: { id: messageId, conversationId } });
    if (!message) throw new NotFoundException('Mensagem não encontrada');
    if (message.providerMessageId.startsWith('local:')) throw new BadRequestException('Aguarde a mensagem ser enviada antes de reagir');
    await this.request(`/message/sendReaction/${encodeURIComponent(conversation.instance.instanceKey)}`, {
      method: 'POST',
      body: JSON.stringify({
        key: {
          remoteJid: conversation.remoteJid,
          fromMe: message.direction === 'OUTBOUND',
          id: message.providerMessageId,
        },
        reaction,
      }),
    });

    const payload = (message.payload || {}) as Record<string, any>;
    const currentReactions = Array.isArray(payload.reactions) ? payload.reactions as Array<Record<string, any>> : [];
    const isOwnReaction = (item: Record<string, any>) => item.source === 'me' || (!item.source && Boolean(item.userId));
    const reactions = currentReactions.filter((item) => !isOwnReaction(item));
    if (reaction) reactions.push({ emoji: reaction, source: 'me', userId: auth.userId || null, userName: auth.name, createdAt: new Date().toISOString() });
    const updated = await this.db.message.update({
      where: { id: message.id },
      data: { payload: { ...payload, reactions } as Prisma.InputJsonValue },
    });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId });
    return updated;
  }

  async editMessage(auth: AuthContext, conversationId: string, messageId: string, rawText: string) {
    const conversation = await this.assertConversationWithInstance(auth, conversationId);
    if (conversation.status !== 'OPEN' || !conversation.assigneeId) throw new BadRequestException('Assuma a conversa antes de editar mensagens');
    const sourceText = String(rawText || '').trim();
    if (!sourceText) throw new BadRequestException('A mensagem não pode ficar vazia');
    if (sourceText.length > 4096) throw new BadRequestException('A mensagem deve ter no máximo 4096 caracteres');
    const text = await this.renderConversationTemplate(conversationId, conversation.contactId, sourceText);
    const message = await this.db.message.findFirst({ where: { id: messageId, conversationId, direction: 'OUTBOUND' } });
    if (!message || message.type !== 'text') throw new BadRequestException('Apenas mensagens de texto enviadas podem ser editadas');
    if (message.providerMessageId.startsWith('local:') || ['QUEUED', 'PENDING', 'FAILED', 'SKIPPED'].includes(message.status)) {
      throw new BadRequestException('Esta mensagem ainda não pode ser editada');
    }
    if (message.text === text) return message;
    const payload = (message.payload || {}) as Record<string, any>;
    const providerKey = payload.provider?.key || payload.key || {};
    const remoteJid = String(providerKey.remoteJid || conversation.remoteJid || '').trim();
    if (!remoteJid) throw new BadRequestException('A mensagem não possui um destinatário válido');

    await this.request(`/chat/updateMessage/${encodeURIComponent(conversation.instance.instanceKey)}`, {
      method: 'POST',
      body: JSON.stringify({
        // A Evolution v2 exige uma string e compara este valor com o remoteJid
        // da mensagem original. Preservar @lid também evita editar no chat errado.
        number: remoteJid,
        text,
        key: { remoteJid, fromMe: true, id: message.providerMessageId },
      }),
    });

    const editHistory = Array.isArray(payload.editHistory) ? payload.editHistory.slice(-9) : [];
    const editedAt = new Date().toISOString();
    const updated = await this.db.message.update({
      where: { id: message.id },
      data: {
        text,
        payload: {
          ...payload,
          edited: true,
          editedAt,
          editedBy: auth.userId || null,
          editHistory: [...editHistory, { text: message.text || '', editedAt, editedBy: auth.userId || null }],
        } as Prisma.InputJsonValue,
      },
    });
    await this.db.auditLog.create({ data: {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'conversation.message_edited',
      entityType: 'Message',
      entityId: message.id,
      before: { text: message.text },
      after: { text },
    } });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId });
    return updated;
  }

  async deleteMessage(auth: AuthContext, conversationId: string, messageId: string) {
    const conversation = await this.assertConversationWithInstance(auth, conversationId);
    if (conversation.status !== 'OPEN' || !conversation.assigneeId) throw new BadRequestException('Assuma a conversa antes de apagar mensagens');
    const message = await this.db.message.findFirst({ where: { id: messageId, conversationId, direction: 'OUTBOUND' } });
    const payload = (message?.payload || {}) as Record<string, any>;
    if (!message || message.type === 'deleted' || payload.deleted === true) throw new BadRequestException('Apenas mensagens enviadas podem ser apagadas');
    if (message.providerMessageId.startsWith('local:') || ['QUEUED', 'PENDING', 'FAILED', 'SKIPPED'].includes(message.status)) {
      throw new BadRequestException('Esta mensagem ainda não pode ser apagada para todos');
    }
    const providerKey = payload.provider?.key || payload.key || {};

    await this.request(`/chat/deleteMessageForEveryone/${encodeURIComponent(conversation.instance.instanceKey)}`, {
      method: 'DELETE',
      body: JSON.stringify({
        id: message.providerMessageId,
        remoteJid: String(providerKey.remoteJid || conversation.remoteJid),
        fromMe: true,
      }),
    });

    const updated = await this.db.message.update({
      where: { id: message.id },
      data: {
        payload: {
          ...payload,
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: auth.userId || null,
          originalType: payload.originalType || message.type,
          originalText: payload.originalText ?? message.text ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    await this.db.auditLog.create({ data: {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'conversation.message_deleted',
      entityType: 'Message',
      entityId: message.id,
      before: { type: message.type, text: message.text },
      after: { type: message.type, deleted: true },
    } });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId });
    return updated;
  }

  async retryMessage(auth: AuthContext, conversationId: string, messageId: string) {
    const conversation = await this.assertConversation(auth, conversationId);
    if (conversation.status !== 'OPEN' || !conversation.assigneeId) throw new BadRequestException('Assuma a conversa antes de reenviar mensagens');
    const message = await this.db.message.findFirst({
      where: { id: messageId, conversationId, direction: 'OUTBOUND', status: 'FAILED' },
    });
    if (!message) throw new BadRequestException('Apenas mensagens que falharam podem ser reenviadas');
    const retryId = randomUUID();
    const updated = await this.db.message.update({
      where: { id: message.id },
      data: {
        instanceId: conversation.instanceId,
        providerMessageId: `local:${retryId}`,
        status: 'QUEUED',
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        payload: { ...(message.payload as object), retryId, retriedBy: auth.userId || null, retriedAt: new Date().toISOString() },
      },
    });
    await this.outboundQueue.add('send-message', { messageId: message.id }, {
      jobId: `message-${message.id}-retry-${retryId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
    });
    await this.db.auditLog.create({ data: {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'conversation.message_retried',
      entityType: 'Message',
      entityId: message.id,
      after: { conversationId, retryId },
    } });
    this.realtime.notifyOrganization(auth.organizationId, 'inbox.updated', { conversationId });
    return updated;
  }

  async ingestWebhook(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>) {
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET || '';
    if (expected && headers['x-prospecta-webhook-secret'] !== expected) throw new BadRequestException('Assinatura de webhook inválida');
    const instanceKey = String(body.instance || body.instanceName || body.instanceId || 'unknown');
    // Evolution emits dotted names (for example `messages.upsert`) even when
    // the configured webhook event is written as `MESSAGES_UPSERT`.
    const eventType = String(body.event || body.type || 'UNKNOWN').toUpperCase().replace(/[-.]/g, '_');
    const data = (body.data || body) as Record<string, unknown>;
    const messageId = String((data.key as Record<string, unknown> | undefined)?.id || data.id || '');
    const payloadHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    // MESSAGES_EDITED points to the original message ID, so distinct edits of
    // the same message need the payload hash to remain distinct and replayable.
    const eventIdentity = eventType.includes('MESSAGES_EDITED')
      ? [messageId, payloadHash].filter(Boolean).join(':')
      : messageId || payloadHash;
    const eventKey = String(body.eventId || `${eventType}:${eventIdentity}`);
    const event = await this.db.inboundWebhookEvent.upsert({
      where: { provider_instanceKey_eventKey: { provider: 'evolution', instanceKey, eventKey } },
      update: {}, create: { provider: 'evolution', instanceKey, eventKey, eventType, payload: body as never },
    });
    if (event.status === 'received') {
      await this.inboundQueue.add('process-evolution-event', { eventId: event.id }, { jobId: `evolution-${event.id}`, attempts: 8, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000 });
    }
    return { accepted: true, eventId: event.id };
  }

  isOptOut(text?: string | null) {
    return isOptOutMessage(text);
  }

  async request(path: string, init: RequestInit) {
    if (!this.apiKey) throw new BadGatewayException('EVOLUTION_API_KEY não configurada');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init, headers: { 'Content-Type': 'application/json', apikey: this.apiKey, ...(init.headers || {}) },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new BadGatewayException({
        message: 'Evolution API indisponível',
        details: error instanceof Error ? error.message : String(error),
      });
    }
    const text = await response.text();
    const data = text ? this.tryJson(text) : {};
    if (!response.ok) throw new BadGatewayException({ message: 'Falha na Evolution API', status: response.status, details: data });
    return data as Record<string, any>;
  }

  private getInstance(auth: AuthContext, id: string) {
    const scope = permissionScope(auth, 'integrations', 'write');
    return this.db.whatsappInstance.findFirst({ where: { id, organizationId: auth.organizationId, archivedAt: null, ...(scope === 'ALL' ? {} : auth.teamId ? { teams: { some: { teamId: auth.teamId } } } : { id: '__none__' }) } }).then((instance) => {
      if (!instance) throw new NotFoundException('Instância não encontrada');
      return instance;
    });
  }

  private assertConversation(auth: AuthContext, id: string) {
    return this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.conversationScope(auth, 'write') },
    }).then((conversation) => {
      if (!conversation) throw new NotFoundException('Conversa não encontrada');
      return conversation;
    });
  }

  private assertConversationWithInstance(auth: AuthContext, id: string) {
    return this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.conversationScope(auth, 'write') },
      include: { instance: { select: { instanceKey: true } } },
    }).then((conversation) => {
      if (!conversation) throw new NotFoundException('Conversa não encontrada');
      return conversation;
    });
  }

  private async renderConversationTemplate(conversationId: string, contactId: string, template: string) {
    const keys = [...template.matchAll(/{{\s*([\w.]+)\s*}}/gi)]
      .map((match) => match[1].toLocaleLowerCase('pt-BR'));
    if (!keys.length) return template;

    const contactKeys = new Set(['nome', 'telefone', 'email', 'empresa', 'cargo']);
    const [contact, lastInboundMessage] = await Promise.all([
      keys.some((key) => contactKeys.has(key))
        ? this.db.contact.findUnique({
            where: { id: contactId },
            select: {
              name: true,
              phone: true,
              email: true,
              jobTitle: true,
              companies: {
                where: { isPrimary: true },
                select: { company: { select: { name: true } } },
                take: 1,
              },
            },
          })
        : null,
      keys.includes('mensagem')
        ? this.db.message.findFirst({
            where: { conversationId, direction: 'INBOUND', type: { not: 'reaction' } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { text: true },
          })
        : null,
    ]);

    return renderTemplateVariables(template, {
      ...contactTemplateVariables(contact || {}),
      mensagem: lastInboundMessage?.text || '',
    });
  }

  private conversationInstanceWhere(auth: AuthContext): Prisma.WhatsappInstanceWhereInput {
    const scope = permissionScope(auth, 'conversations', 'write');
    return {
      organizationId: auth.organizationId,
      archivedAt: null,
      status: 'CONNECTED',
      ...(scope === 'ALL' ? {} : auth.teamId ? { teams: { some: { teamId: auth.teamId } } } : { id: '__none__' }),
    };
  }

  private conversationScope(auth: AuthContext, action = 'read') {
    void action;
    return conversationVisibilityWhere(auth, auth.roleKey === 'admin');
  }

  private conversationEvent(auth: AuthContext, conversationId: string, type: string, text: string, metadata: object = {}) {
    return this.db.conversationEvent.create({ data: {
      organizationId: auth.organizationId,
      conversationId,
      actorId: auth.userId,
      type,
      text,
      metadata,
    } });
  }

  private async downloadProfilePicture(rawUrl: string) {
    const allowed = (value: string) => {
      const url = new URL(value);
      return url.protocol === 'https:' && (url.hostname === 'whatsapp.net' || url.hostname.endsWith('.whatsapp.net') || url.hostname === 'fbcdn.net' || url.hostname.endsWith('.fbcdn.net'));
    };
    if (!allowed(rawUrl)) return null;
    const response = await fetch(rawUrl, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    if (!response.ok || !allowed(response.url)) return null;
    const contentType = response.headers.get('content-type')?.split(';')[0] || '';
    if (!contentType.startsWith('image/')) return null;
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > 2 * 1024 * 1024) return null;
    return { body, contentType };
  }

  private cacheProfilePicture(key: string, picture: ProfilePictureCacheEntry['picture']) {
    this.removeProfilePictureCacheEntry(key);
    const sizeBytes = picture?.body.length || 0;
    while (this.profilePictureCache.size >= MAX_PROFILE_PICTURE_CACHE_ENTRIES
      || this.profilePictureCacheBytes + sizeBytes > MAX_PROFILE_PICTURE_CACHE_BYTES) {
      const oldest = this.profilePictureCache.keys().next().value;
      if (!oldest) break;
      this.removeProfilePictureCacheEntry(oldest);
    }
    this.profilePictureCache.set(key, { expiresAt: Date.now() + (picture ? 6 * 60 * 60_000 : 15 * 60_000), sizeBytes, picture });
    this.profilePictureCacheBytes += sizeBytes;
  }

  private removeProfilePictureCacheEntry(key: string) {
    const cached = this.profilePictureCache.get(key);
    if (!cached) return;
    this.profilePictureCache.delete(key);
    this.profilePictureCacheBytes = Math.max(0, this.profilePictureCacheBytes - cached.sizeBytes);
  }

  private async reconcileProviderInstanceStatuses<T extends {
    id: string;
    instanceKey: string;
    status: string;
    connectedAt: Date | null;
  }>(instances: T[]) {
    let providerInstances: Array<Record<string, any>>;
    try {
      const response = await this.request('/instance/fetchInstances', { method: 'GET' });
      providerInstances = Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn('[evolution:list-instances] Não foi possível atualizar os estados das conexões.', {
        error: this.errorMessage(error),
      });
      return instances;
    }

    const providerStatuses = new Map<string, EvolutionInstanceStatus>();
    for (const providerInstance of providerInstances) {
      const instanceKey = String(providerInstance.name || providerInstance.instanceName || '').trim();
      if (!instanceKey) continue;
      providerStatuses.set(
        instanceKey,
        normalizeEvolutionInstanceStatus(
          providerInstance.connectionStatus
          || providerInstance.state
          || providerInstance.instance?.state,
        ),
      );
    }

    const now = new Date();
    const updates: Array<Promise<unknown>> = [];
    const reconciled = instances.map((instance) => {
      const status = providerStatuses.get(instance.instanceKey) || 'DISCONNECTED';
      const connectedAt = status === 'CONNECTED' ? instance.connectedAt || now : null;
      if (status !== instance.status || connectedAt?.getTime() !== instance.connectedAt?.getTime()) {
        updates.push(this.db.whatsappInstance.update({
          where: { id: instance.id },
          data: { status, connectedAt },
        }));
      }
      return { ...instance, status, connectedAt };
    });
    await Promise.all(updates);
    return reconciled;
  }

  private extractQrCode(payload: Record<string, any>) {
    const candidate = [
      payload.base64,
      payload.qrcode?.base64,
      payload.qrcode,
    ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
    if (!candidate) return null;
    const value = candidate.trim();
    if (value.startsWith('data:image/')) return value;
    if (/^[a-z0-9+/=\r\n]+$/i.test(value) && value.length > 256) {
      return `data:image/png;base64,${value.replace(/\s/g, '')}`;
    }
    return null;
  }

  private errorMessage(error: unknown) {
    if (error instanceof BadGatewayException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object') return JSON.stringify(response).slice(0, 1000);
    }
    return error instanceof Error ? error.message : String(error);
  }

  private tryJson(text: string) { try { return JSON.parse(text); } catch { return { message: text }; } }

  private createProviderInstance(instanceKey: string) {
    const webhookUrl = `${process.env.API_INTERNAL_URL || 'http://api:3000'}/webhooks/evolution`;
    return this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: instanceKey,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          enabled: true,
          url: webhookUrl,
          events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_EDITED', 'MESSAGES_DELETE', 'SEND_MESSAGE'],
          headers: { 'x-prospecta-webhook-secret': process.env.EVOLUTION_WEBHOOK_SECRET || '' },
        },
      }),
    });
  }

  private isProviderNotFound(error: unknown) {
    if (!(error instanceof BadGatewayException)) return false;
    const response = error.getResponse();
    return typeof response === 'object' && response !== null && 'status' in response && response.status === 404;
  }

  private audit(auth: AuthContext, action: string, entityId: string, after: object) {
    return this.db.auditLog.create({ data: { organizationId: auth.organizationId, userId: auth.userId, action, entityType: 'WhatsappInstance', entityId, after } });
  }
}
