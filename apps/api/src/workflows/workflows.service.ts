import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { workflowNodeTypes } from '@prospecta/contracts';
import type { AuthContext } from '../auth/types.js';
import { permissionScope } from '../auth/data-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTOMATION_QUEUE } from '../queue/queue.module.js';

const ENROLLMENT_BATCH_SIZE = 500;

type WorkflowNode = { id: string; type: string; data?: Record<string, unknown>; position?: { x: number; y: number } };
type WorkflowEdge = { id?: string; source: string; target: string; sourceHandle?: string };
type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

@Injectable()
export class WorkflowsService {
  constructor(private readonly db: PrismaService, @Inject(AUTOMATION_QUEUE) private readonly queue: Queue) {}

  list(auth: AuthContext) {
    return this.db.workflow.findMany({
      where: { organizationId: auth.organizationId, ...this.scope(auth) },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, publishedAt: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async metadata(auth: AuthContext) {
    const [users, teams, tags, customFields, instances, pipelines] = await Promise.all([
      this.db.user.findMany({ where: { organizationId: auth.organizationId, status: 'ACTIVE' }, select: { id: true, name: true, teamId: true } }),
      this.db.team.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, name: true } }),
      this.db.tag.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
      this.db.customFieldDefinition.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, key: true, label: true, fieldType: true, entityType: true }, orderBy: { position: 'asc' } }),
      this.db.whatsappInstance.findMany({ where: { organizationId: auth.organizationId }, select: { id: true, name: true, phone: true, status: true }, orderBy: { name: 'asc' } }),
      this.db.pipeline.findMany({ where: { organizationId: auth.organizationId, isActive: true }, select: { id: true, name: true, stages: { select: { id: true, name: true, position: true }, orderBy: { position: 'asc' } } }, orderBy: { name: 'asc' } }),
    ]);
    return { users, teams, tags, customFields, instances, pipelines };
  }

  async get(auth: AuthContext, id: string) {
    const workflow = await this.db.workflow.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      include: { versions: { orderBy: { version: 'desc' } }, enrollments: { orderBy: { startedAt: 'desc' }, take: 100, include: { contact: { select: { id: true, name: true, phone: true } } } } },
    });
    if (!workflow) throw new NotFoundException('Automação não encontrada');
    return workflow;
  }

  async create(auth: AuthContext, input: { name: string; description?: string; graph?: WorkflowGraph }) {
    if (!auth.userId) throw new BadRequestException('Automação exige usuário');
    const graph = input.graph || this.defaultGraph();
    return this.db.workflow.create({
      data: {
        organizationId: auth.organizationId, createdById: auth.userId, name: input.name,
        description: input.description, versions: { create: { version: 1, graph: graph as Prisma.InputJsonValue } },
      }, include: { versions: true },
    });
  }

  async saveDraft(auth: AuthContext, id: string, graph: WorkflowGraph) {
    const workflow = await this.getForMutation(auth, id);
    this.validateShape(graph, false);
    const latest = workflow.versions[0];
    const version = latest.publishedAt
      ? await this.db.workflowVersion.create({ data: { workflowId: id, version: latest.version + 1, graph: graph as Prisma.InputJsonValue } })
      : await this.db.workflowVersion.update({ where: { id: latest.id }, data: { graph: graph as Prisma.InputJsonValue } });
    await this.db.workflow.update({ where: { id }, data: { status: workflow.publishedVersion ? 'PUBLISHED' : 'DRAFT' } });
    return version;
  }

  async publish(auth: AuthContext, id: string) {
    const workflow = await this.getForMutation(auth, id);
    const latest = workflow.versions[0];
    if (latest.publishedAt) throw new BadRequestException('Crie uma nova versão antes de publicar novamente');
    const graph = latest.graph as unknown as WorkflowGraph;
    this.validateShape(graph, true);
    await this.db.$transaction([
      this.db.workflowVersion.update({ where: { id: latest.id }, data: { publishedAt: new Date() } }),
      this.db.workflow.update({ where: { id }, data: { status: 'PUBLISHED', publishedVersion: latest.version } }),
      this.db.auditLog.create({ data: { organizationId: auth.organizationId, userId: auth.userId, action: 'workflow.published', entityType: 'Workflow', entityId: id, after: { version: latest.version } } }),
    ]);
    return this.get(auth, id);
  }

  async enroll(auth: AuthContext, id: string, contactIds: string[], source: { conversationId?: string } = {}) {
    const workflow = await this.getForEnrollment(auth, id);
    if (workflow.status !== 'PUBLISHED' || !workflow.publishedVersion) throw new BadRequestException('Publique a automação antes de inscrever contatos');
    const version = workflow.versions.find((item) => item.version === workflow.publishedVersion)!;
    const requestedIds = [...new Set(contactIds.filter(Boolean))];
    const contacts = requestedIds.length
      ? await this.db.contact.findMany({
          where: { id: { in: requestedIds }, organizationId: auth.organizationId, archivedAt: null },
          select: { id: true },
        })
      : [];
    let validIds = contacts.map((contact) => contact.id);
    let executionContext: Prisma.InputJsonObject | undefined = auth.userId
      ? { source: 'manual', initiatedByUserId: auth.userId }
      : undefined;
    let sourceConversation: { id: string; contactId: string; instanceId: string } | null = null;
    if (source.conversationId) {
      sourceConversation = await this.db.conversation.findFirst({
        where: { id: source.conversationId, organizationId: auth.organizationId, contactId: { in: validIds } },
        select: { id: true, contactId: true, instanceId: true },
      });
      if (!sourceConversation) throw new BadRequestException('A conversa não pertence ao contato informado');
      validIds = [sourceConversation.contactId];
      executionContext = {
        source: 'conversation',
        conversationId: sourceConversation.id,
        instanceId: sourceConversation.instanceId,
        ...(auth.userId ? { initiatedByUserId: auth.userId } : {}),
      };
    }
    if (sourceConversation && executionContext) {
      const enrollment = await this.db.workflowEnrollment.create({ data: {
        workflowId: id,
        versionId: version.id,
        contactId: sourceConversation.contactId,
        currentNodeId: null,
        context: executionContext,
      } });
      await this.queue.add('execute-workflow', { enrollmentId: enrollment.id }, { jobId: `workflow-${enrollment.id}`, attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 1000 });
      await this.db.conversationEvent.create({ data: {
        organizationId: auth.organizationId,
        conversationId: sourceConversation.id,
        actorId: auth.userId,
        type: 'workflow_started',
        text: `${auth.name} iniciou a automação “${workflow.name}” para este contato`,
        metadata: { workflowId: workflow.id, versionId: version.id, contactId: sourceConversation.contactId, enrollmentId: enrollment.id },
      } });
      return { requested: contactIds.length, enrolled: 1, skipped: Math.max(0, contactIds.length - 1) };
    }
    const existing = await this.db.workflowEnrollment.findMany({ where: { workflowId: id, contactId: { in: validIds }, versionId: version.id }, select: { contactId: true } });
    const existingIds = new Set(existing.map((item) => item.contactId));
    const eligible = validIds.filter((contactId) => !existingIds.has(contactId));
    if (eligible.length) {
      for (let index = 0; index < eligible.length; index += ENROLLMENT_BATCH_SIZE) {
        const contactBatch = eligible.slice(index, index + ENROLLMENT_BATCH_SIZE);
        await this.db.workflowEnrollment.createMany({ data: contactBatch.map((contactId) => ({
          workflowId: id,
          versionId: version.id,
          contactId,
          currentNodeId: null,
          ...(executionContext ? { context: executionContext } : {}),
        })) });
        const enrollments = await this.db.workflowEnrollment.findMany({
          where: { workflowId: id, versionId: version.id, contactId: { in: contactBatch } },
          select: { id: true },
        });
        await this.queue.addBulk(enrollments.map((enrollment) => ({
          name: 'execute-workflow',
          data: { enrollmentId: enrollment.id },
          opts: { jobId: `workflow-${enrollment.id}`, attempts: 5, backoff: { type: 'exponential' as const, delay: 3000 }, removeOnComplete: 1000 },
        })));
      }
    }
    return { requested: contactIds.length, enrolled: eligible.length, skipped: contactIds.length - eligible.length };
  }

  async setStatus(auth: AuthContext, id: string, status: 'PAUSED' | 'ARCHIVED' | 'PUBLISHED') {
    await this.getForMutation(auth, id);
    return this.db.workflow.update({ where: { id }, data: { status } });
  }

  private async getForMutation(auth: AuthContext, id: string) {
    const workflow = await this.db.workflow.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      select: {
        id: true,
        status: true,
        publishedVersion: true,
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, graph: true, publishedAt: true } },
      },
    });
    if (!workflow) throw new NotFoundException('Automação não encontrada');
    return workflow;
  }

  private async getForEnrollment(auth: AuthContext, id: string) {
    const workflow = await this.db.workflow.findFirst({
      where: { id, organizationId: auth.organizationId, ...this.scope(auth) },
      select: {
        id: true,
        name: true,
        status: true,
        publishedVersion: true,
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true },
        },
      },
    });
    if (!workflow) throw new NotFoundException('Automação não encontrada');
    return workflow;
  }

  validateShape(graph: WorkflowGraph, strict: boolean) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new BadRequestException('Grafo inválido');
    if (graph.nodes.some((node) => !workflowNodeTypes.includes(node.type as never))) throw new BadRequestException('O grafo contém um bloco não suportado');
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (ids.size !== graph.nodes.length) throw new BadRequestException('IDs de bloco duplicados');
    if (graph.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) throw new BadRequestException('Existe uma conexão com bloco inexistente');
    if (!strict) return;
    const triggers = graph.nodes.filter((node) => node.type === 'trigger');
    if (triggers.length !== 1) throw new BadRequestException('A automação publicada precisa ter exatamente um gatilho');
    if (!graph.nodes.some((node) => node.type === 'end')) throw new BadRequestException('A automação precisa de um bloco de fim');
    for (const node of graph.nodes) {
      const data = node.data || {};
      if (node.type === 'send_whatsapp' && !String(data.text || '').trim()) throw new BadRequestException('Configure a mensagem do bloco Enviar WhatsApp');
      if (node.type === 'condition' && !String(data.field || '').trim()) throw new BadRequestException('Configure o campo do bloco Condição');
      if (node.type === 'wait') {
        const duration = data.seconds ?? data.minutes;
        if (!Number.isFinite(Number(duration)) || Number(duration) < 1) throw new BadRequestException('Configure um tempo de espera válido');
      }
      if (node.type === 'update_record' && !String(data.field || '').trim()) throw new BadRequestException('Configure o campo que será atualizado');
      if (node.type === 'move_stage' && !String(data.stageId || '').trim()) throw new BadRequestException('Configure a etapa de destino');
      if (node.type === 'assign' && !data.userId && !data.teamId) throw new BadRequestException('Configure um usuário ou equipe para atribuição');
      if ((node.type === 'add_tag' || node.type === 'remove_tag') && !String(data.tagId || '').trim()) throw new BadRequestException('Configure a tag da automação');
    }
    const adjacency = new Map<string, string[]>();
    for (const id of ids) adjacency.set(id, []);
    for (const edge of graph.edges) adjacency.get(edge.source)!.push(edge.target);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new BadRequestException('Ciclos não são permitidos na v1');
      if (visited.has(id)) return;
      visiting.add(id);
      adjacency.get(id)!.forEach(visit);
      visiting.delete(id); visited.add(id);
    };
    visit(triggers[0].id);
    if (visited.size !== ids.size) throw new BadRequestException('Todos os blocos precisam estar conectados ao gatilho');
  }

  private defaultGraph(): WorkflowGraph {
    return {
      nodes: [
        { id: 'trigger-1', type: 'trigger', data: { trigger: 'manual', label: 'Inscrição manual' }, position: { x: 80, y: 140 } },
        { id: 'end-1', type: 'end', data: { label: 'Fim' }, position: { x: 420, y: 140 } },
      ],
      edges: [{ id: 'edge-1', source: 'trigger-1', target: 'end-1' }],
    };
  }

  private scope(auth: AuthContext) {
    const scope = permissionScope(auth, 'workflows');
    if (scope === 'ALL') return {};
    if (scope === 'TEAM') return auth.teamId ? { createdBy: { teamId: auth.teamId } } : { id: '__none__' };
    return auth.userId ? { createdById: auth.userId } : { id: '__none__' };
  }
}
