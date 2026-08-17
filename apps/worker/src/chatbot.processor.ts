import { randomUUID } from 'node:crypto';
import type { Job, Queue } from 'bullmq';
import { Prisma, type PrismaClient } from '@prisma/client';
import { RulesResponseProvider, type ChatbotResponseProvider, type ChatbotRuleContext } from './chatbot-response-provider.js';

type Node = { id: string; type: string; data?: Record<string, unknown> };
type Edge = { source: string; target: string; sourceHandle?: string | null };
type Graph = { nodes: Node[]; edges: Edge[] };
type SessionContext = ChatbotRuleContext & { previousMessage?: string };
type NodeExecution = { nextNodeId: string | null; shouldStop: boolean };
type ChatbotInboundJob = { messageId: string };
type ChatbotDelayJob = { sessionId: string; nodeId: string; inboundMessageId: string; wakeAt: string };
type ChatbotJob = ChatbotInboundJob | ChatbotDelayJob;

const MAX_WAIT_SECONDS = 31_536_000;

export class ChatbotProcessor {
  private readonly providers: Map<string, ChatbotResponseProvider>;

  constructor(
    private readonly db: PrismaClient,
    private readonly chatbotQueue: Queue,
    private readonly outboundQueue: Queue,
    providers: ChatbotResponseProvider[] = [new RulesResponseProvider()],
  ) {
    this.providers = new Map(providers.map((provider) => [provider.key, provider]));
  }

  async process(job: Job<ChatbotJob>) {
    if ('sessionId' in job.data) return this.resumeDelay(job.data);
    return this.processInbound(job.data.messageId);
  }

  async reconcileDelays(reference = new Date()) {
    const horizon = new Date(reference.getTime() + 24 * 60 * 60_000);
    const sessions = await this.db.chatbotSession.findMany({
      where: {
        status: 'WAITING',
        wakeAt: { not: null, lte: horizon },
        currentNodeId: { not: null },
        lastInboundMessageId: { not: null },
        chatbot: { status: 'PUBLISHED' },
      },
      select: { id: true, currentNodeId: true, lastInboundMessageId: true, wakeAt: true },
      orderBy: { wakeAt: 'asc' },
      take: 1_000,
    });
    await Promise.all(sessions.map((session) => this.enqueueDelay({
      sessionId: session.id,
      nodeId: session.currentNodeId!,
      inboundMessageId: session.lastInboundMessageId!,
      wakeAt: session.wakeAt!,
    })));
    return { scheduled: sessions.length };
  }

