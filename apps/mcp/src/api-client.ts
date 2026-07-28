import { randomUUID } from 'node:crypto';

type ApiMethod = 'GET' | 'POST' | 'PATCH';

export type ApiKeyContext = {
  name: string;
  scopes: string[];
};

export class BzsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BzsApiError';
  }
}

export class BzsApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly token: string,
    baseUrl = process.env.MCP_API_URL || 'http://localhost:3000/api/v1',
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  getContext() {
    return this.request<{ data: ApiKeyContext }>('/mcp/context', { method: 'GET' })
      .then((response) => response.data);
  }

  get(path: string) {
    return this.request(path, { method: 'GET' });
  }

  post(path: string, body: unknown, idempotencyKey?: string) {
    return this.request(path, {
      method: 'POST',
      body,
      idempotencyKey: idempotencyKey || randomUUID(),
    });
  }

  patch(path: string, body?: unknown) {
    return this.request(path, { method: 'PATCH', body });
  }

  private async request<T = unknown>(
    path: string,
    input: { method: ApiMethod; body?: unknown; idempotencyKey?: string },
  ): Promise<T> {
    if (!path.startsWith('/') || path.includes('..')) {
      throw new BzsApiError('Caminho interno inválido', 500);
    }
    const timeoutMs = positiveInteger(process.env.MCP_API_TIMEOUT_MS, 15_000);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: input.method,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? 'A API do BZS One demorou para responder'
        : 'Não foi possível acessar a API do BZS One';
      throw new BzsApiError(message, 502);
    }

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const apiMessage = objectMessage(data);
      throw new BzsApiError(apiMessage || `A API retornou HTTP ${response.status}`, response.status, data);
    }
    return data as T;
  }
}

function objectMessage(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const message = (value as Record<string, unknown>).message;
  if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('; ').slice(0, 2_000);
  return typeof message === 'string' ? message.slice(0, 2_000) : '';
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
