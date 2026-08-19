import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type AiGenerationType, type AiSummaryScope, type ConversationAiGeneration } from '@prisma/client';
import type { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthContext } from '../auth/types.js';
import { conversationVisibilityWhere } from '../integrations/conversation-visibility.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AI_GENERATION_QUEUE } from '../queue/queue.module.js';

const DEFAULT_FALLBACK = 'No momento não consegui continuar o atendimento automático. Vou encaminhar você para nossa equipe.';
const VALID_FIELDS = new Set(['name', 'email', 'jobTitle', 'company', 'qualificationNote']);

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hashKey(parts: Array<string | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => part || '-').join(':')).digest('hex');
}

function hasPermission(auth: AuthContext, resource: string, action: string) {
  return auth.permissions.some((permission) =>
    (permission.resource === '*' || permission.resource === resource)
    && (permission.action === '*' || permission.action === action));
}

function contactUpdates(fields: string[], changes: Record<string, unknown>) {
  const data: Prisma.ContactUpdateInput = {};
  if (fields.includes('name') && typeof changes.name === 'string') data.name = changes.name.trim();
  if (fields.includes('email') && typeof changes.email === 'string') data.email = changes.email.trim().toLowerCase();
  if (fields.includes('jobTitle') && typeof changes.jobTitle === 'string') data.jobTitle = changes.jobTitle.trim();
  return data;
}

function generationPriority(type: AiGenerationType) {
  const priorities: Record<AiGenerationType, number> = { CHATBOT_REPLY: 1, REPLY_SUGGESTION: 2, SUMMARY: 3, CONFIG_TEST: 4 };
  return priorities[type];
}

function assertProposalRequest(auth: AuthContext, input: { action: string; fields?: unknown }): asserts auth is AuthContext & { userId: string } {
  if (!auth.userId) throw new ForbiddenException('A operação exige um usuário');
  if (!['apply', 'dismiss'].includes(input.action)) throw new BadRequestException('Ação da proposta é inválida');
  if (input.fields !== undefined && !Array.isArray(input.fields)) throw new BadRequestException('Os campos da proposta são inválidos');
  if (!hasPermission(auth, 'contacts', 'write')) throw new ForbiddenException('Você não possui permissão para alterar contatos');
}

@Injectable()
export class AiService {
  constructor(private readonly db: PrismaService, @Inject(AI_GENERATION_QUEUE) private readonly queue: Queue) {}

  async getSettings(auth: AuthContext) {
    this.assertAdmin(auth);
    const settings = await this.db.organizationAiSettings.findUnique({ where: { organizationId: auth.organizationId } });
    const runtime = await this.runtimeStatus();
    return {
      enabled: settings?.enabled ?? false,
      globalInstructions: settings?.globalInstructions ?? '',
      fallbackMessage: settings?.fallbackMessage ?? DEFAULT_FALLBACK,
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      runtime,
    };
  }

  async updateSettings(auth: AuthContext, input: { enabled?: boolean; globalInstructions?: string; fallbackMessage?: string }) {
    this.assertAdmin(auth);
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new BadRequestException('O estado da IA deve ser verdadeiro ou falso');
    if (input.fallbackMessage !== undefined && typeof input.fallbackMessage !== 'string') throw new BadRequestException('A mensagem de indisponibilidade é inválida');
    if (input.globalInstructions !== undefined && typeof input.globalInstructions !== 'string') throw new BadRequestException('As instruções gerais são inválidas');
    const fallbackMessage = input.fallbackMessage?.trim();
    if (fallbackMessage !== undefined && (fallbackMessage.length < 5 || fallbackMessage.length > 1_000)) {
      throw new BadRequestException('A mensagem de indisponibilidade deve ter entre 5 e 1.000 caracteres');
    }
    const globalInstructions = input.globalInstructions?.trim();
    if (globalInstructions && globalInstructions.length > 10_000) throw new BadRequestException('As instruções podem ter no máximo 10.000 caracteres');
    return this.db.organizationAiSettings.upsert({
      where: { organizationId: auth.organizationId },
      create: {
        organizationId: auth.organizationId,
        enabled: input.enabled ?? false,
        globalInstructions: globalInstructions || '',
        fallbackMessage: fallbackMessage || DEFAULT_FALLBACK,
        updatedById: auth.userId,
      },
      update: {
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(globalInstructions === undefined ? {} : { globalInstructions }),
        ...(fallbackMessage === undefined ? {} : { fallbackMessage }),
        updatedById: auth.userId,
      },
    });
  }

  async test(auth: AuthContext, message?: string) {
    this.assertAdmin(auth);
    this.assertFeatureEnabled();
    await this.assertOrganizationEnabled(auth.organizationId);
    if (message !== undefined && (typeof message !== 'string' || message.length > 2_000)) throw new BadRequestException('A mensagem de teste é inválida');
    const generation = await this.db.conversationAiGeneration.create({
      data: {
        organizationId: auth.organizationId,
        requestedById: auth.userId,
        type: 'CONFIG_TEST',
        deduplicationKey: `config-test:${auth.organizationId}:${randomUUID()}`,
        input: { message: message?.trim() || 'Responda em português: o serviço de IA da OpenAI está funcionando.' },
      },
    });
    await this.enqueue(generation.id, 'CONFIG_TEST', generation.updatedAt);
    return generation;
  }

