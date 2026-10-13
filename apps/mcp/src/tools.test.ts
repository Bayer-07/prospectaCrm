import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { BzsApiClient } from './api-client.js';
import { createBzsMcpServer } from './server.js';
import { potentialToolNames } from './tools.js';

const fullScopes = [
  'companies:read', 'companies:write',
  'contacts:read', 'contacts:write',
  'opportunities:read', 'opportunities:write',
  'tasks:read', 'tasks:write',
  'workflows:read', 'workflows:write',
];

describe('servidor MCP BZS One', () => {
  it('declara exclusão destrutiva somente para chatbot e como exclusão lógica', () => {
    expect(potentialToolNames).not.toContain('excluir_empresa');
    expect(potentialToolNames).toContain('excluir_chatbot');
    expect(potentialToolNames.filter((name) => /(excluir|apagar|arquivar|cancelar|delete|remove)/i.test(name))).toEqual(['excluir_chatbot']);
  });

  it('expõe somente ferramentas permitidas pelos escopos da chave', async () => {
    const server = createBzsMcpServer('pk_test_secret', ['contacts:read']);
    const client = new Client({ name: 'mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'listar_contatos',
      'obter_contato',
      'listar_tags',
      'listar_campos_personalizados',
      'listar_segmentos',
    ]);
    expect(tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);

    await Promise.all([client.close(), server.close()]);
  });

  it('encaminha leitura à API sem usar DELETE', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ data: [{ id: 'empresa-1', name: 'BZS Tecnologia' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const server = createBzsMcpServer('pk_test_secret', ['companies:read']);
    const client = new Client({ name: 'mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'listar_empresas', arguments: { search: 'BZS' } });
    expect(result.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/companies?search=BZS'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(Array.from(fetchMock.mock.calls).every(([, init]) => init?.method !== 'DELETE')).toBe(true);

    fetchMock.mockRestore();
    await Promise.all([client.close(), server.close()]);
  });

  it('expõe o ciclo completo de chatbot pelos escopos de workflows', async () => {
    const server = createBzsMcpServer('pk_test_secret', fullScopes);
    const client = new Client({ name: 'mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'listar_chatbots', 'obter_chatbot', 'obter_metadados_chatbots', 'listar_nos_chatbot',
      'criar_chatbot', 'editar_chatbot', 'publicar_chatbot', 'alterar_status_chatbot', 'excluir_chatbot',
    ]));
    expect(tools.find((tool) => tool.name === 'excluir_chatbot')?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((tool) => tool.name === 'listar_nos_chatbot')?.description).toContain('catálogo canônico');

    const knowledge = await client.callTool({ name: 'listar_nos_chatbot', arguments: {} });
    const knowledgeText = knowledge.content?.find((item) => item.type === 'text');
    expect(knowledgeText?.type === 'text' ? knowledgeText.text : '').toContain('ai_conversation');

    await Promise.all([client.close(), server.close()]);
  });

  it('cria, edita, publica, pausa e exclui um chatbot via API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'chatbot-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'version-1', version: 1 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'chatbot-1', status: 'PUBLISHED' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'chatbot-1', status: 'PAUSED' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'chatbot-1', status: 'ARCHIVED' } }), { status: 200 }));
    const server = createBzsMcpServer('pk_test_secret', fullScopes);
    const client = new Client({ name: 'mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const graph = {
      nodes: [
        { id: 'trigger-1', type: 'trigger', data: { value: '' } },
        { id: 'end-1', type: 'end' },
      ],
      edges: [{ source: 'trigger-1', target: 'end-1' }],
    };
    const instanceId = '00000000-0000-4000-8000-000000000001';
    const chatbotId = '00000000-0000-4000-8000-000000000002';

    const created = await client.callTool({ name: 'criar_chatbot', arguments: {
      name: 'Bot de regras', instanceId, responseProvider: 'RULES', graph, idempotencyKey: 'mcp-chatbot-create-1',
    } });
    const edited = await client.callTool({ name: 'editar_chatbot', arguments: { id: chatbotId, graph } });
    const published = await client.callTool({ name: 'publicar_chatbot', arguments: { id: chatbotId } });
    const paused = await client.callTool({ name: 'alterar_status_chatbot', arguments: { id: chatbotId, status: 'PAUSED' } });
    const deleted = await client.callTool({ name: 'excluir_chatbot', arguments: { id: chatbotId } });

    expect([created, edited, published, paused, deleted].every((result) => result.isError !== true)).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/chatbots'), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': 'mcp-chatbot-create-1' }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining(`/chatbots/${chatbotId}/draft`), expect.objectContaining({ method: 'PATCH' }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, expect.stringContaining(`/chatbots/${chatbotId}/publish`), expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, expect.stringContaining(`/chatbots/${chatbotId}/status`), expect.objectContaining({ method: 'PATCH' }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, expect.stringContaining(`/chatbots/${chatbotId}`), expect.objectContaining({ method: 'DELETE' }));

    fetchMock.mockRestore();
    await Promise.all([client.close(), server.close()]);
  });

  it('aceita criar um chatbot OPENAI com o nó de atendimento por IA', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ data: { id: 'chatbot-ai-1', responseProvider: 'OPENAI' } }),
      { status: 201 },
    ));
    const server = createBzsMcpServer('pk_test_secret', fullScopes);
    const client = new Client({ name: 'mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    await client.callTool({ name: 'criar_chatbot', arguments: {
      name: 'Bot de IA',
      instanceId: '00000000-0000-4000-8000-000000000001',
      responseProvider: 'OPENAI',
      graph: {
        nodes: [
          { id: 'trigger-1', type: 'trigger', data: { operator: 'contains', value: '' } },
          { id: 'ai-1', type: 'ai_conversation', data: { objective: 'Qualificar o contato', instructions: 'Seja objetivo.', transferCriteria: 'Pedido de atendente.', maxInteractions: 6, minimumConfidence: 65, responseDelayMinSeconds: 35, responseDelayMaxSeconds: 40 } },
          { id: 'handoff-1', type: 'handoff' },
        ],
        edges: [{ source: 'trigger-1', target: 'ai-1' }, { source: 'ai-1', target: 'handoff-1' }],
      },
    } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chatbots'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"responseProvider":"OPENAI"') }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer pk_test_secret' }));

    fetchMock.mockRestore();
    await Promise.all([client.close(), server.close()]);
  });

  it('usa Idempotency-Key nas criações', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ data: { id: 'empresa-1' } }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ));
    const api = new BzsApiClient('pk_test_secret', 'http://api.test/api/v1');
    await api.post('/companies', { name: 'BZS Tecnologia' }, 'mcp-create-company-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/companies',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'mcp-create-company-1' }),
      }),
    );
    fetchMock.mockRestore();
  });

  it('continua atendendo depois de criar um registro', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ data: { id: 'empresa-1', name: 'Empresa MCP' } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ data: [{ id: 'empresa-1', name: 'Empresa MCP' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    const server = createBzsMcpServer('pk_test_secret', ['companies:read', 'companies:write']);
    const client = new Client({ name: 'mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const created = await client.callTool({
      name: 'criar_empresa',
      arguments: { name: 'Empresa MCP', idempotencyKey: 'mcp-create-company-stable' },
    });
    const listed = await client.callTool({ name: 'listar_empresas', arguments: {} });

    expect(created.isError).not.toBe(true);
    expect(listed.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockRestore();
    await Promise.all([client.close(), server.close()]);
  });
});
