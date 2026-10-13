import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BzsApiClient } from './api-client.js';
import { chatbotCatalog, chatbotNodeCatalog } from './chatbot-catalog.js';

const uuid = z.string().uuid();
const jsonObject = z.record(z.string(), z.unknown());
const idempotencyKey = z.string().min(8).max(160).optional()
  .describe('Chave estável para repetir com segurança a mesma criação.');

const readAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const createAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const updateAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const destructiveAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const companyFields = {
  name: z.string().min(2).max(180),
  legalName: z.string().max(180).optional(),
  cnpj: z.string().max(18).optional(),
  domain: z.string().max(160).optional(),
  sector: z.string().max(100).optional(),
  size: z.string().max(60).optional(),
  phone: z.string().max(24).optional(),
  address: jsonObject.optional(),
  ownerId: uuid.optional(),
  teamId: uuid.optional(),
  externalId: z.string().max(160).optional(),
  customFields: jsonObject.optional(),
};

const contactFields = {
  name: z.string().min(2).max(180),
  jobTitle: z.string().max(120).optional(),
  email: z.string().email().max(180).optional(),
  phone: z.string().max(24).optional().describe('Telefone preferencialmente em E.164, por exemplo +5545999999999.'),
  companyId: uuid.nullable().optional(),
  ownerId: uuid.optional(),
  teamId: uuid.optional(),
  source: z.string().max(80).optional(),
  externalId: z.string().max(160).optional(),
  consentStatus: z.enum(['unknown', 'granted', 'revoked']).optional(),
  consentSource: z.string().max(160).optional(),
  consentEvidence: z.string().max(500).optional(),
  customFields: jsonObject.optional(),
};

const opportunityFields = {
  title: z.string().min(2).max(180),
  companyId: uuid.optional(),
  contactId: uuid.optional(),
  pipelineId: uuid,
  stageId: uuid,
  ownerId: uuid.optional(),
  teamId: uuid.optional(),
  valueCents: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.string().datetime().optional(),
  source: z.string().max(80).optional(),
  externalId: z.string().max(160).optional(),
  customFields: jsonObject.optional(),
};

const taskFields = {
  title: z.string().min(2).max(180),
  description: z.string().max(2_000).optional(),
  dueAt: z.string().datetime().describe('Data e hora ISO-8601 em UTC.'),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeId: uuid.describe('ID de um usuário ativo, obtido com listar_usuarios_equipes.'),
  contactId: uuid.optional(),
  companyId: uuid.optional(),
  opportunityId: uuid.optional(),
};

const chatbotNodeType = z.enum([
  'trigger', 'message', 'question', 'wait', 'http_request', 'ai_conversation',
  'condition', 'add_tag', 'assign_queue', 'handoff', 'close', 'end',
]);
const chatbotGraph = z.object({
  nodes: z.array(z.object({
    id: z.string().min(1).max(120),
    type: chatbotNodeType,
    data: jsonObject.optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
  })).max(100),
  edges: z.array(z.object({
    id: z.string().max(120).optional(),
    source: z.string().min(1).max(120),
    target: z.string().min(1).max(120),
    sourceHandle: z.string().max(80).nullable().optional(),
  })).max(300),
}).describe('Grafo versionado do chatbot. Consulte listar_nos_chatbot para os campos de cada nó, comportamento e regras de conexão.');

const chatbotNodeKnowledge = chatbotNodeCatalog.map((node) => `${node.type}: ${node.behavior} Dados: ${node.data} Conexões: ${node.connections}`).join(' ');

export const potentialToolNames = [
  'listar_empresas', 'obter_empresa', 'criar_empresa', 'editar_empresa',
  'listar_contatos', 'obter_contato', 'criar_contato', 'editar_contato',
  'listar_funis', 'listar_oportunidades', 'obter_oportunidade', 'criar_oportunidade', 'editar_oportunidade',
  'listar_usuarios_equipes', 'listar_tarefas', 'criar_tarefa', 'editar_tarefa', 'concluir_tarefa',
  'listar_tags', 'criar_tag', 'editar_tag',
  'listar_campos_personalizados', 'criar_campo_personalizado', 'editar_campo_personalizado',
  'listar_segmentos', 'criar_segmento', 'editar_segmento',
  'listar_chatbots', 'obter_chatbot', 'obter_metadados_chatbots', 'listar_nos_chatbot',
  'criar_chatbot', 'editar_chatbot', 'publicar_chatbot', 'alterar_status_chatbot', 'excluir_chatbot',
] as const;

