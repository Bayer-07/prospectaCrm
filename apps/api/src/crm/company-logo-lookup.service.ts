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

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function absoluteHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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
  const logo = record.logo;
  if (typeof logo === 'string') return logo;
  if (logo && typeof logo === 'object') {
    const logoRecord = logo as Record<string, unknown>;
    if (typeof logoRecord.url === 'string') return logoRecord.url;
    if (typeof logoRecord.contentUrl === 'string') return logoRecord.contentUrl;
  }
  for (const nested of Object.values(record)) {
    const found = jsonLogo(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function extractCompanyLogoCandidates(html: string, baseUrl: string) {
  const candidates: LogoCandidate[] = [];
  const add = (value: string, score: number) => {
    const url = absoluteHttpUrl(value, baseUrl);
    if (url) candidates.push({ score, url });
  };

  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const logo = jsonLogo(JSON.parse(match[1]?.trim() || 'null'));
      if (logo) add(logo, 1_000);
    } catch {
      // JSON-LD inválido não deve impedir os demais fallbacks.
    }
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const semanticText = `${attribute(tag, 'id')} ${attribute(tag, 'class')} ${attribute(tag, 'alt')}`;
    if (/\blogo\b/i.test(semanticText)) add(attribute(tag, 'src'), 900);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attribute(tag, 'rel').toLowerCase();
    if (!rel.split(/\s+/).includes('icon')) continue;
    const sizes = attribute(tag, 'sizes');
    const size = [...sizes.matchAll(/(\d+)x(\d+)/gi)].reduce((largest, item) => {
      return Math.max(largest, Number(item[1]) || 0, Number(item[2]) || 0);
    }, 0);
    add(attribute(tag, 'href'), rel.includes('apple-touch-icon') ? 800 + size : 600 + size);
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase();
    if (property === 'og:image' || property === 'og:image:url' || property === 'og:image:secure_url') {
      add(attribute(tag, 'content'), property === 'og:image:secure_url' ? 510 : 500);
    }
  }

  add('/favicon.ico', 100);
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
  return contentType === 'image/jpeg' ? 'jpg'
    : contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp' : 'ico';
}

@Injectable()
export class CompanyLogoLookupService {
  private readonly cache = new Map<string, {
    expiresAt: number;
    sizeBytes: number;
    value: CompanyLogoLookup | null;
  }>();
  private cacheBytes = 0;

  async lookup(rawDomain: unknown) {
    const domain = normalizeCompanyDomain(rawDomain);
    const cached = this.cache.get(domain);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.removeCached(domain);

    let value: CompanyLogoLookup | null = null;
    for (const websiteUrl of [`https://${domain}/`, `http://${domain}/`]) {
      try {
        const website = await this.fetchResource(websiteUrl, HTML_LIMIT_BYTES, 'text/html,application/xhtml+xml');
        const htmlType = website.contentType.split(';', 1)[0]?.trim().toLowerCase();
        if (htmlType && htmlType !== 'text/html' && htmlType !== 'application/xhtml+xml') continue;
        const html = website.buffer.toString('utf8');
        const candidates = extractCompanyLogoCandidates(html, website.finalUrl).slice(0, 10);
        for (const candidate of candidates) {
          try {
            const image = await this.fetchResource(candidate.url, LOGO_LIMIT_BYTES, 'image/*');
            const contentType = detectedImageType(image.buffer, image.contentType);
            if (!contentType || image.buffer.length < 32) continue;
            value = {
              domain,
              contentType,
              dataUrl: `data:${contentType};base64,${image.buffer.toString('base64')}`,
              filename: `logo-${domain.replace(/[^a-z0-9.-]/gi, '-')}.${extensionFor(contentType)}`,
              sourceUrl: image.finalUrl,
            };
            break;
          } catch {
            // Tenta o próximo candidato declarado pelo site.
          }
        }
        if (value) break;
      } catch {
        // Tenta HTTP apenas quando HTTPS ou a leitura do site falhar.
      }
    }

    const sizeBytes = value ? Buffer.byteLength(value.dataUrl, 'utf8') : 0;
    while (
      this.cache.size >= CACHE_MAX_ENTRIES
      || (this.cache.size > 0 && this.cacheBytes + sizeBytes > CACHE_MAX_BYTES)
    ) {
      this.removeCached(this.cache.keys().next().value as string);
    }
    if (sizeBytes <= CACHE_MAX_BYTES) {
      this.cache.set(domain, {
        expiresAt: Date.now() + (value ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
        sizeBytes,
        value,
      });
      this.cacheBytes += sizeBytes;
    }
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

  private async fetchResource(rawUrl: string, limitBytes: number, accept: string) {
    let current = rawUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const safeUrl = await this.ensurePublicUrl(current);
      const response = await fetch(safeUrl, {
        redirect: 'manual',
        headers: {
          Accept: accept,
          'User-Agent': 'Mozilla/5.0 (compatible; BZS-One-LogoBot/1.0; +internal CRM)',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) throw new Error('Redirecionamento inválido');
        current = new URL(location, safeUrl).toString();
        continue;
      }
      if (!response.ok) throw new Error(`Resposta HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > limitBytes) throw new Error('Conteúdo externo muito grande');
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (!response.body) throw new Error('Resposta externa vazia');
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
      return {
        buffer: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total),
        contentType: response.headers.get('content-type') || '',
        finalUrl: safeUrl.toString(),
      };
    }
    throw new Error('Limite de redirecionamentos excedido');
  }
}
