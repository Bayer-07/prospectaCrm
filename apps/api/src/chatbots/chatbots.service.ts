import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { chatbotNodeTypes } from '@prospecta/contracts';
import { authTeamIds, permissionScope } from '../auth/data-scope.js';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ChatbotNode = { id: string; type: string; data?: Record<string, unknown>; position?: { x: number; y: number } };
export type ChatbotEdge = { id?: string; source: string; target: string; sourceHandle?: string | null };
export type ChatbotGraph = { nodes: ChatbotNode[]; edges: ChatbotEdge[] };

function primitiveText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function nodeLabel(node: ChatbotNode) {
  return primitiveText(node.data?.label).trim() || node.id;
}

function instanceTeamFilter(auth: AuthContext, scope: string) {
  if (scope === 'ALL') return {};
  const teamIds = authTeamIds(auth);
  return teamIds.length ? { teams: { some: { teamId: { in: teamIds } } } } : { id: '__none__' };
}

function validateNodeText(node: ChatbotNode) {
  if (node.type === 'assign_queue' && !primitiveText(node.data?.teamId).trim()) {
    throw new BadRequestException(`Selecione a fila no bloco ${nodeLabel(node)}`);
  }
  if (['message', 'question'].includes(node.type) && !primitiveText(node.data?.text).trim()) {
    throw new BadRequestException(`Preencha o texto do bloco ${nodeLabel(node)}`);
  }
  if (node.type === 'wait') {
    const seconds = Number(node.data?.seconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 31_536_000) {
      throw new BadRequestException(`Informe um tempo de espera válido no bloco ${nodeLabel(node)}`);
    }
  }
  if (node.type === 'ai_conversation') {
    const objective = primitiveText(node.data?.objective).trim();
    const instructions = primitiveText(node.data?.instructions).trim();
    const transferCriteria = primitiveText(node.data?.transferCriteria).trim();
    const fallbackMessage = primitiveText(node.data?.fallbackMessage).trim();
    const maxInteractions = Number(node.data?.maxInteractions);
    const minimumConfidence = Number(node.data?.minimumConfidence);
    if (!objective) throw new BadRequestException(`Preencha o objetivo do bloco ${nodeLabel(node)}`);
    if (objective.length > 2_000 || instructions.length > 5_000 || transferCriteria.length > 3_000 || fallbackMessage.length > 1_000) {
      throw new BadRequestException(`As instruções do bloco ${nodeLabel(node)} ultrapassam o limite permitido`);
    }
    if (!Number.isInteger(maxInteractions) || maxInteractions < 1 || maxInteractions > 20) {
      throw new BadRequestException(`O limite de interações do bloco ${nodeLabel(node)} deve ficar entre 1 e 20`);
    }
    if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 100) {
      throw new BadRequestException(`A confiança do bloco ${nodeLabel(node)} deve ficar entre 0% e 100%`);
    }
  }
}

function validateOutgoingConnections(node: ChatbotNode, outgoing: ChatbotEdge[]) {
  if (node.type === 'condition') {
    if (!primitiveText(node.data?.value).trim()) {
      throw new BadRequestException(`Preencha a regra do bloco ${nodeLabel(node)}`);
    }
    const handles = new Set(outgoing.map((edge) => edge.sourceHandle));
    if (!handles.has('true') || !handles.has('false')) {
      throw new BadRequestException('Toda condição precisa das saídas “Sim” e “Não”');
    }
    return;
  }
  if (['handoff', 'close', 'end'].includes(node.type)) {
    if (outgoing.length) throw new BadRequestException('Blocos finais não podem possuir saída');
    return;
  }
  if (outgoing.length !== 1) {
    throw new BadRequestException(`O bloco ${nodeLabel(node)} precisa ter uma saída`);
  }
}

function validateNodeConnections(graph: ChatbotGraph) {
  for (const node of graph.nodes) {
    validateNodeText(node);
    validateOutgoingConnections(node, graph.edges.filter((edge) => edge.source === node.id));
  }
}

function graphAdjacency(graph: ChatbotGraph, ids: Set<string>) {
  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)!.push(edge.target);
  return adjacency;
}

function assertAllNodesReachable(triggerId: string, ids: Set<string>, adjacency: Map<string, string[]>) {
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    adjacency.get(id)!.forEach(visit);
  };
  visit(triggerId);
  if (reachable.size !== ids.size) throw new BadRequestException('Todos os blocos precisam estar conectados à entrada');
}

