import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { resolvePublicHttpUrl, type PublicAddress, type PublicAddressResolver } from '@prospecta/contracts/public-http-url';

const MAX_REDIRECTS = 3;

export type PublicHttpGetOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  resolveAddresses?: PublicAddressResolver;
};

export type PublicHttpGetResponse = { ok: boolean; status: number };

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

async function requestOnce(rawUrl: string, options: PublicHttpGetOptions) {
  const resolved = await resolvePublicHttpUrl(rawUrl, options.resolveAddresses);
  const transport = resolved.url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<{ status: number; location?: string }>((resolve, reject) => {
    const request = transport(resolved.url, {
      method: 'GET',
      headers: options.headers,
      signal: options.signal,
      agent: false,
      lookup: createPinnedLookup(resolved.addresses),
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      response.resume();
      response.once('end', () => resolve({ status, ...(location ? { location } : {}) }));
    });
    request.once('error', reject);
    request.end();
  });
}

export async function publicHttpGet(rawUrl: string, options: PublicHttpGetOptions = {}): Promise<PublicHttpGetResponse> {
  let target = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await requestOnce(target, options);
    const redirected = response.status >= 300 && response.status < 400 && response.location;
    if (!redirected) return { status: response.status, ok: response.status >= 200 && response.status < 300 };
    if (redirects === MAX_REDIRECTS) throw new Error('Limite de redirecionamentos excedido');
    target = new URL(response.location!, target).toString();
  }
  throw new Error('Limite de redirecionamentos excedido');
}
