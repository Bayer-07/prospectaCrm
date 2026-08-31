export type ChatbotHttpResponseRoute = {
  id: string;
  label: string;
  path: string;
  operator: string;
  value?: string;
};

export type ChatbotHttpResponse = {
  status?: number;
  body: unknown;
  error?: string;
};

const BLOCKED_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const scalarText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${value}`;
  if (value === null) return 'null';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const normalizedText = (value: unknown) => scalarText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

function nestedValue(value: unknown, path: string) {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current) && /^\d+$/u.test(key)) return current[Number(key)];
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    const record = current as Record<string, unknown>;
    const matchingKey = Object.keys(record).find((candidate) => candidate.toLocaleLowerCase('pt-BR') === key.toLocaleLowerCase('pt-BR'));
    return matchingKey === undefined ? undefined : record[matchingKey];
  }, value);
}

export function chatbotHttpResponsePath(response: ChatbotHttpResponse, path: string) {
  const normalized = path.trim();
  if (normalized === 'status') return response.status;
  if (normalized === 'error') return response.error;
  if (normalized === 'body') return response.body;
  if (normalized.startsWith('body.')) return nestedValue(response.body, normalized.slice(5));
  return undefined;
}

export function chatbotHttpRouteMatches(route: ChatbotHttpResponseRoute, response: ChatbotHttpResponse) {
  const actual = chatbotHttpResponsePath(response, route.path);
  const expected = route.value || '';
  if (route.operator === 'exists') return actual !== undefined && actual !== null;
  if (route.operator === 'not_exists') return actual === undefined || actual === null;
  if (route.operator === 'equals') return normalizedText(actual) === normalizedText(expected);
  if (route.operator === 'not_equals') return normalizedText(actual) !== normalizedText(expected);
  if (route.operator === 'contains') return normalizedText(actual).includes(normalizedText(expected));
  if (route.operator === 'greater_than') return Number(actual) > Number(expected);
  if (route.operator === 'less_than') return Number(actual) < Number(expected);
  if (route.operator === 'between') {
    const [minimum, maximum] = expected.split(/\s*(?:,|\.\.)\s*/u).map(Number);
    const numericActual = Number(actual);
    return Number.isFinite(numericActual) && Number.isFinite(minimum) && Number.isFinite(maximum)
      && numericActual >= minimum! && numericActual <= maximum!;
  }
  return false;
}

export function chatbotHttpResponseHandle(routes: ChatbotHttpResponseRoute[], response: ChatbotHttpResponse) {
  return routes.find((route) => chatbotHttpRouteMatches(route, response))?.id || 'default';
}

export function parseChatbotHttpBody(bodyText: string): unknown {
  if (!bodyText.trim()) return null;
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

export function parseChatbotHttpHeaders(rawHeaders: string) {
  if (!rawHeaders.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawHeaders);
  } catch {
    throw new Error('Os cabeçalhos da requisição HTTP precisam ser um objeto JSON válido');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Os cabeçalhos da requisição HTTP precisam ser um objeto JSON');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 30) throw new Error('A requisição HTTP aceita no máximo 30 cabeçalhos');
  return Object.fromEntries(entries.map(([name, value]) => {
    const normalizedName = name.trim().toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(normalizedName) || BLOCKED_REQUEST_HEADERS.has(normalizedName)) {
      throw new Error(`O cabeçalho HTTP ${name} não é permitido`);
    }
    if (typeof value !== 'string' || value.length > 8_192) {
      throw new Error(`O valor do cabeçalho HTTP ${name} precisa ser um texto válido`);
    }
    return [normalizedName, value];
  }));
}

export function chatbotHttpTimeoutMs(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 15_000;
  return Math.min(60, Math.max(1, Math.trunc(seconds))) * 1_000;
}