  private async processInbound(messageId: string) {
    const inbound = await this.db.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        direction: true,
        text: true,
        conversation: {
          select: {
            id: true,
            organizationId: true,
            instanceId: true,
            assigneeId: true,
            status: true,
            contact: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                jobTitle: true,
                consentStatus: true,
                companies: {
                  where: { isPrimary: true },
                  select: { company: { select: { name: true } } },
                  take: 1,
                },
              },
            },
            chatbotSession: true,
          },
        },
      },
    });
    if (inbound?.direction !== 'INBOUND') return;
    const conversation = inbound.conversation;
    if (conversation.assigneeId || conversation.status === 'CLOSED' || conversation.contact.consentStatus === 'REVOKED') return;

    const chatbot = await this.db.chatbot.findFirst({
      where: { instanceId: conversation.instanceId, organizationId: conversation.organizationId, status: 'PUBLISHED', publishedVersion: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, publishedVersion: true, responseProvider: true },
    });
    if (!chatbot?.publishedVersion) return;
    const version = await this.db.chatbotVersion.findUnique({
      where: { chatbotId_version: { chatbotId: chatbot.id, version: chatbot.publishedVersion } },
      select: { id: true, graph: true },
    });
    if (!version) return;
    const provider = this.providers.get(chatbot.responseProvider);
    if (!provider) return;
    const graph = version.graph as unknown as Graph;
    const trigger = graph.nodes.find((node) => node.type === 'trigger');
    if (!trigger) return;

    const oldContext = (conversation.chatbotSession?.context || {}) as Partial<SessionContext>;
    const context: SessionContext = {
      lastMessage: inbound.text || '',
      previousMessage: oldContext.lastMessage,
      contactName: conversation.contact.name,
      contactPhone: conversation.contact.phone,
      contactEmail: conversation.contact.email,
      contactJobTitle: conversation.contact.jobTitle,
      contactCompany: conversation.contact.companies[0]?.company.name,
      conversationId: conversation.id,
    };
    const session = await this.prepareSession({
      existing: conversation.chatbotSession,
      chatbotId: chatbot.id,
      versionId: version.id,
      conversationId: conversation.id,
      inboundMessageId: inbound.id,
      context,
      graph,
      trigger,
      provider,
    });
    if (!session) return;

    try {
      await this.run(graph, session, conversation.contact.id, inbound.id, context, provider);
      return { organizationId: conversation.organizationId, event: 'inbox.updated', payload: { conversationId: conversation.id } };
    } catch (error) {
      await this.fail(session.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async resumeDelay(data: ChatbotDelayJob) {
    const session = await this.db.chatbotSession.findUnique({
      where: { id: data.sessionId },
      include: {
        chatbot: { select: { status: true, responseProvider: true } },
        version: { select: { graph: true } },
        conversation: { select: { id: true, organizationId: true, contactId: true, assigneeId: true, status: true } },
      },
    });
    const expectedWakeAt = new Date(data.wakeAt);
    if (!session
      || session.status !== 'WAITING'
      || session.currentNodeId !== data.nodeId
      || !session.wakeAt
      || session.wakeAt.getTime() !== expectedWakeAt.getTime()) return;
    if (session.chatbot.status !== 'PUBLISHED'
      || session.conversation.assigneeId
      || session.conversation.status === 'CLOSED') {
      await this.db.chatbotSession.update({
        where: { id: session.id },
        data: { status: 'STOPPED', wakeAt: null, stopReason: 'Chatbot interrompido durante a espera', completedAt: new Date() },
      });
      return;
    }
    if (session.wakeAt.getTime() > Date.now()) {
      return;
    }

    const graph = session.version.graph as unknown as Graph;
    const nextNodeId = this.next(graph, data.nodeId)?.target || null;
    if (!nextNodeId) {
      await this.complete(session.id, session.conversation.id, 'Fluxo finalizado após a espera');
      return;
    }
    const claimed = await this.db.chatbotSession.updateMany({
      where: { id: session.id, status: 'WAITING', currentNodeId: data.nodeId, wakeAt: expectedWakeAt },
      data: { status: 'ACTIVE', currentNodeId: nextNodeId, wakeAt: null },
    });
    if (!claimed.count) return;
    await this.db.chatbotStepExecution.updateMany({
      where: { sessionId: session.id, nodeId: data.nodeId, inboundMessageId: data.inboundMessageId, status: 'waiting' },
      data: { status: 'completed', completedAt: new Date(), output: { wakeAt: data.wakeAt, nextNodeId } },
    });
    const provider = this.providers.get(session.chatbot.responseProvider);
    if (!provider) return this.fail(session.id, 'Provedor de respostas do chatbot não encontrado');
    try {
      await this.run(
        graph,
        { id: session.id, conversationId: session.conversation.id, currentNodeId: nextNodeId },
        session.conversation.contactId,
        data.inboundMessageId,
        session.context as unknown as SessionContext,
        provider,
      );
    } catch (error) {
      await this.fail(session.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
    return {
      organizationId: session.conversation.organizationId,
      event: 'inbox.updated' as const,
      payload: { conversationId: session.conversation.id },
    };
  }

  private async prepareSession(input: {
    existing: any;
    chatbotId: string;
    versionId: string;
    conversationId: string;
    inboundMessageId: string;
    context: SessionContext;
    graph: Graph;
    trigger: Node;
    provider: ChatbotResponseProvider;
  }) {
    const session = input.existing;
    if (session?.lastInboundMessageId === input.inboundMessageId) return null;
    if (session?.status && ['HANDED_OFF', 'STOPPED'].includes(session.status)) return null;
    if (session?.status === 'WAITING' && session.wakeAt) return null;
    const startsNew = session?.chatbotId !== input.chatbotId
      || session?.versionId !== input.versionId
      || ['COMPLETED', 'FAILED'].includes(session?.status);
    if (startsNew) return this.startSession(input);
    return this.resumeSession(session, input);
  }

  private startSession(input: {
    chatbotId: string;
    versionId: string;
    conversationId: string;
    inboundMessageId: string;
    context: SessionContext;
    trigger: Node;
    provider: ChatbotResponseProvider;
  }) {
    if (!input.provider.matches(input.trigger.data || {}, input.context)) return null;
    return this.db.chatbotSession.upsert({
      where: { conversationId: input.conversationId },
      create: { chatbotId: input.chatbotId, versionId: input.versionId, conversationId: input.conversationId, currentNodeId: input.trigger.id, lastInboundMessageId: input.inboundMessageId, context: input.context as unknown as Prisma.InputJsonValue },
      update: { chatbotId: input.chatbotId, versionId: input.versionId, status: 'ACTIVE', currentNodeId: input.trigger.id, lastInboundMessageId: input.inboundMessageId, context: input.context as unknown as Prisma.InputJsonValue, wakeAt: null, stopReason: null, startedAt: new Date(), completedAt: null },
    });
  }

  private async resumeSession(session: any, input: {
    conversationId: string;
    inboundMessageId: string;
    context: SessionContext;
    graph: Graph;
    trigger: Node;
  }) {
    const waitingNode = session.currentNodeId
      ? input.graph.nodes.find((node) => node.id === session.currentNodeId)
      : undefined;
    let nextNodeId = session.currentNodeId || input.trigger.id;
    if (session.status === 'WAITING') {
      if (waitingNode?.type !== 'question') {
        await this.fail(session.id, 'O bloco aguardando resposta não é uma pergunta');
        return null;
      }
      nextNodeId = this.next(input.graph, waitingNode.id)?.target || '';
    }
    if (!nextNodeId) {
      await this.complete(session.id, input.conversationId, 'Fluxo finalizado após a resposta');
      return null;
    }
    return this.db.chatbotSession.update({
      where: { id: session.id },
      data: { status: 'ACTIVE', currentNodeId: nextNodeId, lastInboundMessageId: input.inboundMessageId, context: input.context as unknown as Prisma.InputJsonValue, wakeAt: null },
    });
  }

  private async run(graph: Graph, session: { id: string; conversationId: string; currentNodeId: string | null }, contactId: string, inboundMessageId: string, context: SessionContext, provider: ChatbotResponseProvider) {
    let currentId = session.currentNodeId;
    for (let step = 0; currentId && step < 100; step += 1) {
      const node = graph.nodes.find((item) => item.id === currentId);
      if (!node) throw new Error('Bloco atual do chatbot não encontrado');
      const execution = await this.executeNode(graph, session, node, contactId, inboundMessageId, context, provider);
      if (execution.shouldStop) return;
      currentId = execution.nextNodeId;
    }
    if (currentId) throw new Error('Limite de blocos excedido');
    await this.complete(session.id, session.conversationId, 'Fluxo finalizado');
  }

  private async executeNode(
    graph: Graph,
    session: { id: string; conversationId: string },
    node: Node,
    contactId: string,
    inboundMessageId: string,
    context: SessionContext,
    provider: ChatbotResponseProvider,
  ): Promise<NodeExecution> {
    switch (node.type) {
      case 'message':
        await this.sendReply(session.id, session.conversationId, node, inboundMessageId, provider.interpolate(textValue(node.data?.text), context));
        return this.moveSessionToNextNode(graph, session.id, node.id);
      case 'question':
        await this.sendReply(session.id, session.conversationId, node, inboundMessageId, provider.interpolate(textValue(node.data?.text), context));
        await this.db.chatbotSession.update({ where: { id: session.id }, data: { status: 'WAITING', currentNodeId: node.id, wakeAt: null } });
        return { nextNodeId: node.id, shouldStop: true };
      case 'wait':
        return this.scheduleWait(graph, session, node, inboundMessageId);
      case 'condition': {
        const handle = provider.matches(node.data || {}, context) ? 'true' : 'false';
        await this.record(session.id, node.id, inboundMessageId, context, { handle });
        return this.moveSessionToNextNode(graph, session.id, node.id, handle);
      }
      case 'add_tag': {
        const tagId = textValue(node.data?.tagId);
        if (tagId) {
          await this.db.contactTag.upsert({ where: { contactId_tagId: { contactId, tagId } }, update: {}, create: { contactId, tagId } });
        }
        await this.record(session.id, node.id, inboundMessageId, context, { tagId });
        return this.moveSessionToNextNode(graph, session.id, node.id);
      }
      case 'handoff':
        await this.record(session.id, node.id, inboundMessageId, context, { status: 'HANDED_OFF' });
        await this.handoff(session.id, session.conversationId);
        return { nextNodeId: null, shouldStop: true };
      case 'close':
        await this.record(session.id, node.id, inboundMessageId, context, { status: 'COMPLETED' });
        await this.complete(session.id, session.conversationId, 'Conversa encerrada pelo chatbot', true);
        return { nextNodeId: null, shouldStop: true };
      case 'end':
        await this.record(session.id, node.id, inboundMessageId, context, { status: 'COMPLETED' });
        await this.complete(session.id, session.conversationId, 'Fluxo finalizado');
        return { nextNodeId: null, shouldStop: true };
      default:
        await this.record(session.id, node.id, inboundMessageId, context, {});
        return this.moveSessionToNextNode(graph, session.id, node.id);
    }
  }

  private async moveSessionToNextNode(graph: Graph, sessionId: string, nodeId: string, sourceHandle?: string): Promise<NodeExecution> {
    const nextNodeId = this.next(graph, nodeId, sourceHandle)?.target || null;
    if (nextNodeId) {
      await this.db.chatbotSession.update({ where: { id: sessionId }, data: { currentNodeId: nextNodeId } });
    }
    return { nextNodeId, shouldStop: false };
  }

  private async scheduleWait(
    graph: Graph,
    session: { id: string; conversationId: string },
    node: Node,
    inboundMessageId: string,
  ): Promise<NodeExecution> {
    const nextNodeId = this.next(graph, node.id)?.target || null;
    if (!nextNodeId) return { nextNodeId: null, shouldStop: false };
    const seconds = chatbotWaitSeconds(node.data);
    const wakeAt = new Date(Date.now() + seconds * 1_000);
    const unique = { sessionId_nodeId_inboundMessageId: { sessionId: session.id, nodeId: node.id, inboundMessageId } };
    await this.db.$transaction([
      this.db.chatbotSession.update({
        where: { id: session.id },
        data: { status: 'WAITING', currentNodeId: node.id, wakeAt },
      }),
      this.db.chatbotStepExecution.upsert({
        where: unique,
        create: {
          sessionId: session.id,
          nodeId: node.id,
          inboundMessageId,
          status: 'waiting',
          input: { seconds },
          output: { wakeAt: wakeAt.toISOString(), nextNodeId },
        },
        update: {
          status: 'waiting',
          input: { seconds },
          output: { wakeAt: wakeAt.toISOString(), nextNodeId },
          error: null,
          completedAt: null,
        },
      }),
    ]);
    try {
      await this.enqueueDelay({ sessionId: session.id, nodeId: node.id, inboundMessageId, wakeAt });
    } catch (error) {
      console.error(`[chatbot:${session.id}] A espera será recuperada pelo reconciliador.`, error);
    }
    return { nextNodeId: node.id, shouldStop: true };
  }

  private enqueueDelay(input: { sessionId: string; nodeId: string; inboundMessageId: string; wakeAt: Date }) {
    return this.chatbotQueue.add('resume-chatbot-delay', {
      sessionId: input.sessionId,
      nodeId: input.nodeId,
      inboundMessageId: input.inboundMessageId,
      wakeAt: input.wakeAt.toISOString(),
    }, {
      jobId: `chatbot-delay-${input.sessionId}-${input.nodeId}-${input.inboundMessageId}-${input.wakeAt.getTime()}`,
      delay: Math.max(0, input.wakeAt.getTime() - Date.now()),
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  private async sendReply(sessionId: string, conversationId: string, node: Node, inboundMessageId: string, text: string) {
    const unique = { sessionId_nodeId_inboundMessageId: { sessionId, nodeId: node.id, inboundMessageId } };
    const executed = await this.db.chatbotStepExecution.findUnique({ where: unique });
    if (executed?.status === 'completed') return;
    const conversation = await this.db.conversation.findUnique({ where: { id: conversationId }, select: { instanceId: true, assigneeId: true, status: true } });
    if (!conversation || conversation.assigneeId || conversation.status === 'CLOSED') throw new Error('Chatbot interrompido porque o atendimento não está mais disponível');
    const messageId = randomUUID();
    await this.db.$transaction([
      this.db.message.create({ data: {
        id: messageId,
        instanceId: conversation.instanceId,
        conversationId,
        providerMessageId: `chatbot:${sessionId}:${node.id}:${inboundMessageId}`,
        direction: 'OUTBOUND',
        type: 'text',
        text: text.slice(0, 4096),
        status: 'QUEUED',
        payload: { chatbotSessionId: sessionId, nodeId: node.id, automated: true },
      } }),
      this.db.chatbotStepExecution.upsert({
        where: unique,
        create: { sessionId, nodeId: node.id, inboundMessageId, status: 'completed', input: {}, output: { messageId, text }, completedAt: new Date() },
        update: { status: 'completed', output: { messageId, text }, error: null, completedAt: new Date() },
      }),
    ]);
    await this.outboundQueue.add('send-message', { messageId }, { jobId: `message-${messageId}`, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 });
  }

  private record(sessionId: string, nodeId: string, inboundMessageId: string, input: object, output: object) {
    return this.db.chatbotStepExecution.upsert({
      where: { sessionId_nodeId_inboundMessageId: { sessionId, nodeId, inboundMessageId } },
      create: { sessionId, nodeId, inboundMessageId, status: 'completed', input: input as Prisma.InputJsonValue, output: output as Prisma.InputJsonValue, completedAt: new Date() },
      update: { status: 'completed', output: output as Prisma.InputJsonValue, error: null, completedAt: new Date() },
    });
  }

  private async handoff(sessionId: string, conversationId: string) {
    const conversation = await this.db.conversation.findUnique({ where: { id: conversationId }, include: { contact: true } });
    if (!conversation) return;
    await this.db.$transaction([
      this.db.chatbotSession.update({ where: { id: sessionId }, data: { status: 'HANDED_OFF', wakeAt: null, stopReason: 'Transferido para atendimento humano', completedAt: new Date() } }),
      this.db.conversation.update({ where: { id: conversationId }, data: { status: 'WAITING', assigneeId: null, closedAt: null } }),
      this.db.conversationEvent.create({ data: {
        organizationId: conversation.organizationId,
        conversationId,
        type: 'chatbot_handoff',
        text: 'Chatbot transferiu o atendimento para a fila de espera',
      } }),
    ]);
    const userTargets = conversation.contact.teamId ? [{ teamId: conversation.contact.teamId }, { role: { key: 'admin' } }] : [{ role: { key: 'admin' } }];
    const users = await this.db.user.findMany({
      where: { organizationId: conversation.organizationId, status: 'ACTIVE', OR: userTargets },
      select: { id: true },
    });
    if (users.length) await this.db.notification.createMany({ data: users.map((user) => ({
      organizationId: conversation.organizationId,
      userId: user.id,
      type: 'chatbot.handoff',
      title: `Chatbot transferiu ${conversation.contact.name}`,
      body: 'A conversa está aguardando um atendente.',
      actionUrl: `/inbox/${conversationId}`,
    })) });
  }

  private async complete(sessionId: string, conversationId: string, reason: string, closeConversation = false) {
    const conversation = closeConversation
      ? await this.db.conversation.findUnique({ where: { id: conversationId }, select: { organizationId: true, status: true } })
      : null;
    await this.db.$transaction([
      this.db.chatbotSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED', wakeAt: null, stopReason: reason, completedAt: new Date() } }),
      this.db.conversation.update({ where: { id: conversationId }, data: closeConversation ? { status: 'CLOSED', closedAt: new Date() } : { status: 'WAITING', closedAt: null } }),
      ...(closeConversation && conversation?.status !== 'CLOSED' ? [this.db.conversationEvent.create({ data: {
        organizationId: conversation!.organizationId,
        conversationId,
        type: 'chatbot_closed',
        text: 'Chatbot finalizou o atendimento',
      } })] : []),
    ]);
  }

  private fail(sessionId: string, reason: string) {
    return this.db.chatbotSession.update({ where: { id: sessionId }, data: { status: 'FAILED', wakeAt: null, stopReason: reason, completedAt: new Date() } });
  }

  private next(graph: Graph, source: string, sourceHandle?: string) {
    return graph.edges.find((edge) => edge.source === source && (sourceHandle ? edge.sourceHandle === sourceHandle : !edge.sourceHandle));
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function chatbotWaitSeconds(data?: Record<string, unknown>) {
  const seconds = Number(data?.seconds);
  if (!Number.isFinite(seconds)) return 1;
  return Math.min(MAX_WAIT_SECONDS, Math.max(1, Math.trunc(seconds)));
}
