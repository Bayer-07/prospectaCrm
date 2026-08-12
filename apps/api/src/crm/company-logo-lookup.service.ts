import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const HTML_LIMIT_BYTES = 1024 * 1024;
const LOGO_LIMIT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 4;
const CACHE_TTL_MS = 30 * 60_000;
const EMPTY_CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 100;
const CACHE_MAX_BYTES = 20 * 1024 * 1024;

type LogoCandidate = { score: number; url: string };

export type CompanyLogoLookup = {
  domain: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/x-icon';
  dataUrl: string;
  filename: string;
  sourceUrl: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function readAttributeValue(tag: string, start: number) {
  let cursor = start;
  while (cursor < tag.length && /\s/u.test(tag[cursor] ?? '')) cursor += 1;
  if (tag[cursor] !== '=') return { value: '', next: cursor };
  cursor += 1;
  while (cursor < tag.length && /\s/u.test(tag[cursor] ?? '')) cursor += 1;
  const quote = tag[cursor];
  if (quote === '"' || quote === "'") {
    const end = tag.indexOf(quote, cursor + 1);
    return end < 0
      ? { value: tag.slice(cursor + 1), next: tag.length }
      : { value: tag.slice(cursor + 1, end), next: end + 1 };
  }
  let end = cursor;
  while (end < tag.length && !/[\s>]/u.test(tag[end] ?? '')) end += 1;
  return { value: tag.slice(cursor, end), next: end };
}

function attribute(tag: string, name: string) {
  const target = name.toLowerCase();
  let cursor = 0;
  while (cursor < tag.length) {
    while (cursor < tag.length && /[\s</>]/u.test(tag[cursor] ?? '')) cursor += 1;
    const start = cursor;
    while (cursor < tag.length && !/[\s=/>]/u.test(tag[cursor] ?? '')) cursor += 1;
    const key = tag.slice(start, cursor).toLowerCase();
    const result = readAttributeValue(tag, cursor);
    if (key === target) return decodeHtml(result.value).trim();
    cursor = result.next > cursor ? result.next : cursor + 1;
  }
  return '';
}

function absoluteHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function directLogo(record: Record<string, unknown>) {
  const logo = record.logo;
  if (typeof logo === 'string') return logo;
  if (!logo || typeof logo !== 'object') return undefined;
  const logoRecord = logo as Record<string, unknown>;
  if (typeof logoRecord.url === 'string') return logoRecord.url;
  return typeof logoRecord.contentUrl === 'string' ? logoRecord.contentUrl : undefined;
}

function jsonLogo(value: unknown, depth = 0): string | undefined {
  if (depth > 8 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = jsonLogo(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const direct = directLogo(record);
  if (direct) return direct;
  for (const nested of Object.values(record)) {
    const found = jsonLogo(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function appendCandidate(candidates: LogoCandidate[], value: string, score: number, baseUrl: string) {
  const url = absoluteHttpUrl(value, baseUrl);
  if (url) candidates.push({ score, url });
}

function appendJsonLdCandidates(candidates: LogoCandidate[], html: string, baseUrl: string) {
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const logo = jsonLogo(JSON.parse(match[1]?.trim() || 'null'));
      if (logo) appendCandidate(candidates, logo, 1_000, baseUrl);
    } catch {
      // JSON-LD inválido não deve impedir os demais fallbacks.
    }
  }
}

function appendImageCandidates(candidates: LogoCandidate[], html: string, baseUrl: string) {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const semanticText = `${attribute(tag, 'id')} ${attribute(tag, 'class')} ${attribute(tag, 'alt')}`;
    if (/\blogo\b/i.test(semanticText)) appendCandidate(candidates, attribute(tag, 'src'), 900, baseUrl);
  }
}

function largestDeclaredIconSize(sizes: string) {
  let largest = 0;
  for (const item of sizes.toLowerCase().split(/\s+/u)) {
    const separator = item.indexOf('x');
    if (separator <= 0) continue;
    largest = Math.max(largest, Number(item.slice(0, separator)) || 0, Number(item.slice(separator + 1)) || 0);
  }
  return largest;
}

function appendIconCandidates(candidates: LogoCandidate[], html: string, baseUrl: string) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attribute(tag, 'rel').toLowerCase();
    if (!rel.split(/\s+/u).includes('icon')) continue;
    const size = largestDeclaredIconSize(attribute(tag, 'sizes'));
    const score = rel.includes('apple-touch-icon') ? 800 + size : 600 + size;
    appendCandidate(candidates, attribute(tag, 'href'), score, baseUrl);
  }
}

function appendMetadataCandidates(candidates: LogoCandidate[], html: string, baseUrl: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase();
    if (!['og:image', 'og:image:url', 'og:image:secure_url'].includes(property)) continue;
    const score = property === 'og:image:secure_url' ? 510 : 500;
    appendCandidate(candidates, attribute(tag, 'content'), score, baseUrl);
  }
}

