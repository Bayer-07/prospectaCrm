import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type PublicAddress = { address: string; family: 4 | 6 };
export type PublicAddressResolver = (hostname: string) => Promise<PublicAddress[]>;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

function normalizedHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  let end = lower.length;
  while (end > 0 && lower[end - 1] === '.') end -= 1;
  return lower.slice(0, end);
}

function isBlockedHostname(hostname: string) {
  const normalized = normalizedHostname(hostname);
  return BLOCKED_HOSTNAMES.has(normalized)
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.home.arpa');
}

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second, third] = octets;
  return first !== 0
    && first !== 10
    && first !== 127
    && first < 224
    && !(first === 100 && second >= 64 && second <= 127)
    && !(first === 169 && second === 254)
    && !(first === 172 && second >= 16 && second <= 31)
    && !(first === 192 && second === 168)
    && !(first === 192 && second === 0 && third === 0)
    && !(first === 192 && second === 0 && third === 2)
    && !(first === 198 && (second === 18 || second === 19))
    && !(first === 198 && second === 51 && third === 100)
    && !(first === 203 && second === 0 && third === 113);
}

function mappedIpv4Address(address: string) {
  const normalized = address.toLowerCase().split('%', 1)[0] || '';
  if (!normalized.startsWith('::ffff:')) return undefined;
  const suffix = normalized.slice(7);
  if (isIP(suffix) === 4) return suffix;
  const groups = suffix.split(':');
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return undefined;
  const high = Number.parseInt(groups[0]!, 16);
  const low = Number.parseInt(groups[1]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase().split('%', 1)[0] || '';
  const mapped = mappedIpv4Address(normalized);
  if (mapped) return isPublicIpv4(mapped);
  return normalized !== '::'
    && normalized !== '::1'
    && !normalized.startsWith('fc')
    && !normalized.startsWith('fd')
    && !/^fe[89ab]/u.test(normalized)
    && !normalized.startsWith('ff')
    && !normalized.startsWith('2001:db8:')
    && !normalized.startsWith('2001:0:')
    && !normalized.startsWith('64:ff9b:')
    && !normalized.startsWith('100:');
}

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function normalizePublicHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new Error('Somente endpoints HTTP ou HTTPS sem credenciais são permitidos');
  }
  if (isBlockedHostname(url.hostname)) throw new Error('Destino de rede interno bloqueado');
  url.hash = '';
  return url;
}

async function defaultResolver(hostname: string): Promise<PublicAddress[]> {
  const entries = await dnsLookup(hostname, { all: true, verbatim: true });
  return entries
    .filter((entry): entry is typeof entry & { family: 4 | 6 } => entry.family === 4 || entry.family === 6)
    .map((entry) => ({ address: entry.address, family: entry.family }));
}

export async function resolvePublicHttpUrl(rawUrl: string, resolve: PublicAddressResolver = defaultResolver) {
  const url = normalizePublicHttpUrl(rawUrl);
  const literalFamily = isIP(url.hostname);
  const addresses: PublicAddress[] = literalFamily === 4 || literalFamily === 6
    ? [{ address: url.hostname, family: literalFamily }]
    : await resolve(url.hostname);
  if (!addresses.length) throw new Error('O endpoint não possui endereço DNS');
  if (addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error('Destino de rede interno bloqueado');
  }
  return { url, addresses };
}
