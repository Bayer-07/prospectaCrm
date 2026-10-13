import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { BzsApiClient, BzsApiError } from './api-client.js';
import { OAuthProvider, OAuthProtocolError, type OAuthAuthorizationRequest } from './oauth.js';
import { createBzsMcpServer } from './server.js';

const host = process.env.MCP_HOST || '127.0.0.1';
const port = positiveInteger(process.env.MCP_PORT, 3100);
const allowedHosts = commaList(process.env.MCP_ALLOWED_HOSTS, ['localhost', '127.0.0.1', '[::1]']);
const allowedOrigins = commaList(process.env.MCP_ALLOWED_ORIGINS, allowedHosts);
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedOrigins);
const publicUrl = process.env.MCP_PUBLIC_URL || process.env.APP_ADDRESS || `http://localhost:${port}`;
const oauth = new OAuthProvider({ publicUrl });

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

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    console.error('[mcp-request-unhandled]', error);
    if (!response.headersSent) {
      json(response, 500, { error: 'Falha interna no servidor MCP' });
    } else if (!response.writableEnded) {
      response.destroy();
    }
  });
});

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = request.url || '/';
  if (requestUrl === '/health' && request.method === 'GET') {
    return json(response, 200, { status: 'ok', service: 'bzs-one-mcp' });
  }

  if (isOAuthPath(requestUrl)) {
    if (!validateHost(request, response)) return;
    return handleOAuthRequest(request, response);
  }

  if (!requestUrl.startsWith('/mcp')) {
    return json(response, 404, { error: 'Not found' });
  }
  if (!validateHost(request, response) || !validateOrigin(request, response)) return;

  const authenticated = await authenticateMcpRequest(request);
  if (!authenticated) return unauthorized(response);

  try {
    const context = await new BzsApiClient(authenticated.apiToken).getContext();
    (request as IncomingMessage & { auth?: AuthInfo }).auth = {
      token: authenticated.apiToken,
      clientId: context.name,
      scopes: context.scopes,
    };
    await handleMcp(request, response);
  } catch (error) {
    if (response.headersSent) return;
    return respondRequestError(response, error);
  }
}

async function handleOAuthRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
    return json(response, 200, oauth.protectedResourceMetadata());
  }
  if (request.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
    return json(response, 200, oauth.authorizationServerMetadata());
  }
  if (request.method === 'POST' && url.pathname === '/oauth/register') {
    return handleOAuthRegistration(request, response);
  }
  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/oauth/authorize') {
    return handleOAuthAuthorization(request, response, url);
  }
  if (request.method === 'POST' && url.pathname === '/oauth/token') {
    return handleOAuthToken(request, response);
  }
  return json(response, 404, { error: 'Not found' });
}

async function handleOAuthRegistration(request: IncomingMessage, response: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(request));
    return json(response, 201, oauth.registerClient(body));
  } catch (error) {
    return oauthError(response, error);
  }
}

async function handleOAuthAuthorization(request: IncomingMessage, response: ServerResponse, initialUrl: URL) {
  const params = request.method === 'GET'
    ? initialUrl.searchParams
    : new URLSearchParams(await readBody(request));

  let authorizationRequest: OAuthAuthorizationRequest;
  try {
    authorizationRequest = oauth.validateAuthorizationRequest(params);
  } catch (error) {
    return authorizationError(response, params, error);
  }

  if (request.method === 'GET') {
    return html(response, 200, renderAuthorizationPage(authorizationRequest));
  }

  const email = params.get('email')?.trim() || '';
  const password = params.get('password') || '';
  if (!email || !password) {
    return html(response, 400, renderAuthorizationPage(authorizationRequest, 'Informe seu e-mail e sua senha para continuar.'));
  }

  try {
    const session = await authenticateOAuthUser(email, password);
    const code = oauth.createAuthorizationCode(authorizationRequest, session);
    const redirect = new URL(authorizationRequest.redirectUri);
    redirect.searchParams.set('code', code);
    if (authorizationRequest.state) redirect.searchParams.set('state', authorizationRequest.state);
    redirect.searchParams.set('iss', oauth.issuer);
    response.writeHead(302, { Location: redirect.toString(), 'Cache-Control': 'no-store' });
    response.end();
  } catch (error) {
    const message = error instanceof BzsApiError && error.status === 401
      ? 'E-mail ou senha inválidos.'
      : 'Não foi possível concluir a autorização agora. Tente novamente.';
    return html(response, 401, renderAuthorizationPage(authorizationRequest, message));
  }
}

async function handleOAuthToken(request: IncomingMessage, response: ServerResponse) {
  try {
    const params = new URLSearchParams(await readBody(request));
    if (params.get('grant_type') !== 'authorization_code') {
      throw new OAuthProtocolError('unsupported_grant_type', 'Apenas authorization_code é suportado');
    }
    return json(response, 200, await oauth.exchangeAuthorizationCode({
      code: requiredFormParam(params, 'code'),
      clientId: requiredFormParam(params, 'client_id'),
      redirectUri: requiredFormParam(params, 'redirect_uri'),
      codeVerifier: requiredFormParam(params, 'code_verifier'),
      resource: params.get('resource') || undefined,
    }));
  } catch (error) {
    return oauthError(response, error);
  }
}