export function extractCompanyLogoCandidates(html: string, baseUrl: string) {
  const candidates: LogoCandidate[] = [];
  appendJsonLdCandidates(candidates, html, baseUrl);
  appendImageCandidates(candidates, html, baseUrl);
  appendIconCandidates(candidates, html, baseUrl);
  appendMetadataCandidates(candidates, html, baseUrl);
  appendCandidate(candidates, '/favicon.ico', 100, baseUrl);
  const unique = new Map<string, LogoCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.score > existing.score) unique.set(candidate.url, candidate);
  }
  return [...unique.values()].sort((left, right) => right.score - left.score);
}

export function normalizeCompanyDomain(value: unknown) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw || raw.length > 253 || /\s/.test(raw)) throw new BadRequestException('Informe um domínio válido');
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new BadRequestException('Informe um domínio válido');
  }
  const hostname = url.hostname.replace(/\.$/, '');
  if (
    !hostname.includes('.')
    || hostname === 'localhost'
    || hostname.endsWith('.local')
    || isIP(hostname)
    || url.username
    || url.password
    || (url.port && url.port !== '80' && url.port !== '443')
    || !/^[a-z0-9.-]+$/i.test(hostname)
  ) {
    throw new BadRequestException('Informe um domínio público válido');
  }
  return hostname;
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split('%', 1)[0] || '';
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
  if (normalized.includes(':')) {
    return normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith('2001:db8:');
  }
  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second, third] = octets;
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113);
}

function detectedImageType(buffer: Buffer, header: string | null): CompanyLogoLookup['contentType'] | undefined {
  const type = (header || '').split(';', 1)[0]?.trim().toLowerCase();
  if (type === 'image/jpg' || type === 'image/jpeg') return 'image/jpeg';
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';
  if (type === 'image/x-icon' || type === 'image/vnd.microsoft.icon') return 'image/x-icon';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0) return 'image/x-icon';
  return undefined;
}

function extensionFor(contentType: CompanyLogoLookup['contentType']) {
  const extensions: Record<CompanyLogoLookup['contentType'], string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/x-icon': 'ico',
  };
  return extensions[contentType];
}

@Injectable()
export class CompanyLogoLookupService {
  private readonly cache = new Map<string, {
    expiresAt: number;
    sizeBytes: number;
    value: CompanyLogoLookup | null;
  }>();
  private cacheBytes = 0;

  private async logoFromCandidate(domain: string, candidate: LogoCandidate) {
    try {
      const image = await this.fetchResource(candidate.url, LOGO_LIMIT_BYTES, 'image/*');
      const contentType = detectedImageType(image.buffer, image.contentType);
      if (!contentType || image.buffer.length < 32) return null;
      return {
        domain,
        contentType,
        dataUrl: `data:${contentType};base64,${image.buffer.toString('base64')}`,
        filename: `logo-${domain.replace(/[^a-z0-9.-]/gi, '-')}.${extensionFor(contentType)}`,
        sourceUrl: image.finalUrl,
      } satisfies CompanyLogoLookup;
    } catch {
      return null;
    }
  }

