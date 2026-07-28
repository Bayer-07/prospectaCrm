import { McpServer } from '@modelcontextprotocol/server';
import { BzsApiClient } from './api-client.js';
import { registerBzsTools } from './tools.js';

export function createBzsMcpServer(token: string, scopes: string[]) {
  const server = new McpServer(
    { name: 'bzs-one', version: '0.1.0' },
    {
      instructions: [
        'Use este servidor para ler, criar e editar informações do BZS One.',
        'Nenhuma ferramenta de exclusão, arquivamento ou cancelamento é disponibilizada.',
        'Antes de criar vínculos, liste os registros relacionados e use os UUIDs retornados.',
        'Para criações que possam ser repetidas, informe externalId e uma idempotencyKey estável.',
      ].join(' '),
      cacheHints: {
        'tools/list': { ttlMs: 60_000, cacheScope: 'private' },
      },
    },
  );
  const api = new BzsApiClient(token);
  registerBzsTools(server, api, scopes);
  return server;
}
