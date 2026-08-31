import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { resolvePublicHttpUrl, type PublicAddress, type PublicAddressResolver } from '@prospecta/contracts/public-http-url';

const MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

export type PublicHttpGetOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  resolveAddresses?: PublicAddressResolver;
};

export type PublicHttpGetResponse = { ok: boolean; status: number };

export type PublicHttpRequestOptions = PublicHttpGetOptions & {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: string;
  maxResponseBytes?: number;
  readResponseBody?: boolean;
};

export type PublicHttpRequestResponse = PublicHttpGetResponse & {
  bodyText: string;
  contentType?: string;
};

export function createPinnedLookup(addresses: PublicAddress[]): LookupFunction {
  return ((_: string, options: { family?: number; all?: boolean }, callback: (...args: unknown[]) => void) => {
    const matching = options.family ? addresses.filter((entry) => entry.family === options.family) : addresses;
    const available = matching.length ? matching : addresses;
    if (options.all) {
      callback(null, available);
      return;
    }
    const selected = available[0]!;
    callback(null, selected.address, selected.family);
  }) as LookupFunction;
}

async function requestOnce(rawUrl: string, options: PublicHttpRequestOptions) {
  const resolved = await resolvePublicHttpUrl(rawUrl, options.resolveAddresses);
  const transport = resolved.url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<{ status: number; location?: string; bodyText: string; contentType?: string }>((resolve, reject) => {
    const request = transport(resolved.url, {
      method: options.method || 'GET',
      headers: options.headers,
      signal: options.signal,
      agent: false,
      lookup: createPinnedLookup(resolved.addresses),
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      const contentType = response.headers['content-type'];
      if (options.readResponseBody === false) {
        response.resume();
        response.once('error', reject);
        response.once('end', () => resolve({
          status,
          bodyText: '',
          ...(location ? { location } : {}),
          ...(typeof contentType === 'string' ? { contentType } : {}),
        }));
        return;
      }
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.length;
        if (receivedBytes > (options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES)) {
          request.destroy(new Error('A resposta HTTP ultrapassou o limite permitido'));
          return;
        }
        chunks.push(buffer);
      });
      response.once('error', reject);
      response.once('end', () => resolve({
        status,
        bodyText: Buffer.concat(chunks).toString('utf8'),
        ...(location ? { location } : {}),
        ...(typeof contentType === 'string' ? { contentType } : {}),
      }));
    });
    request.once('error', reject);
    request.end(options.body);
  });
}

function redirectedRequest(
  status: number,
  method: NonNullable<PublicHttpRequestOptions['method']>,
  body: string | undefined,
  headers: Record<string, string> | undefined,
) {
  if (status !== 303 && !([301, 302].includes(status) && method !== 'GET')) return { method, body, headers };
  const nextHeaders = Object.fromEntries(Object.entries(headers || {}).filter(([name]) => !['content-length', 'content-type'].includes(name.toLowerCase())));
  return { method: 'GET' as const, body: undefined, headers: nextHeaders };
}

function headersForRedirect(headers: Record<string, string> | undefined, from: string, to: string) {
  if (new URL(from).origin === new URL(to).origin) return headers;
  return Object.fromEntries(Object.entries(headers || {}).filter(([name]) => !['authorization', 'cookie', 'proxy-authorization'].includes(name.toLowerCase())));
}

export async function publicHttpRequest(rawUrl: string, options: PublicHttpRequestOptions = {}): Promise<PublicHttpRequestResponse> {
  let target = rawUrl;
  let method = options.method || 'GET';
  let body = options.body;
  let headers = options.headers;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await requestOnce(target, { ...options, method, body, headers });
    const redirected = response.status >= 300 && response.status < 400 && response.location;
    if (!redirected) {
      return {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        bodyText: response.bodyText,
        ...(response.contentType ? { contentType: response.contentType } : {}),
      };
    }
    if (redirects === MAX_REDIRECTS) throw new Error('Limite de redirecionamentos excedido');
    const nextTarget = new URL(response.location!, target).toString();
    const redirectedOptions = redirectedRequest(response.status, method, body, headersForRedirect(headers, target, nextTarget));
    target = nextTarget;
    method = redirectedOptions.method;
    body = redirectedOptions.body;
    headers = redirectedOptions.headers;
  }
  throw new Error('Limite de redirecionamentos excedido');
}

export async function publicHttpGet(rawUrl: string, options: PublicHttpGetOptions = {}): Promise<PublicHttpGetResponse> {
  const response = await publicHttpRequest(rawUrl, { ...options, method: 'GET', readResponseBody: false });
  return { status: response.status, ok: response.ok };
}
