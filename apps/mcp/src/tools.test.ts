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
];

describe('servidor MCP BZS One', () => {
  it('nunca declara ferramentas destrutivas', () => {
    expect(potentialToolNames).not.toContain('excluir_empresa');
    expect(potentialToolNames.every((name) => !/(excluir|apagar|arquivar|cancelar|delete|remove)/i.test(name))).toBe(true);
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

  it('encaminha leitura à API sem oferecer um método DELETE', async () => {
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