export function registerBzsTools(server: McpServer, api: BzsApiClient, scopes: string[]) {
  const registered: string[] = [];
  const can = (resource: string, action: 'read' | 'write') =>
    scopes.includes('*:*')
    || scopes.includes(`${resource}:*`)
    || scopes.includes(`${resource}:${action}`);
  const add = (name: string, register: () => void) => {
    register();
    registered.push(name);
  };

  if (can('companies', 'read')) {
    add('listar_empresas', () => server.registerTool('listar_empresas', {
      title: 'Listar empresas',
      description: 'Busca empresas ativas do CRM com paginação e filtros.',
      inputSchema: z.object({
        search: z.string().max(180).optional(),
        cursor: uuid.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        ownerId: z.union([uuid, z.literal('none')]).optional(),
        teamId: z.union([uuid, z.literal('none')]).optional(),
        sector: z.string().max(100).optional(),
        size: z.string().max(60).optional(),
        hasContacts: z.boolean().optional(),
      }),
      annotations: readAnnotations,
    }, safeTool(async (input) => api.get(withQuery('/companies', input)))));

    add('obter_empresa', () => server.registerTool('obter_empresa', {
      title: 'Obter empresa',
      description: 'Lê uma empresa e seus contatos, oportunidades, tarefas, notas e atividades.',
      inputSchema: z.object({ id: uuid }),
      annotations: readAnnotations,
    }, safeTool(({ id }) => api.get(`/companies/${id}`))));
  }

  if (can('companies', 'write')) {
    add('criar_empresa', () => server.registerTool('criar_empresa', {
      title: 'Criar empresa',
      description: 'Cria uma empresa. externalId permite upsert seguro em integrações.',
      inputSchema: z.object({ ...companyFields, idempotencyKey }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/companies', body, key))));

    add('editar_empresa', () => server.registerTool('editar_empresa', {
      title: 'Editar empresa',
      description: 'Atualiza campos de uma empresa existente sem excluí-la.',
      inputSchema: z.object({ id: uuid, ...partialShape(companyFields) }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/companies/${id}`, body))));
  }

  if (can('contacts', 'read')) {
    add('listar_contatos', () => server.registerTool('listar_contatos', {
      title: 'Listar contatos',
      description: 'Busca contatos ativos do CRM com paginação e filtros.',
      inputSchema: z.object({
        search: z.string().max(180).optional(),
        cursor: uuid.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        ownerId: z.union([uuid, z.literal('none')]).optional(),
        teamId: z.union([uuid, z.literal('none')]).optional(),
        tagId: uuid.optional(),
        company: z.string().max(180).optional(),
        hasPhone: z.boolean().optional(),
        hasEmail: z.boolean().optional(),
      }),
      annotations: readAnnotations,
    }, safeTool(async (input) => api.get(withQuery('/contacts', input)))));

    add('obter_contato', () => server.registerTool('obter_contato', {
      title: 'Obter contato',
      description: 'Lê um contato e seus vínculos de CRM.',
      inputSchema: z.object({ id: uuid }),
      annotations: readAnnotations,
    }, safeTool(({ id }) => api.get(`/contacts/${id}`))));

    add('listar_tags', () => server.registerTool('listar_tags', {
      title: 'Listar tags',
      description: 'Lista as tags do CRM.',
      inputSchema: z.object({}),
      annotations: readAnnotations,
    }, safeTool(() => api.get('/tags'))));

    add('listar_campos_personalizados', () => server.registerTool('listar_campos_personalizados', {
      title: 'Listar campos personalizados',
      description: 'Lista as definições de campos personalizados.',
      inputSchema: z.object({ entityType: z.enum(['company', 'contact', 'opportunity']).optional() }),
      annotations: readAnnotations,
    }, safeTool(({ entityType }) => api.get(withQuery('/custom-fields', { entityType })))));

    add('listar_segmentos', () => server.registerTool('listar_segmentos', {
      title: 'Listar segmentos',
      description: 'Lista os segmentos salvos e suas contagens.',
      inputSchema: z.object({}),
      annotations: readAnnotations,
    }, safeTool(() => api.get('/segments'))));
  }

  if (can('contacts', 'write')) {
    add('criar_contato', () => server.registerTool('criar_contato', {
      title: 'Criar contato',
      description: 'Cria um contato. Números equivalentes com ou sem o nono dígito são deduplicados pela API.',
      inputSchema: z.object({ ...contactFields, idempotencyKey }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/contacts', body, key))));

    add('editar_contato', () => server.registerTool('editar_contato', {
      title: 'Editar contato',
      description: 'Atualiza campos de um contato existente sem excluí-lo.',
      inputSchema: z.object({ id: uuid, ...partialShape(contactFields) }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/contacts/${id}`, body))));

    add('criar_tag', () => server.registerTool('criar_tag', {
      title: 'Criar tag',
      description: 'Cria uma tag de CRM.',
      inputSchema: z.object({ name: z.string().min(1).max(80), color: z.string().max(30).optional(), idempotencyKey }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/tags', body, key))));

    add('editar_tag', () => server.registerTool('editar_tag', {
      title: 'Editar tag',
      description: 'Atualiza nome ou cor de uma tag.',
      inputSchema: z.object({ id: uuid, name: z.string().min(1).max(80).optional(), color: z.string().max(30).optional() }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/tags/${id}`, body))));

    add('criar_campo_personalizado', () => server.registerTool('criar_campo_personalizado', {
      title: 'Criar campo personalizado',
      description: 'Cria uma definição de campo personalizado para empresa, contato ou oportunidade.',
      inputSchema: z.object({
        entityType: z.enum(['company', 'contact', 'opportunity']),
        key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
        label: z.string().min(1).max(100),
        fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select', 'multiselect']),
        options: z.array(z.unknown()).optional(),
        required: z.boolean().optional(),
        position: z.number().int().min(0).optional(),
        idempotencyKey,
      }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/custom-fields', body, key))));

    add('editar_campo_personalizado', () => server.registerTool('editar_campo_personalizado', {
      title: 'Editar campo personalizado',
      description: 'Atualiza uma definição de campo personalizado sem removê-la.',
      inputSchema: z.object({
        id: uuid,
        label: z.string().min(1).max(100).optional(),
        options: z.array(z.unknown()).optional(),
        required: z.boolean().optional(),
        position: z.number().int().min(0).optional(),
      }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/custom-fields/${id}`, body))));

    add('criar_segmento', () => server.registerTool('criar_segmento', {
      title: 'Criar segmento',
      description: 'Cria um segmento dinâmico por filtros ou estático por IDs de contatos.',
      inputSchema: z.object({
        name: z.string().min(1).max(180),
        description: z.string().max(500).optional(),
        filters: jsonObject.optional(),
        contactIds: z.array(uuid).max(10_000).optional(),
        idempotencyKey,
      }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/segments', body, key))));

    add('editar_segmento', () => server.registerTool('editar_segmento', {
      title: 'Editar segmento',
      description: 'Atualiza um segmento e, opcionalmente, seus contatos.',
      inputSchema: z.object({
        id: uuid,
        name: z.string().min(1).max(180).optional(),
        description: z.string().max(500).optional(),
        filters: jsonObject.optional(),
        contactIds: z.array(uuid).max(10_000).optional(),
      }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/segments/${id}`, body))));
  }

  if (can('opportunities', 'read')) {
    add('listar_funis', () => server.registerTool('listar_funis', {
      title: 'Listar funis',
      description: 'Lista funis ativos e suas etapas; use os IDs ao criar ou editar oportunidades.',
      inputSchema: z.object({}),
      annotations: readAnnotations,
    }, safeTool(() => api.get('/pipelines'))));

    add('listar_oportunidades', () => server.registerTool('listar_oportunidades', {
      title: 'Listar oportunidades',
      description: 'Busca oportunidades ativas com empresa, contatos, funil, etapa e responsável.',
      inputSchema: z.object({
        search: z.string().max(180).optional(),
        cursor: uuid.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: readAnnotations,
    }, safeTool((input) => api.get(withQuery('/opportunities', input)))));

    add('obter_oportunidade', () => server.registerTool('obter_oportunidade', {
      title: 'Obter oportunidade',
      description: 'Lê uma oportunidade com seus principais vínculos e histórico.',
      inputSchema: z.object({ id: uuid }),
      annotations: readAnnotations,
    }, safeTool(({ id }) => api.get(`/opportunities/${id}`))));
  }

  if (can('opportunities', 'write')) {
    add('criar_oportunidade', () => server.registerTool('criar_oportunidade', {
      title: 'Criar oportunidade',
      description: 'Cria uma oportunidade em um funil e etapa existentes.',
      inputSchema: z.object({ ...opportunityFields, idempotencyKey }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/opportunities', body, key))));

    add('editar_oportunidade', () => server.registerTool('editar_oportunidade', {
      title: 'Editar oportunidade',
      description: 'Atualiza uma oportunidade, inclusive sua etapa, sem excluí-la.',
      inputSchema: z.object({ id: uuid, ...partialShape(opportunityFields) }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/opportunities/${id}`, body))));
  }

  if (can('tasks', 'read')) {
    add('listar_usuarios_equipes', () => server.registerTool('listar_usuarios_equipes', {
      title: 'Listar usuários e equipes',
      description: 'Lista usuários ativos e equipes para atribuir tarefas corretamente.',
      inputSchema: z.object({}),
      annotations: readAnnotations,
    }, safeTool(() => api.get('/mcp/directory'))));

    add('listar_tarefas', () => server.registerTool('listar_tarefas', {
      title: 'Listar tarefas',
      description: 'Lista tarefas por período e status.',
      inputSchema: z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        status: z.enum(['open', 'completed', 'cancelled', 'all']).optional(),
      }),
      annotations: readAnnotations,
    }, safeTool((input) => api.get(withQuery('/tasks', input)))));
  }

  if (can('tasks', 'write')) {
    add('criar_tarefa', () => server.registerTool('criar_tarefa', {
      title: 'Criar tarefa',
      description: 'Cria uma tarefa atribuída a um usuário ativo.',
      inputSchema: z.object({ ...taskFields, idempotencyKey }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/tasks', body, key))));

    add('editar_tarefa', () => server.registerTool('editar_tarefa', {
      title: 'Editar tarefa',
      description: 'Atualiza os dados de uma tarefa sem cancelá-la ou excluí-la.',
      inputSchema: z.object({ id: uuid, ...partialShape(taskFields) }),
      annotations: updateAnnotations,
    }, safeTool(({ id, ...body }) => api.patch(`/tasks/${id}`, body))));

    add('concluir_tarefa', () => server.registerTool('concluir_tarefa', {
      title: 'Concluir tarefa',
      description: 'Marca uma tarefa existente como concluída.',
      inputSchema: z.object({ id: uuid }),
      annotations: updateAnnotations,
    }, safeTool(({ id }) => api.patch(`/tasks/${id}/complete`))));
  }

  if (can('workflows', 'read')) {
    add('listar_chatbots', () => server.registerTool('listar_chatbots', {
      title: 'Listar chatbots',
      description: 'Lista chatbots não arquivados da organização, incluindo status, motor de resposta, número do WhatsApp, última versão e quantidade de sessões.',
      inputSchema: z.object({}),
      annotations: readAnnotations,
    }, safeTool(() => api.get('/chatbots'))));

    add('obter_chatbot', () => server.registerTool('obter_chatbot', {
      title: 'Obter chatbot',
      description: `Lê um chatbot, suas versões, grafos e sessões recentes. O grafo suporta trigger, message, question, wait, http_request, ai_conversation, condition, add_tag, assign_queue, handoff, close e end. ${chatbotNodeKnowledge}`,
      inputSchema: z.object({ id: uuid }),
      annotations: readAnnotations,
    }, safeTool(({ id }) => api.get(`/chatbots/${id}`))));

    add('obter_metadados_chatbots', () => server.registerTool('obter_metadados_chatbots', {
      title: 'Obter metadados de chatbots',
      description: 'Lista números de WhatsApp, tags, filas/equipes e disponibilidade dos motores RULES e OPENAI. Use os UUIDs retornados ao criar nós assign_queue, add_tag ou ao criar um chatbot.',
      inputSchema: z.object({}),
      annotations: readAnnotations,
    }, safeTool(() => api.get('/chatbots/metadata'))));

    add('listar_nos_chatbot', () => server.registerTool('listar_nos_chatbot', {
      title: 'Conhecer nós de chatbot',
      description: 'Retorna o catálogo canônico dos nós, campos, comportamento, regras de conexão, provedores compatíveis e validações do grafo. Use antes de criar ou editar um fluxo.',
      inputSchema: z.object({ nodeType: chatbotNodeType.optional() }),
      annotations: readAnnotations,
    }, safeTool(async ({ nodeType }) => ({
      ...chatbotCatalog,
      nodeTypes: nodeType ? chatbotNodeCatalog.filter((node) => node.type === nodeType) : chatbotNodeCatalog,
    }))));
  }

  if (can('workflows', 'write')) {
    add('criar_chatbot', () => server.registerTool('criar_chatbot', {
      title: 'Criar chatbot',
      description: 'Cria um chatbot de Regras (RULES) ou OpenAI (OPENAI). Se graph não for informado, a API cria um rascunho inicial. O nó ai_conversation só pode ser publicado com OPENAI; use obter_metadados_chatbots para confirmar a disponibilidade.',
      inputSchema: z.object({
        name: z.string().min(2).max(120),
        description: z.string().max(500).optional(),
        instanceId: uuid.describe('UUID do número de WhatsApp retornado por obter_metadados_chatbots.'),
        responseProvider: z.enum(['RULES', 'OPENAI']).default('RULES'),
        graph: chatbotGraph.optional(),
        idempotencyKey,
      }),
      annotations: createAnnotations,
    }, safeTool(({ idempotencyKey: key, ...body }) => api.post('/chatbots', body, key))));

    add('editar_chatbot', () => server.registerTool('editar_chatbot', {
      title: 'Editar chatbot',
      description: 'Salva o grafo informado como rascunho do chatbot. Isso permite criar, editar e remover nós/arestas, alterar regras de chatbot RULES ou configurar o fluxo de IA. A validação estrutural ocorre ao salvar e a validação completa ocorre ao publicar.',
      inputSchema: z.object({ id: uuid, graph: chatbotGraph }),
      annotations: updateAnnotations,
    }, safeTool(({ id, graph }) => api.patch(`/chatbots/${id}/draft`, { graph }))));

    add('publicar_chatbot', () => server.registerTool('publicar_chatbot', {
      title: 'Publicar chatbot',
      description: 'Valida e publica o último rascunho. Exige um trigger, um nó final, todas as conexões válidas, todos os nós alcançáveis e, para IA, ai_conversation ligado a handoff ou assign_queue seguido de handoff.',
      inputSchema: z.object({ id: uuid }),
      annotations: updateAnnotations,
    }, safeTool(({ id }) => api.post(`/chatbots/${id}/publish`, {}))));

    add('alterar_status_chatbot', () => server.registerTool('alterar_status_chatbot', {
      title: 'Alterar status do chatbot',
      description: 'Pausa ou reativa um chatbot já publicado. Ao pausar, sessões ativas e em espera são interrompidas; ao publicar, os demais chatbots publicados no mesmo número são pausados.',
      inputSchema: z.object({ id: uuid, status: z.enum(['PAUSED', 'PUBLISHED']) }),
      annotations: updateAnnotations,
    }, safeTool(({ id, status }) => api.patch(`/chatbots/${id}/status`, { status }))));

    add('excluir_chatbot', () => server.registerTool('excluir_chatbot', {
      title: 'Excluir chatbot',
      description: 'Exclui logicamente um chatbot. Interrompe sessões ativas, arquiva o chatbot e preserva versões, histórico e auditoria; não há exclusão física.',
      inputSchema: z.object({ id: uuid }),
      annotations: destructiveAnnotations,
    }, safeTool(({ id }) => api.delete(`/chatbots/${id}`))));
  }

  return registered;
}

function partialShape<T extends Record<string, z.ZodType>>(shape: T) {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, schema.optional()]),
  ) as { [K in keyof T]: z.ZodOptional<T[K]> };
}

function safeTool<T extends Record<string, unknown>>(handler: (input: T) => Promise<unknown>) {
  return async (input: T): Promise<CallToolResult> => {
    try {
      const result = await handler(input);
      const structuredContent = { result } as Record<string, unknown>;
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha inesperada ao acessar o BZS One';
      return {
        isError: true,
        content: [{ type: 'text', text: message.slice(0, 2_000) }],
      };
    }
  };
}

function withQuery(path: string, values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const serialized = queryValue(value);
    if (serialized) params.set(key, serialized);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function queryValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  return '';
}
