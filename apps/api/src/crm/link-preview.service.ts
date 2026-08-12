import { Injectable } from '@nestjs/common';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractCompanyLogoCandidates } from './company-logo-lookup.service.js';

const HTML_LIMIT_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 4;
const CACHE_TTL_MS = 30 * 60_000;
const FALLBACK_CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;
const HTTP_LINK_PATTERN = /https?:\/\/[^\s<>]+/i;
const WWW_LINK_PATTERN = /www\.[^\s<>]+/i;
const TRAILING_LINK_PUNCTUATION = new Set('.,!?;:)}]"\'’”*_~');

export type LinkPreview = {
  url: string;
  hostname: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
};

function trimTrailingLinkPunctuation(value: string) {
  let end = value.length;
  while (end > 0 && TRAILING_LINK_PUNCTUATION.has(value[end - 1] ?? '')) end -= 1;
  return value.slice(0, end);
}

export function firstLinkInText(text: string) {
  const candidates = [HTTP_LINK_PATTERN.exec(text), WWW_LINK_PATTERN.exec(text)]
    .filter((match): match is RegExpExecArray => Boolean(match))
    .sort((left, right) => left.index - right.index);
  const raw = candidates[0]?.[0];
  if (!raw) return undefined;
  const value = trimTrailingLinkPunctuation(raw);
  if (!value) return undefined;
  return value.toLocaleLowerCase('pt-BR').startsWith('www.') ? `https://${value}` : value;
}

function decodeHtml(value: string) {
  const codePoint = (raw: string, radix: number) => {
    const parsed = Number.parseInt(raw, radix);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : '';
  };
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => codePoint(code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => codePoint(code, 16));
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

function stripMarkup(value: string) {
  let result = '';
  let insideTag = false;
  for (const character of value) {
    if (character === '<') insideTag = true;
    else if (character === '>') insideTag = false;
    else if (!insideTag) result += character;
  }
  return result;
}

function cleanText(value: string, maxLength: number) {
  const text = decodeHtml(stripMarkup(value)).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function absoluteHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function extractLinkPreviewMetadata(html: string, pageUrl: string): LinkPreview {
  const metadata = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase();
    const content = attribute(tag, 'content');
    if (key && content && !metadata.has(key)) metadata.set(key, content);
  }
  const page = new URL(pageUrl);
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  const title = cleanText(metadata.get('og:title') || metadata.get('twitter:title') || titleTag, 200);
  const description = cleanText(
    metadata.get('og:description') || metadata.get('twitter:description') || metadata.get('description') || '',
    500,
  );
  const rawImage = metadata.get('og:image:secure_url')
    || metadata.get('og:image')
    || metadata.get('twitter:image')
    || metadata.get('twitter:image:src')
    || '';
  const imageUrl = rawImage
    ? absoluteHttpUrl(rawImage, pageUrl)
    : extractCompanyLogoCandidates(html, pageUrl)[0]?.url;
  const siteName = cleanText(metadata.get('og:site_name') || '', 100);
  return {
    url: page.toString(),
    hostname: page.hostname.replace(/^www\./i, ''),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(siteName ? { siteName } : {}),
  };
}

function normalizePreviewUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (url.port && url.port !== '80' && url.port !== '443')
    || !url.hostname.includes('.')
    || url.hostname === 'localhost'
    || url.hostname.endsWith('.local')
    || isIP(url.hostname)
  ) throw new Error('Destino externo inválido');
  url.hash = '';
  return url;
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

@Injectable()
export class LinkPreviewService {
  private readonly cache = new Map<string, { expiresAt: number; value: LinkPreview }>();

  async lookup(rawUrl: string): Promise<LinkPreview | null> {
    let requestedUrl: URL;
    try {
      requestedUrl = normalizePreviewUrl(rawUrl);
    } catch {
      return null;
    }
    const cacheKey = requestedUrl.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(cacheKey);

    const fallback: LinkPreview = {
      url: requestedUrl.toString(),
      hostname: requestedUrl.hostname.replace(/^www\./i, ''),
    };
    try {
      const page = await this.fetchHtml(requestedUrl.toString());
      const preview = extractLinkPreviewMetadata(page.html, page.finalUrl);
      if (preview.imageUrl) {
        try {
          await this.ensurePublicUrl(preview.imageUrl);
        } catch {
          delete preview.imageUrl;
        }
      }
      this.setCached(cacheKey, preview, CACHE_TTL_MS);
      return preview;
    } catch {
      this.setCached(cacheKey, fallback, FALLBACK_CACHE_TTL_MS);
      return fallback;
    }
  }

  private setCached(key: string, value: LinkPreview, ttl: number) {
    while (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { expiresAt: Date.now() + ttl, value });
  }

  private async ensurePublicUrl(rawUrl: string) {
    const url = normalizePreviewUrl(rawUrl);
    const addresses = await dnsLookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error('Destino externo bloqueado');
    return url;
  }

  private async requestPage(safeUrl: URL) {
    return fetch(safeUrl, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; BZS-One-LinkPreview/1.0; +internal CRM)',
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

  private validateHtmlResponse(response: Response) {
    if (!response.ok) throw new Error(`Resposta HTTP ${response.status}`);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
      throw new Error('Conteúdo sem prévia HTML');
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > HTML_LIMIT_BYTES) throw new Error('Página externa muito grande');
    if (!response.body) throw new Error('Resposta externa vazia');
    return response.body;
  }

  private async readHtmlBody(response: Response) {
    const reader = this.validateHtmlResponse(response).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > HTML_LIMIT_BYTES) {
        await reader.cancel();
        throw new Error('Página externa muito grande');
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString('utf8');
  }

  private async fetchHtml(rawUrl: string) {
    let current = rawUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const safeUrl = await this.ensurePublicUrl(current);
      const response = await this.requestPage(safeUrl);
      const redirect = this.redirectTarget(response, safeUrl, redirects);
      if (redirect) {
        current = redirect;
        continue;
      }
      return {
        html: await this.readHtmlBody(response),
        finalUrl: safeUrl.toString(),
      };
    }
    throw new Error('Limite de redirecionamentos excedido');
  }
}