  private async logoFromWebsite(domain: string, websiteUrl: string) {
    const website = await this.fetchResource(websiteUrl, HTML_LIMIT_BYTES, 'text/html,application/xhtml+xml');
    const htmlType = website.contentType.split(';', 1)[0]?.trim().toLowerCase();
    if (htmlType && !['text/html', 'application/xhtml+xml'].includes(htmlType)) return null;
    const candidates = extractCompanyLogoCandidates(website.buffer.toString('utf8'), website.finalUrl).slice(0, 10);
    for (const candidate of candidates) {
      const logo = await this.logoFromCandidate(domain, candidate);
      if (logo) return logo;
    }
    return null;
  }

  private async findLogo(domain: string) {
    for (const websiteUrl of [`https://${domain}/`, `http://${domain}/`]) {
      try {
        const logo = await this.logoFromWebsite(domain, websiteUrl);
        if (logo) return logo;
      } catch {
        // Tenta HTTP apenas quando HTTPS ou a leitura do site falhar.
      }
    }
    return null;
  }

  private cacheLookup(domain: string, value: CompanyLogoLookup | null) {
    const sizeBytes = value ? Buffer.byteLength(value.dataUrl, 'utf8') : 0;
    while (
      this.cache.size >= CACHE_MAX_ENTRIES
      || (this.cache.size > 0 && this.cacheBytes + sizeBytes > CACHE_MAX_BYTES)
    ) {
      this.removeCached(this.cache.keys().next().value as string);
    }
    if (sizeBytes > CACHE_MAX_BYTES) return;
    this.cache.set(domain, {
      expiresAt: Date.now() + (value ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
      sizeBytes,
      value,
    });
    this.cacheBytes += sizeBytes;
  }

  async lookup(rawDomain: unknown) {
    const domain = normalizeCompanyDomain(rawDomain);
    const cached = this.cache.get(domain);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.removeCached(domain);

    const value = await this.findLogo(domain);
    this.cacheLookup(domain, value);
    return value;
  }

  private removeCached(domain: string) {
    const cached = this.cache.get(domain);
    if (!cached) return;
    this.cacheBytes = Math.max(0, this.cacheBytes - cached.sizeBytes);
    this.cache.delete(domain);
  }

  private async ensurePublicUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.username
      || url.password
      || (url.port && url.port !== '80' && url.port !== '443')
      || isIP(url.hostname)
    ) throw new Error('Destino externo inválido');
    const addresses = await dnsLookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error('Destino externo bloqueado');
    return url;
  }

  private async requestResource(safeUrl: URL, accept: string) {
    return fetch(safeUrl, {
      redirect: 'manual',
      headers: {
        Accept: accept,
        'User-Agent': 'Mozilla/5.0 (compatible; BZS-One-LogoBot/1.0; +internal CRM)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private redirectTarget(response: Response, safeUrl: URL, redirects: number) {
    if (response.status < 300 || response.status >= 400) return undefined;
    const location = response.headers.get('location');
    if (!location || redirects === MAX_REDIRECTS) throw new Error('Redirecionamento inválido');
    return new URL(location, safeUrl).toString();
  }

  private async readResponseBuffer(response: Response, limitBytes: number) {
    if (!response.ok) throw new Error(`Resposta HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > limitBytes) throw new Error('Conteúdo externo muito grande');
    if (!response.body) throw new Error('Resposta externa vazia');
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limitBytes) {
        await reader.cancel();
        throw new Error('Conteúdo externo muito grande');
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  }

  private async fetchResource(rawUrl: string, limitBytes: number, accept: string) {
    let current = rawUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const safeUrl = await this.ensurePublicUrl(current);
      const response = await this.requestResource(safeUrl, accept);
      const redirect = this.redirectTarget(response, safeUrl, redirects);
      if (redirect) {
        current = redirect;
        continue;
      }
      return {
        buffer: await this.readResponseBuffer(response, limitBytes),
        contentType: response.headers.get('content-type') || '',
        finalUrl: safeUrl.toString(),
      };
    }
    throw new Error('Limite de redirecionamentos excedido');
  }
}