async function authenticateOAuthUser(email: string, password: string) {
  const login = await new BzsApiClient('').login(email, password);
  const context = await new BzsApiClient(login.token).getContext();
  if (!context.userId) throw new BzsApiError('A sessão não está vinculada a um usuário', 502);
  return { sessionToken: login.token, subject: context.userId };
}

async function authenticateMcpRequest(request: IncomingMessage) {
  const token = bearerToken(request);
  if (!token) return undefined;
  if (token.startsWith('pk_')) return { apiToken: token };
  const accessToken = await oauth.verifyAccessToken(token);
  return accessToken ? { apiToken: accessToken.sessionToken } : undefined;
}

function respondRequestError(response: ServerResponse, error: unknown) {
  if (error instanceof BzsApiError) {
    const status = error.status === 401 || error.status === 403 ? error.status : 502;
    if (status === 401) unauthorized(response);
    else json(response, status, { error: error.message });
    return;
  }
  console.error('[mcp-request]', error);
  json(response, 500, { error: 'Falha interna no servidor MCP' });
}

function authorizationError(response: ServerResponse, params: URLSearchParams, error: unknown) {
  const protocolError = toOAuthError(error);
  const redirect = oauth.authorizationErrorRedirect(params, protocolError);
  if (redirect) {
    response.writeHead(302, { Location: redirect, 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  return oauthError(response, protocolError);
}

function oauthError(response: ServerResponse, error: unknown) {
  const protocolError = toOAuthError(error);
  return json(response, protocolError.status, {
    error: protocolError.code,
    error_description: protocolError.message,
  });
}

function toOAuthError(error: unknown) {
  if (error instanceof OAuthProtocolError) return error;
  if (error instanceof SyntaxError) return new OAuthProtocolError('invalid_request', 'Payload JSON inválido');
  return new OAuthProtocolError('server_error', 'Falha interna no servidor OAuth', 500);
}

function renderAuthorizationPage(request: OAuthAuthorizationRequest, error?: string) {
  const fields = [
    ['client_id', request.clientId],
    ['redirect_uri', request.redirectUri],
    ['response_type', request.responseType],
    ['scope', request.scope],
    ['state', request.state],
    ['code_challenge', request.codeChallenge],
    ['code_challenge_method', request.codeChallengeMethod],
    ['resource', request.resource],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
  const errorMarkup = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Conectar ao BZS One</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #10141f; color: #f4f6fb; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
      main { width: min(100%, 420px); padding: 32px; border: 1px solid #2d3548; border-radius: 18px; background: #171d2b; box-shadow: 0 20px 60px #0005; }
      h1 { margin: 0 0 10px; font-size: 26px; } p { color: #b9c2d5; line-height: 1.5; }
      label { display: block; margin: 18px 0 7px; color: #d8deeb; font-size: 14px; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #3b465d; border-radius: 10px; padding: 12px; background: #0f1420; color: #fff; font: inherit; }
      button { width: 100%; margin-top: 24px; border: 0; border-radius: 10px; padding: 13px; background: #4f7cff; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .error { margin: 16px 0; padding: 12px; border-radius: 10px; background: #542631; color: #ffd8dd; }
      small { display: block; margin-top: 18px; color: #8f9ab0; line-height: 1.45; }
    </style>
  </head>
  <body>
    <main>
      <h1>Conectar ao BZS One</h1>
      <p>Autorize o ChatGPT a consultar e atualizar os dados do seu BZS One.</p>
      ${errorMarkup}
      <form method="post" action="/oauth/authorize" autocomplete="on">
        ${fields}
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required autofocus>
        <label for="password">Senha</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Autorizar acesso</button>
      </form>
      <small>Suas credenciais são usadas apenas para criar uma sessão segura do BZS One e não são armazenadas pelo servidor MCP.</small>
    </main>
  </body>
</html>`;
}

function isOAuthPath(value: string) {
  const path = value.split('?', 1)[0];
  return path.startsWith('/oauth/') || path.startsWith('/.well-known/oauth-');
}

function bearerToken(request: IncomingMessage) {
  const value = request.headers.authorization;
  if (!value) return undefined;
  const separator = value.indexOf(' ');
  if (separator < 0 || value.slice(0, separator).toLowerCase() !== 'bearer') return undefined;
  return value.slice(separator + 1).trim() || undefined;
}

function unauthorized(response: ServerResponse) {
  response.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${oauth.protectedResourceMetadataUrl}", scope="bzs"`,
  );
  return json(response, 401, { error: 'Autorização necessária para acessar o BZS One MCP' });
}

function requiredFormParam(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim();
  if (!value) throw new OAuthProtocolError('invalid_request', `${name} é obrigatório`);
  return value;
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
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function html(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(body);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new OAuthProtocolError('invalid_request', 'Payload muito grande', 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

server.listen(port, host, () => {
  console.log(`BZS One MCP ouvindo em http://${host}:${port}/mcp`);
  console.log(`BZS One OAuth issuer: ${oauth.issuer}`);
});