function assertCyclesHavePauseBoundary(graph: ChatbotGraph, ids: Set<string>, adjacency: Map<string, string[]>) {
  const pauseIds = new Set(graph.nodes.filter((node) => ['question', 'wait', 'ai_conversation'].includes(node.type)).map((node) => node.id));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (pauseIds.has(id) || visited.has(id)) return;
    if (visiting.has(id)) throw new BadRequestException('Todo ciclo precisa passar por um bloco de pergunta ou espera');
    visiting.add(id);
    adjacency.get(id)!.forEach((target) => {
      if (!pauseIds.has(target)) visit(target);
    });
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

@Injectable()
export class ChatbotsService {
  constructor(private readonly db: PrismaService) {}

  list(auth: AuthContext) {
    return this.db.chatbot.findMany({
      where: { organizationId: auth.organizationId, status: { not: 'ARCHIVED' }, ...this.scope(auth) },
      include: {
        instance: { select: { id: true, name: true, phone: true, status: true } },
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, publishedAt: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async metadata(auth: AuthContext) {
    const scope = permissionScope(auth, 'workflows', 'read');
    const teamFilter = instanceTeamFilter(auth, scope);
    const [instances, tags, teams, aiSettings] = await Promise.all([
      this.db.whatsappInstance.findMany({
        where: { organizationId: auth.organizationId, archivedAt: null, ...teamFilter },
        select: { id: true, name: true, phone: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.db.tag.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
      this.db.team.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, name: true, color: true, isDefault: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      this.db.organizationAiSettings.findUnique({
        where: { organizationId: auth.organizationId },
        select: { openAiApiKeyEncrypted: true },
      }),
    ]);
    const openAiAvailable = process.env.AI_ASSISTANT_ENABLED === 'true'
      && Boolean(aiSettings?.openAiApiKeyEncrypted || process.env.OPENAI_API_KEY?.trim());
    return { instances, tags, teams, responseProviders: [{ key: 'RULES', name: 'Regras', available: true }, { key: 'OPENAI', name: 'OpenAI', available: openAiAvailable }] };
  }

  async get(auth: AuthContext, id: string) {
    const chatbot = await this.db.chatbot.findFirst({
      where: { id, organizationId: auth.organizationId, status: { not: 'ARCHIVED' }, ...this.scope(auth) },
      include: {
        instance: { select: { id: true, name: true, phone: true, status: true } },
        versions: { orderBy: { version: 'desc' } },
        sessions: { orderBy: { updatedAt: 'desc' }, take: 50, include: { conversation: { include: { contact: { select: { id: true, name: true, phone: true } } } } } },
      },
    });
    if (!chatbot) throw new NotFoundException('Chatbot não encontrado');
    return chatbot;
  }

  async create(auth: AuthContext, input: { name: string; description?: string; instanceId: string; responseProvider?: 'RULES' | 'OPENAI'; graph?: ChatbotGraph }) {
    if (!auth.userId) throw new BadRequestException('Chatbot exige usuário');
    const name = input.name?.trim();
    if (!name || name.length < 2 || name.length > 120) throw new BadRequestException('Informe um nome válido para o chatbot');
    await this.assertInstance(auth, input.instanceId);
    const graph = input.graph || this.defaultGraph();
    const responseProvider = input.responseProvider || 'RULES';
    if (!['RULES', 'OPENAI'].includes(responseProvider)) throw new BadRequestException('Motor de resposta inválido');
    if (responseProvider === 'OPENAI') await this.assertOpenAiAvailable(auth.organizationId);
    this.validateShape(graph, false);
    return this.db.chatbot.create({
      data: {
        organizationId: auth.organizationId,
        instanceId: input.instanceId,
        createdById: auth.userId,
        name,
        description: input.description?.trim() || null,
        responseProvider,
        versions: { create: { version: 1, graph: graph as Prisma.InputJsonValue } },
      },
      include: { versions: true, instance: { select: { id: true, name: true, phone: true, status: true } } },
    });
  }

  async saveDraft(auth: AuthContext, id: string, graph: ChatbotGraph) {
    const chatbot = await this.getForMutation(auth, id);
    this.validateShape(graph, false);
    const latest = chatbot.versions[0];
    if (!latest) throw new BadRequestException('Versão do chatbot não encontrada');
    const version = latest.publishedAt
      ? await this.db.chatbotVersion.create({ data: { chatbotId: id, version: latest.version + 1, graph: graph as Prisma.InputJsonValue } })
      : await this.db.chatbotVersion.update({ where: { id: latest.id }, data: { graph: graph as Prisma.InputJsonValue } });
    await this.db.chatbot.update({ where: { id }, data: { status: chatbot.publishedVersion ? chatbot.status : 'DRAFT' } });
    return version;
  }

  async publish(auth: AuthContext, id: string) {
    const chatbot = await this.getForMutation(auth, id);
    const latest = chatbot.versions[0];
    if (!latest) throw new BadRequestException('Versão do chatbot não encontrada');
    if (latest.publishedAt) throw new BadRequestException('Salve uma nova versão antes de publicar novamente');
    const graph = latest.graph as unknown as ChatbotGraph;
    this.validateShape(graph, true);
    await this.assertQueueReferences(auth.organizationId, graph);
    if (graph.nodes.some((node) => node.type === 'ai_conversation') && chatbot.responseProvider !== 'OPENAI') {
      throw new BadRequestException('Blocos de atendimento por IA exigem o motor OpenAI');
    }
    if (chatbot.responseProvider === 'OPENAI') await this.assertOpenAiAvailable(auth.organizationId);
    await this.db.$transaction([
      this.db.chatbot.updateMany({ where: { instanceId: chatbot.instanceId, status: 'PUBLISHED', id: { not: id } }, data: { status: 'PAUSED' } }),
      this.db.chatbotVersion.update({ where: { id: latest.id }, data: { publishedAt: new Date() } }),
      this.db.chatbot.update({ where: { id }, data: { status: 'PUBLISHED', publishedVersion: latest.version } }),
      this.db.auditLog.create({ data: { organizationId: auth.organizationId, userId: auth.userId, action: 'chatbot.published', entityType: 'Chatbot', entityId: id, after: { version: latest.version, instanceId: chatbot.instanceId } } }),
    ]);
    return this.get(auth, id);
  }

  async setStatus(auth: AuthContext, id: string, status: 'PAUSED' | 'ARCHIVED' | 'PUBLISHED') {
    const chatbot = await this.getForMutation(auth, id);
    if (status === 'PUBLISHED' && !chatbot.publishedVersion) throw new BadRequestException('Publique uma versão antes de ativar o chatbot');
    if (status === 'PUBLISHED') {
      await this.db.chatbot.updateMany({ where: { instanceId: chatbot.instanceId, status: 'PUBLISHED', id: { not: id } }, data: { status: 'PAUSED' } });
    }
    if (status !== 'PUBLISHED') {
      await this.db.chatbotSession.updateMany({
        where: { chatbotId: id, status: { in: ['ACTIVE', 'WAITING'] } },
        data: { status: 'STOPPED', wakeAt: null, stopReason: status === 'ARCHIVED' ? 'Chatbot arquivado' : 'Chatbot pausado', completedAt: new Date() },
      });
    }
    return this.db.chatbot.update({ where: { id }, data: { status } });
  }

  async remove(auth: AuthContext, id: string) {
    await this.getForMutation(auth, id);
    const completedAt = new Date();
    await this.db.$transaction([
      this.db.chatbotSession.updateMany({
        where: { chatbotId: id, status: { in: ['ACTIVE', 'WAITING'] } },
        data: { status: 'STOPPED', wakeAt: null, stopReason: 'Chatbot excluído', completedAt },
      }),
      this.db.chatbot.update({ where: { id }, data: { status: 'ARCHIVED' } }),
      this.db.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'chatbot.deleted',
          entityType: 'Chatbot',
          entityId: id,
          after: { status: 'ARCHIVED', completedAt: completedAt.toISOString() },
        },
      }),
    ]);
    return { id, status: 'ARCHIVED' as const };
  }

  private async getForMutation(auth: AuthContext, id: string) {
    const chatbot = await this.db.chatbot.findFirst({
      where: { id, organizationId: auth.organizationId, status: { not: 'ARCHIVED' }, ...this.scope(auth) },
      select: {
        id: true,
        instanceId: true,
        status: true,
        publishedVersion: true,
        responseProvider: true,
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, graph: true, publishedAt: true } },
      },
    });
    if (!chatbot) throw new NotFoundException('Chatbot não encontrado');
    return chatbot;
  }

  validateShape(graph: ChatbotGraph, strict: boolean) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new BadRequestException('Mapa do chatbot inválido');
    if (graph.nodes.length > 100) throw new BadRequestException('O chatbot pode ter no máximo 100 blocos');
    if (graph.nodes.some((node) => !chatbotNodeTypes.includes(node.type as never))) throw new BadRequestException('O mapa contém um bloco não suportado');
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (ids.size !== graph.nodes.length) throw new BadRequestException('IDs de bloco duplicados');
    if (graph.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) throw new BadRequestException('Existe uma conexão inválida');
    if (!strict) return;

    const triggers = graph.nodes.filter((node) => node.type === 'trigger');
    if (triggers.length !== 1) throw new BadRequestException('O chatbot precisa ter exatamente uma entrada de mensagem');
    if (!graph.nodes.some((node) => ['handoff', 'close', 'end'].includes(node.type))) throw new BadRequestException('Adicione ao menos um bloco de transferência, encerramento ou fim');
    validateNodeConnections(graph);
    for (const aiNode of graph.nodes.filter((node) => node.type === 'ai_conversation')) {
      const firstTargetId = graph.edges.find((edge) => edge.source === aiNode.id)?.target;
      const firstTarget = graph.nodes.find((node) => node.id === firstTargetId);
      const handoffTargetId = firstTarget?.type === 'assign_queue'
        ? graph.edges.find((edge) => edge.source === firstTarget.id)?.target
        : firstTargetId;
      if (graph.nodes.find((node) => node.id === handoffTargetId)?.type !== 'handoff') {
        throw new BadRequestException(`O bloco ${nodeLabel(aiNode)} deve seguir diretamente para Transferir ou passar antes por Atribuir fila`);
      }
    }
    const adjacency = graphAdjacency(graph, ids);
    assertAllNodesReachable(triggers[0].id, ids, adjacency);
    assertCyclesHavePauseBoundary(graph, ids, adjacency);
  }

  private defaultGraph(): ChatbotGraph {
    return {
      nodes: [
        { id: 'trigger-1', type: 'trigger', data: { label: 'Mensagem recebida', subtitle: 'Qualquer mensagem', operator: 'contains', value: '' }, position: { x: 60, y: 180 } },
        { id: 'message-1', type: 'message', data: { label: 'Boas-vindas', subtitle: 'Resposta automática', text: 'Olá, {{nome}}! Sou o assistente virtual. Como posso ajudar?' }, position: { x: 340, y: 180 } },
        { id: 'question-1', type: 'question', data: { label: 'Entender necessidade', subtitle: 'Aguarda uma resposta', text: 'Digite 1 para falar com vendas ou 2 para suporte.' }, position: { x: 620, y: 180 } },
        { id: 'condition-1', type: 'condition', data: { label: 'Escolheu vendas?', subtitle: 'Resposta igual a 1', operator: 'equals', value: '1' }, position: { x: 900, y: 180 } },
        { id: 'message-2', type: 'message', data: { label: 'Confirmar transferência', subtitle: 'Equipe dará continuidade', text: 'Perfeito! Vou encaminhar seu atendimento para nossa equipe.' }, position: { x: 1180, y: 80 } },
        { id: 'handoff-1', type: 'handoff', data: { label: 'Transferir para atendente', subtitle: 'Envia para Aguardando' }, position: { x: 1460, y: 180 } },
      ],
      edges: [
        { id: 'edge-1', source: 'trigger-1', target: 'message-1' },
        { id: 'edge-2', source: 'message-1', target: 'question-1' },
        { id: 'edge-3', source: 'question-1', target: 'condition-1' },
        { id: 'edge-4', source: 'condition-1', sourceHandle: 'true', target: 'message-2' },
        { id: 'edge-5', source: 'condition-1', sourceHandle: 'false', target: 'handoff-1' },
        { id: 'edge-6', source: 'message-2', target: 'handoff-1' },
      ],
    };
  }

  private async assertInstance(auth: AuthContext, instanceId: string) {
    const scope = permissionScope(auth, 'workflows', 'read');
    const teamFilter = instanceTeamFilter(auth, scope);
    const allowed = await this.db.whatsappInstance.findFirst({
      where: { id: instanceId, organizationId: auth.organizationId, archivedAt: null, ...teamFilter },
      select: { id: true },
    });
    if (!allowed) throw new BadRequestException('Número de WhatsApp inválido ou sem acesso');
  }

  private async assertOpenAiAvailable(organizationId: string) {
    if (process.env.AI_ASSISTANT_ENABLED !== 'true') throw new BadRequestException('O assistente de IA está desativado neste ambiente');
    const settings = await this.db.organizationAiSettings.findUnique({
      where: { organizationId },
      select: { openAiApiKeyEncrypted: true },
    });
    if (!settings?.openAiApiKeyEncrypted && !process.env.OPENAI_API_KEY?.trim()) {
      throw new BadRequestException('Configure a chave da OpenAI antes de usar este chatbot');
    }
  }

  private async assertQueueReferences(organizationId: string, graph: ChatbotGraph) {
    const teamIds = [...new Set(graph.nodes
      .filter((node) => node.type === 'assign_queue')
      .map((node) => primitiveText(node.data?.teamId).trim())
      .filter(Boolean))];
    if (!teamIds.length) return;
    const count = await this.db.team.count({ where: { organizationId, id: { in: teamIds } } });
    if (count !== teamIds.length) throw new BadRequestException('Uma fila usada pelo chatbot não existe mais');
  }

  private scope(auth: AuthContext) {
    const scope = permissionScope(auth, 'workflows');
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') {
      const teamIds = authTeamIds(auth);
      return teamIds.length ? { createdBy: { teamMemberships: { some: { teamId: { in: teamIds } } } } } : { id: '__none__' };
    }
    return auth.userId ? { createdById: auth.userId } : { id: '__none__' };
  }
}
