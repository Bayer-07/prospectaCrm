import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { BzsApiClient, BzsApiError } from './api-client.js';
import { createBzsMcpServer } from './server.js';

const host = process.env.MCP_HOST || '127.0.0.1';
const port = positiveInteger(process.env.MCP_PORT, 3100);
const allowedHosts = commaList(process.env.MCP_ALLOWED_HOSTS, ['localhost', '127.0.0.1', '[::1]']);
const allowedOrigins = commaList(process.env.MCP_ALLOWED_ORIGINS, allowedHosts);
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedOrigins);

const mcpHandler = createMcpHandler(
  ({ authInfo }) => {
    if (!authInfo?.token) throw new Error('Autenticação MCP ausente');
    return createBzsMcpServer(authInfo.token, authInfo.scopes);
  },
  {
    legacy: 'stateless',
    onerror: (error) => console.error('[mcp]', error.message),
  },
);
const handleMcp = toNodeHandler(mcpHandler, {
  onerror: (error) => console.error('[mcp-adapter]', error.message),
});

const server = createServer(async (request, response) => {
  if (request.url === '/health' && request.method === 'GET') {
    return json(response, 200, { status: 'ok', service: 'bzs-one-mcp' });
  }
  if (!request.url?.startsWith('/mcp')) {
    return json(response, 404, { error: 'Not found' });
  }
  if (!validateHost(request, response) || !validateOrigin(request, response)) return;

  const token = bearerToken(request);
  if (!token?.startsWith('pk_')) {
    response.setHeader('WWW-Authenticate', 'Bearer realm="BZS One MCP"');
    return json(response, 401, { error: 'Envie uma chave de API BZS One no cabeçalho Authorization Bearer' });
  }

  try {
    const context = await new BzsApiClient(token).getContext();
    (request as IncomingMessage & { auth?: AuthInfo }).auth = {
      token,
      clientId: context.name,
      scopes: context.scopes,
    };
    await handleMcp(request, response);
  } catch (error) {
    if (response.headersSent) return;
    if (error instanceof BzsApiError) {
      const status = error.status === 401 || error.status === 403 ? error.status : 502;
      if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer realm="BZS One MCP"');
      return json(response, status, { error: error.message });
    }
    console.error('[mcp-request]', error);
    return json(response, 500, { error: 'Falha interna no servidor MCP' });
  }
});

server.listen(port, host, () => {
  console.log(`BZS One MCP ouvindo em http://${host}:${port}/mcp`);
});

function bearerToken(request: IncomingMessage) {
  const value = request.headers.authorization;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function commaList(value: string | undefined, fallback: string[]) {
  const parsed = value?.split(',').map((item) => item.trim()).filter(Boolean);
  return parsed?.length ? parsed : fallback;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
