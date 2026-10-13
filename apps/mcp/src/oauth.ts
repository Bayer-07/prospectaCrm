import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';

const OAUTH_SCOPE = 'bzs';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3_600;
const MIN_ACCESS_TOKEN_TTL_SECONDS = 300;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 86_400;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60_000;

export type OAuthUserSession = {
  sessionToken: string;
  subject: string;
};

export type OAuthAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  responseType: 'code';
  scope: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  resource: string;
};

type OAuthClient = {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
};

type AuthorizationCode = OAuthAuthorizationRequest & OAuthUserSession & {
  expiresAt: number;
};

export class OAuthProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'OAuthProtocolError';
  }
}

export class OAuthProvider {
  readonly publicUrl: string;
  readonly issuer: string;
  readonly resource: string;
  readonly mcpUrl: string;
  readonly protectedResourceMetadataUrl: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint: string;

  private readonly authorizationCodes = new Map<string, AuthorizationCode>();
  private readonly encryptionKey: Uint8Array;
  private readonly accessTokenTtlSeconds: number;

  constructor(options: {
    publicUrl: string;
    issuer?: string;
    resource?: string;
    secret?: string;
    accessTokenTtlSeconds?: number;
  }) {
    this.publicUrl = absoluteBaseUrl(options.publicUrl, 'MCP_PUBLIC_URL');
    this.issuer = absoluteBaseUrl(options.issuer || this.publicUrl, 'MCP_OAUTH_ISSUER');
    this.resource = absoluteUrl(options.resource || this.publicUrl, 'MCP_OAUTH_RESOURCE');
    this.mcpUrl = `${this.publicUrl}/mcp`;
    this.protectedResourceMetadataUrl = `${this.publicUrl}/.well-known/oauth-protected-resource`;
    this.authorizationEndpoint = `${this.issuer}/oauth/authorize`;
    this.tokenEndpoint = `${this.issuer}/oauth/token`;
    this.registrationEndpoint = `${this.issuer}/oauth/register`;

    if (process.env.NODE_ENV === 'production' && !this.publicUrl.startsWith('https://')) {
      throw new Error('MCP_PUBLIC_URL precisa usar HTTPS em produção');
    }

    const secret = options.secret || process.env.MCP_OAUTH_SECRET || process.env.SESSION_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('MCP_OAUTH_SECRET ou SESSION_SECRET precisa ser configurado em produção');
    }
    this.encryptionKey = createHash('sha256')
      .update(secret || 'bzs-one-development-oauth-secret-change-me')
      .digest();
    this.accessTokenTtlSeconds = boundedInteger(
      options.accessTokenTtlSeconds ?? Number(process.env.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS),
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      MIN_ACCESS_TOKEN_TTL_SECONDS,
      MAX_ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  protectedResourceMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.issuer],
      scopes_supported: [OAUTH_SCOPE],
    };
  }

  authorizationServerMetadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: this.authorizationEndpoint,
      token_endpoint: this.tokenEndpoint,
      registration_endpoint: this.registrationEndpoint,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [OAUTH_SCOPE],
      client_id_metadata_document_supported: false,
      authorization_response_iss_parameter_supported: true,
    };
  }

  registerClient(input: unknown) {
    const body = asRecord(input);
    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
      throw new OAuthProtocolError('invalid_client_metadata', 'redirect_uris é obrigatório');
    }
    const normalizedRedirectUris = redirectUris.map((value) => {
      if (typeof value !== 'string') throw new OAuthProtocolError('invalid_client_metadata', 'redirect_uris contém um valor inválido');
      return validateRedirectUri(value);
    });
    const client: OAuthClient = {
      clientId: '',
      clientName: typeof body.client_name === 'string' ? body.client_name.slice(0, 160) : undefined,
      redirectUris: normalizedRedirectUris,
    };
    client.clientId = this.createClientId(client);
    return {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  validateAuthorizationRequest(params: URLSearchParams): OAuthAuthorizationRequest {
    this.pruneExpired();
    const clientId = requiredParam(params, 'client_id');
    const client = this.clientFromId(clientId);
    if (!client) throw new OAuthProtocolError('invalid_client', 'Cliente OAuth desconhecido', 400);

    const redirectUri = requiredParam(params, 'redirect_uri');
    if (!client.redirectUris.includes(redirectUri)) {
      throw new OAuthProtocolError('invalid_request', 'redirect_uri não está registrado para este cliente');
    }

    if (params.get('response_type') !== 'code') {
      throw new OAuthProtocolError('unsupported_response_type', 'Apenas response_type=code é suportado');
    }

    const codeChallenge = requiredParam(params, 'code_challenge');
    if (params.get('code_challenge_method') !== 'S256') {
      throw new OAuthProtocolError('invalid_request', 'PKCE precisa usar code_challenge_method=S256');
    }

    const requestedScopes = (params.get('scope') || OAUTH_SCOPE).split(/\s+/u).filter(Boolean);
    if (requestedScopes.some((scope) => scope !== OAUTH_SCOPE)) {
      throw new OAuthProtocolError('invalid_scope', `Escopo não suportado. Use ${OAUTH_SCOPE}`);
    }

    const resource = params.get('resource') || this.resource;
    if (resource !== this.resource && resource !== this.mcpUrl) {
      throw new OAuthProtocolError('invalid_target', 'O recurso solicitado não corresponde a este MCP');
    }

    return {
      clientId,
      redirectUri,
      responseType: 'code',
      scope: OAUTH_SCOPE,
      state: optionalParam(params, 'state'),
      codeChallenge,
      codeChallengeMethod: 'S256',
      resource: this.resource,
    };
  }

  canRedirect(params: URLSearchParams) {
    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    return Boolean(clientId && redirectUri && this.clientFromId(clientId)?.redirectUris.includes(redirectUri));
  }

  authorizationErrorRedirect(params: URLSearchParams, error: OAuthProtocolError) {
    const redirectUri = params.get('redirect_uri');
    if (!redirectUri || !this.canRedirect(params)) return undefined;
    const target = new URL(redirectUri);
    target.searchParams.set('error', error.code);
    target.searchParams.set('error_description', error.message);
    const state = params.get('state');
    if (state) target.searchParams.set('state', state);
    target.searchParams.set('iss', this.issuer);
    return target.toString();
  }

  createAuthorizationCode(request: OAuthAuthorizationRequest, session: OAuthUserSession) {
    this.pruneExpired();
    const code = randomBytes(32).toString('base64url');
    this.authorizationCodes.set(code, {
      ...request,
      ...session,
      expiresAt: Date.now() + AUTHORIZATION_CODE_TTL_MS,
    });
    return code;
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    resource?: string;
  }) {
    this.pruneExpired();
    const code = this.authorizationCodes.get(input.code);
    this.authorizationCodes.delete(input.code);
    if (!code || code.expiresAt <= Date.now()) {
      throw new OAuthProtocolError('invalid_grant', 'Código de autorização inválido ou expirado');
    }
    if (code.clientId !== input.clientId || code.redirectUri !== input.redirectUri) {
      throw new OAuthProtocolError('invalid_grant', 'O código não pertence a este cliente');
    }
    if (input.resource && input.resource !== this.resource && input.resource !== this.mcpUrl) {
      throw new OAuthProtocolError('invalid_target', 'O recurso solicitado não corresponde a este MCP');
    }
    const expectedChallenge = base64Url(createHash('sha256').update(input.codeVerifier).digest());
    if (!constantTimeEqual(expectedChallenge, code.codeChallenge)) {
      throw new OAuthProtocolError('invalid_grant', 'code_verifier inválido');
    }

    const issuedAt = Math.floor(Date.now() / 1_000);
    const accessToken = await new EncryptJWT({
      sub: code.subject,
      scope: code.scope,
      client_id: code.clientId,
      bzs_session: code.sessionToken,
    })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'oauth-at+jwt' })
      .setIssuer(this.issuer)
      .setAudience(this.resource)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.accessTokenTtlSeconds)
      .encrypt(this.encryptionKey);

    return {
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: this.accessTokenTtlSeconds,
      scope: code.scope,
    };
  }

  async verifyAccessToken(accessToken: string) {
    try {
      const { payload } = await jwtDecrypt(accessToken, this.encryptionKey, {
        issuer: this.issuer,
        audience: this.resource,
        clockTolerance: 5,
      });
      if (typeof payload.bzs_session !== 'string' || typeof payload.sub !== 'string') return undefined;
      return {
        sessionToken: payload.bzs_session,
        subject: payload.sub,
        clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
        scope: typeof payload.scope === 'string' ? payload.scope : OAUTH_SCOPE,
      };
    } catch {
      return undefined;
    }
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [code, value] of this.authorizationCodes) {
      if (value.expiresAt <= now) this.authorizationCodes.delete(code);
    }
  }

  private createClientId(client: OAuthClient) {
    const payload = Buffer.from(JSON.stringify({
      version: 1,
      id: randomBytes(18).toString('base64url'),
      clientName: client.clientName,
      redirectUris: client.redirectUris,
    })).toString('base64url');
    const signature = base64Url(createHmac('sha256', this.encryptionKey).update(payload).digest());
    return `bzsone_${payload}.${signature}`;
  }

  private clientFromId(clientId: string): OAuthClient | undefined {
    if (!clientId.startsWith('bzsone_')) return undefined;
    const encoded = clientId.slice('bzsone_'.length);
    const separator = encoded.lastIndexOf('.');
    if (separator <= 0) return undefined;
    const payload = encoded.slice(0, separator);
    const signature = encoded.slice(separator + 1);
    const expected = base64Url(createHmac('sha256', this.encryptionKey).update(payload).digest());
    if (!constantTimeEqual(signature, expected)) return undefined;
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (value.version !== 1 || typeof value.id !== 'string' || !Array.isArray(value.redirectUris)) return undefined;
      const redirectUris = value.redirectUris.filter((item): item is string => typeof item === 'string');
      if (redirectUris.length !== value.redirectUris.length || redirectUris.length === 0) return undefined;
      return {
        clientId,
        clientName: typeof value.clientName === 'string' ? value.clientName : undefined,
        redirectUris,
      };
    } catch {
      return undefined;
    }
  }
}

function absoluteBaseUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new Error(`${label} precisa ser uma origem sem caminho, credenciais ou query string`);
  }
  return url.origin;
}

function absoluteUrl(value: string, label: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error(`${label} precisa ser uma URL HTTP(S) válida`);
  }
  return url.toString().replace(/\/$/u, '');
}

function validateRedirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthProtocolError('invalid_client_metadata', 'redirect_uris contém uma URL inválida');
  }
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new OAuthProtocolError('invalid_client_metadata', 'redirect_uris precisa usar HTTPS');
  }
  if (url.username || url.password || url.hash) {
    throw new OAuthProtocolError('invalid_client_metadata', 'redirect_uris não pode conter credenciais ou fragmentos');
  }
  return url.toString();
}

function requiredParam(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim();
  if (!value) throw new OAuthProtocolError('invalid_request', `${name} é obrigatório`);
  return value;
}

function optionalParam(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim();
  return value || undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OAuthProtocolError('invalid_client_metadata', 'Payload JSON inválido');
  }
  return value as Record<string, unknown>;
}

function base64Url(value: Uint8Array) {
  return Buffer.from(value).toString('base64url');
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && leftBytes.length > 0 && timingSafeEqual(leftBytes, rightBytes);
}

function boundedInteger(value: number, fallback: number, min: number, max: number) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}
