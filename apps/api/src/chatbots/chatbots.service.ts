import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { chatbotNodeTypes } from '@prospecta/contracts';
import { permissionScope } from '../auth/data-scope.js';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ChatbotNode = { id: string; type: string; data?: Record<string, unknown>; position?: { x: number; y: number } };
export type ChatbotEdge = { id?: string; source: string; target: string; sourceHandle?: string | null };
export type ChatbotGraph = { nodes: ChatbotNode[]; edges: ChatbotEdge[] };

@Injectable()
export class ChatbotsService {
  constructor(private readonly db: PrismaService) {}

  list(auth: AuthContext) {
    return this.db.chatbot.findMany({
      where: { organizationId: auth.organizationId, ...this.scope(auth) },
      include: {
        instance: { select: { id: true, name: true, phone: true, status: true } },
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, publishedAt: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async metadata(auth: AuthContext) {
    const scope = permissionScope(auth, 'workflows', 'read');
    const teamFilter = scope === 'ALL' ? {} : auth.teamId ? { teams: { some: { teamId: auth.teamId } } } : { id: '__none__' };
    const [instances, tags] = await Promise.all([
      this.db.whatsappInstance.findMany({
        where: { organizationId: auth.organizationId, archivedAt: null, ...teamFilter },
        select: { id: true, name: true, phone: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.db.tag.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
    ]);
    return { instances, tags, responseProviders: [{ key: 'RULES', name: 'Regras', available: true }, { key: 'AI', name: 'Inteligência artificial', available: false }] };
  }

  async get(auth: AuthContext, id: string) {
    const chatbot = await this.db.chatbot.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      include: {
        instance: { select: { id: true, name: true, phone: true, status: true } },
        versions: { orderBy: { version: 'desc' } },
        sessions: { orderBy: { updatedAt: 'desc' }, take: 50, include: { conversation: { include: { contact: { select: { id: true, name: true, phone: true } } } } } },
      },
    });
    if (!chatbot) throw new NotFoundException('Chatbot não encontrado');
    return chatbot;
  }

  async create(auth: AuthContext, input: { name: string; description?: string; instanceId: string; graph?: ChatbotGraph }) {
    if (!auth.userId) throw new BadRequestException('Chatbot exige usuário');
    const name = input.name?.trim();
    if (!name || name.length < 2 || name.length > 120) throw new BadRequestException('Informe um nome válido para o chatbot');
    await this.assertInstance(auth, input.instanceId);
    const graph = input.graph || this.defaultGraph();
    this.validateShape(graph, false);
    return this.db.chatbot.create({
      data: {
        organizationId: auth.organizationId,
        instanceId: input.instanceId,
        createdById: auth.userId,
        name,
        description: input.description?.trim() || null,
        responseProvider: 'RULES',
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
    this.validateShape(latest.graph as unknown as ChatbotGraph, true);
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
        data: { status: 'STOPPED', stopReason: status === 'ARCHIVED' ? 'Chatbot arquivado' : 'Chatbot pausado', completedAt: new Date() },
      });
    }
    return this.db.chatbot.update({ where: { id }, data: { status } });
  }

  private async getForMutation(auth: AuthContext, id: string) {
    const chatbot = await this.db.chatbot.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      select: {
        id: true,
        instanceId: true,
        status: true,
        publishedVersion: true,
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
    for (const node of graph.nodes) {
      const outgoing = graph.edges.filter((edge) => edge.source === node.id);
      if (['message', 'question'].includes(node.type) && !String(node.data?.text || '').trim()) throw new BadRequestException(`Preencha o texto do bloco ${node.data?.label || node.id}`);
      if (node.type === 'condition') {
        if (!String(node.data?.value || '').trim()) throw new BadRequestException(`Preencha a regra do bloco ${node.data?.label || node.id}`);
        if (!outgoing.some((edge) => edge.sourceHandle === 'true') || !outgoing.some((edge) => edge.sourceHandle === 'false')) throw new BadRequestException('Toda condição precisa das saídas “Sim” e “Não”');
      } else if (['handoff', 'close', 'end'].includes(node.type)) {
        if (outgoing.length) throw new BadRequestException('Blocos finais não podem possuir saída');
      } else if (outgoing.length !== 1) {
        throw new BadRequestException(`O bloco ${node.data?.label || node.id} precisa ter uma saída`);
      }
    }

    const adjacency = new Map<string, string[]>();
    for (const id of ids) adjacency.set(id, []);
    for (const edge of graph.edges) adjacency.get(edge.source)!.push(edge.target);
    const reachable = new Set<string>();
    const visitReachable = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      adjacency.get(id)!.forEach(visitReachable);
    };
    visitReachable(triggers[0].id);
    if (reachable.size !== ids.size) throw new BadRequestException('Todos os blocos precisam estar conectados à entrada');

    // Todo ciclo precisa aguardar uma nova mensagem em algum ponto. Ao retirar
    // os blocos de pergunta, o restante do mapa deve continuar acíclico.
    const questionIds = new Set(graph.nodes.filter((node) => node.type === 'question').map((node) => node.id));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visitWithoutQuestions = (id: string) => {
      if (questionIds.has(id) || visited.has(id)) return;
      if (visiting.has(id)) throw new BadRequestException('Todo ciclo precisa passar por um bloco de pergunta');
      visiting.add(id);
      adjacency.get(id)!.forEach((target) => {
        if (!questionIds.has(target)) visitWithoutQuestions(target);
      });
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of ids) visitWithoutQuestions(id);
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
    const teamFilter = scope === 'ALL' ? {} : auth.teamId ? { teams: { some: { teamId: auth.teamId } } } : { id: '__none__' };
    const allowed = await this.db.whatsappInstance.findFirst({
      where: { id: instanceId, organizationId: auth.organizationId, archivedAt: null, ...teamFilter },
      select: { id: true },
    });
    if (!allowed) throw new BadRequestException('Número de WhatsApp inválido ou sem acesso');
  }

  private scope(auth: AuthContext) {
    const scope = permissionScope(auth, 'workflows');
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') return auth.teamId ? { createdBy: { teamId: auth.teamId } } : { id: '__none__' };
    return auth.userId ? { createdById: auth.userId } : { id: '__none__' };
  }
}