  async getTest(auth: AuthContext, generationId: string) {
    this.assertAdmin(auth);
    const generation = await this.db.conversationAiGeneration.findFirst({
      where: { id: generationId, organizationId: auth.organizationId, type: 'CONFIG_TEST' },
    });
    if (!generation) throw new NotFoundException('Teste de IA não encontrado');
    return generation;
  }

  async createGeneration(
    auth: AuthContext,
    conversationId: string,
    input: { type: 'SUMMARY' | 'REPLY_SUGGESTION'; scope?: 'CURRENT_ATTENDANCE' | 'FULL_CONVERSATION' },
  ) {
    this.assertFeatureEnabled();
    await this.assertOrganizationEnabled(auth.organizationId);
    if (!['SUMMARY', 'REPLY_SUGGESTION'].includes(input.type)) throw new BadRequestException('Tipo de geração não suportado');
    if (input.scope !== undefined && !['CURRENT_ATTENDANCE', 'FULL_CONVERSATION'].includes(input.scope)) {
      throw new BadRequestException('Escopo de resumo não suportado');
    }
    const conversation = await this.visibleConversation(auth, conversationId);
    const scope: AiSummaryScope | null = input.type === 'SUMMARY' ? (input.scope || 'CURRENT_ATTENDANCE') : null;
    const boundary = scope === 'CURRENT_ATTENDANCE' ? await this.currentAttendanceStart(conversationId) : null;
    const messageWhere = { conversationId, ...(boundary ? { createdAt: { gte: boundary } } : {}) };
    const [first, last] = await Promise.all([
      this.db.message.findFirst({ where: messageWhere, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }),
      this.db.message.findFirst({ where: messageWhere, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } }),
    ]);
    if (!last) throw new BadRequestException('A conversa ainda não possui mensagens para analisar');
    const key = hashKey([input.type, conversationId, scope, first?.id, last.id, conversation.assigneeId]);
    let generation = await this.db.conversationAiGeneration.upsert({
      where: { deduplicationKey: key },
      create: {
        organizationId: auth.organizationId,
        conversationId,
        requestedById: auth.userId,
        type: input.type,
        scope,
        deduplicationKey: key,
        sourceFirstMessageId: first?.id,
        sourceLastMessageId: last.id,
        input: boundary ? { attendanceStartedAt: boundary.toISOString(), assigneeId: conversation.assigneeId } : { assigneeId: conversation.assigneeId },
      },
      update: {},
    });
    generation = await this.retryFailedGeneration(generation, auth.userId);
    if (['PENDING', 'WAITING_INPUT'].includes(generation.status)) {
      await this.enqueue(generation.id, generation.type, generation.updatedAt);
    }
    return generation;
  }

  async getGeneration(auth: AuthContext, conversationId: string, generationId: string) {
    await this.visibleConversation(auth, conversationId);
    const generation = await this.db.conversationAiGeneration.findFirst({ where: { id: generationId, conversationId, organizationId: auth.organizationId } });
    if (!generation) throw new NotFoundException('Geração de IA não encontrada');
    return generation;
  }

  async latestSummary(auth: AuthContext, conversationId: string) {
    await this.visibleConversation(auth, conversationId);
    return this.db.conversationAiGeneration.findFirst({
      where: { conversationId, organizationId: auth.organizationId, type: 'SUMMARY', status: { in: ['COMPLETED', 'STALE'] } },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listProposals(auth: AuthContext, conversationId: string) {
    await this.visibleConversation(auth, conversationId);
    return this.db.conversationAiProposal.findMany({
      where: { conversationId, organizationId: auth.organizationId, status: { in: ['PENDING', 'PARTIALLY_APPLIED'] } },
      include: { generation: { select: { id: true, createdAt: true, model: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateProposal(
    auth: AuthContext,
    conversationId: string,
    proposalId: string,
    input: { action: 'apply' | 'dismiss'; fields?: string[]; companyId?: string },
  ) {
    assertProposalRequest(auth, input);
    await this.visibleConversation(auth, conversationId);
    const proposal = await this.db.conversationAiProposal.findFirst({
      where: { id: proposalId, conversationId, organizationId: auth.organizationId },
      include: { contact: true },
    });
    if (!proposal) throw new NotFoundException('Sugestão de IA não encontrada');
    if (input.action === 'dismiss') {
      return this.db.conversationAiProposal.update({ where: { id: proposal.id }, data: { status: 'DISMISSED', appliedById: auth.userId, appliedAt: new Date() } });
    }
    const fields = [...new Set(input.fields || [])].filter((field) => VALID_FIELDS.has(field));
    if (!fields.length) throw new BadRequestException('Selecione ao menos uma sugestão para aplicar');
    const changes = jsonObject(proposal.changes);
    const contactData = contactUpdates(fields, changes);
    const transaction: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.keys(contactData).length) transaction.push(this.db.contact.update({ where: { id: proposal.contactId }, data: contactData }));
    if (fields.includes('company')) {
      const company = await this.resolveCompany(auth.organizationId, input.companyId, changes.companyName);
      if (!company) throw new BadRequestException('Selecione uma empresa existente para aplicar esta sugestão');
      transaction.push(
        this.db.contactCompany.upsert({ where: { contactId_companyId: { contactId: proposal.contactId, companyId: company.id } }, create: { contactId: proposal.contactId, companyId: company.id, isPrimary: true }, update: { isPrimary: true } }),
        this.db.contact.update({ where: { id: proposal.contactId }, data: { primaryCompanyId: company.id } }),
      );
    }
    if (fields.includes('qualificationNote') && typeof changes.qualificationNote === 'string' && changes.qualificationNote.trim()) {
      transaction.push(this.db.note.create({ data: { authorId: auth.userId, contactId: proposal.contactId, body: `Qualificação sugerida pela IA:\n${changes.qualificationNote.trim()}` } }));
    }
    const previousApplied = Array.isArray(proposal.appliedFields) ? proposal.appliedFields.filter((item): item is string => typeof item === 'string') : [];
    const appliedFields = [...new Set([...previousApplied, ...fields])];
    const proposedFields = Object.keys(changes).filter((field) => Boolean(changes[field])).map((field) => field === 'companyName' ? 'company' : field);
    const status = appliedFields.length >= proposedFields.length ? 'APPLIED' : 'PARTIALLY_APPLIED';
    transaction.push(this.db.conversationAiProposal.update({
      where: { id: proposal.id },
      data: { status, appliedFields, appliedById: auth.userId, appliedAt: new Date() },
    }));
    await this.db.$transaction(transaction);
    return this.db.conversationAiProposal.findUnique({ where: { id: proposal.id } });
  }

  private assertAdmin(auth: AuthContext) {
    if (auth.roleKey !== 'admin') throw new ForbiddenException('A configuração de IA é restrita a administradores');
  }

  private assertFeatureEnabled() {
    if (process.env.AI_ASSISTANT_ENABLED !== 'true') throw new ServiceUnavailableException('O assistente de IA está desativado neste ambiente');
    if (!process.env.OPENAI_API_KEY?.trim()) throw new ServiceUnavailableException('Configure OPENAI_API_KEY antes de usar o assistente');
  }

  private async assertOrganizationEnabled(organizationId: string) {
    const settings = await this.db.organizationAiSettings.findUnique({ where: { organizationId }, select: { enabled: true } });
    if (!settings?.enabled) throw new ServiceUnavailableException('Ative a IA nas configurações antes de usar o assistente');
  }

  private async visibleConversation(auth: AuthContext, id: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id, organizationId: auth.organizationId, ...conversationVisibilityWhere(auth, auth.roleKey === 'admin') },
      select: { id: true, assigneeId: true, status: true, contactId: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  private currentAttendanceStart(conversationId: string) {
    return this.db.conversationEvent.findFirst({
      where: { conversationId, type: { in: ['started', 'reopened'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    }).then((event) => event?.createdAt || null);
  }

  private async exactCompany(organizationId: string, name: string) {
    const matches = await this.db.company.findMany({
      where: { organizationId, archivedAt: null, name: { equals: name.trim(), mode: 'insensitive' } },
      take: 2,
    });
    return matches.length === 1 ? matches[0] : null;
  }

  private resolveCompany(organizationId: string, companyId: string | undefined, proposedName: unknown) {
    if (companyId) return this.db.company.findFirst({ where: { id: companyId, organizationId, archivedAt: null } });
    if (typeof proposedName === 'string') return this.exactCompany(organizationId, proposedName);
    return null;
  }

  private async retryFailedGeneration(generation: ConversationAiGeneration, requestedById?: string) {
    if (generation.status !== 'FAILED') return generation;
    await this.db.conversationAiGeneration.updateMany({
      where: { id: generation.id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        requestedById,
        result: Prisma.DbNull,
        error: null,
        progress: 0,
        model: null,
        promptEvalCount: null,
        evalCount: null,
        totalDurationMs: null,
        completedAt: null,
      },
    });
    return this.db.conversationAiGeneration.findUniqueOrThrow({ where: { id: generation.id } });
  }

  private async enqueue(generationId: string, type: AiGenerationType, updatedAt: Date) {
    const priority = generationPriority(type);
    await this.queue.add('generate', { generationId }, {
      jobId: `ai-${generationId}-${updatedAt.getTime()}`,
      priority,
      attempts: 1,
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  private async runtimeStatus() {
    if (process.env.AI_ASSISTANT_ENABLED !== 'true') return { available: false, reason: 'disabled', provider: 'openai' as const };
    if (!process.env.OPENAI_API_KEY?.trim()) return { available: false, reason: 'not_configured', provider: 'openai' as const };
    return { available: true, provider: 'openai' as const };
  }
}
