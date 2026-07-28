import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BzsApiClient } from './api-client.js';

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

export const potentialToolNames = [
  'listar_empresas', 'obter_empresa', 'criar_empresa', 'editar_empresa',
  'listar_contatos', 'obter_contato', 'criar_contato', 'editar_contato',
  'listar_funis', 'listar_oportunidades', 'obter_oportunidade', 'criar_oportunidade', 'editar_oportunidade',
  'listar_usuarios_equipes', 'listar_tarefas', 'criar_tarefa', 'editar_tarefa', 'concluir_tarefa',
  'listar_tags', 'criar_tag', 'editar_tag',
  'listar_campos_personalizados', 'criar_campo_personalizado', 'editar_campo_personalizado',
  'listar_segmentos', 'criar_segmento', 'editar_segmento',
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
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
