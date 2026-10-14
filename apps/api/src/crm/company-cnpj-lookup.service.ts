import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidCnpj, normalizeCnpj } from '@prospecta/contracts';

const DEFAULT_CNPJ_API_URL = 'https://brasilapi.com.br/api/cnpj/v1';
const FALLBACK_CNPJ_API_URL = 'https://publica.cnpj.ws/cnpj';
const LOOKUP_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 12 * 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;

function withoutTrailingSlash(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

type JsonRecord = Record<string, unknown>;

export type CompanyCnpjLookup = {
  cnpj: string;
  name: string;
  legalName: string;
  sector?: string;
  size?: string;
  email?: string;
  phone?: string;
  registrationStatus?: string;
  address?: {
    formatted: string;
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    postalCode?: string;
    city?: string;
    state?: string;
    country: 'Brasil';
  };
};

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const result = String(value).trim();
    return result || undefined;
  }
  if (Array.isArray(value)) return value.map(text).find(Boolean);
  const object = record(value);
  if (!object) return undefined;
  for (const key of ['descricao', 'description', 'nome', 'name', 'sigla', 'value', 'text']) {
    const result = text(object[key]);
    if (result) return result;
  }
  return undefined;
}

function pathValue(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/u.test(part)) current = current[Number(part)];
    else current = record(current)?.[part];
    if (current === undefined || current === null) return undefined;
  }
  return current;
}

function sourceRecords(payload: unknown) {
  const root = record(payload);
  if (!root) return [];
  const sources: JsonRecord[] = [root];
  for (let index = 0; index < sources.length; index += 1) {
    for (const path of ['data', 'result', 'empresa', 'company', 'estabelecimento']) {
      const value = record(pathValue(sources[index], path));
      if (value && !sources.includes(value)) sources.push(value);
    }
  }
  return sources;
}

function firstValue(sources: JsonRecord[], paths: string[]) {
  for (const source of sources) {
    for (const path of paths) {
      const value = pathValue(source, path);
      if (text(value)) return value;
    }
  }
  return undefined;
}

function firstText(sources: JsonRecord[], paths: string[]) {
  return text(firstValue(sources, paths));
}

function companySize(value: unknown) {
  const size = text(value);
  if (!size) return undefined;
  const labels: Record<string, string> = {
    '01': 'Microempresa',
    '03': 'Empresa de pequeno porte',
    '05': 'Demais',
    DEMAIS: 'Demais',
    MICROEMPRESA: 'Microempresa',
    'MICRO EMPRESA': 'Microempresa',
    EPP: 'Empresa de pequeno porte',
    'EMPRESA DE PEQUENO PORTE': 'Empresa de pequeno porte',
  };
  return labels[size.toUpperCase()] || size;
}

function phone(value: unknown) {
  const digits = text(value)?.replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  return digits.length === 10 || digits.length === 11 ? `+55${digits}` : digits;
}

function email(value: unknown) {
  const result = text(value)?.toLowerCase();
  return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result) ? result : undefined;
}

function postalCode(value: unknown) {
  const digits = text(value)?.replace(/\D/g, '');
  return digits ? digits.padStart(8, '0') : undefined;
}

function addressFrom(sources: JsonRecord[]): CompanyCnpjLookup['address'] {
  const addressSources = sources.flatMap((source) => {
    const nested = [pathValue(source, 'address'), pathValue(source, 'endereco')]
      .map(record)
      .filter((value): value is JsonRecord => Boolean(value));
    return [...nested, source];
  });
  const streetType = firstText(addressSources, [
    'descricao_tipo_de_logradouro', 'tipo_logradouro', 'tipoLogradouro', 'streetType',
  ]);
  const streetName = firstText(addressSources, ['logradouro', 'street', 'streetName']);
  const street = [streetType, streetName].filter(Boolean).join(' ') || undefined;
  const number = firstText(addressSources, ['numero', 'number', 'streetNumber']);
  const complement = firstText(addressSources, ['complemento', 'complement', 'additionalInfo']);
  const district = firstText(addressSources, ['bairro', 'district', 'neighborhood']);
  const postal = firstValue(addressSources, ['cep', 'postalCode', 'postal_code', 'zipCode', 'zip']);
  const postalCodeValue = postalCode(postal);
  const city = firstText(addressSources, ['municipio', 'city', 'cidade', 'cidade.nome']);
  const state = firstText(addressSources, ['uf', 'state', 'estado.sigla', 'stateCode']);
  if (![street, number, complement, district, postalCodeValue, city, state].some(Boolean)) return undefined;

  const streetAlreadyHasNumber = Boolean(street && number && street.replace(/\D/g, '').endsWith(number.replace(/\D/g, '')));
  const firstLine = [street, !streetAlreadyHasNumber ? number : undefined].filter(Boolean).join(', ');
  const cityLine = [city, state].filter(Boolean).join(' - ');
  const formatted = [firstLine, complement, district, cityLine, postalCodeValue ? `CEP ${postalCodeValue}` : undefined]
    .filter(Boolean)
    .join(' · ');

  return {
    formatted,
    street,
    number,
    complement,
    district,
    postalCode: postalCodeValue,
    city,
    state,
    country: 'Brasil',
  };
}

function lookupUrls() {
  const configured = (process.env.CNPJ_LOOKUP_API_URLS || process.env.CNPJ_LOOKUP_API_URL || '')
    .split(',')
    .map((value) => withoutTrailingSlash(value.trim()))
    .filter(Boolean);
  const urls = [...configured, DEFAULT_CNPJ_API_URL, FALLBACK_CNPJ_API_URL];
  return [...new Set(urls)];
}

function urlForCnpj(baseUrl: string, cnpj: string) {
  const encoded = encodeURIComponent(cnpj);
  if (baseUrl.includes('{cnpj}')) return baseUrl.replaceAll('{cnpj}', encoded);
  if (baseUrl.includes(':cnpj')) return baseUrl.replaceAll(':cnpj', encoded);
  return `${baseUrl}/${encoded}`;
}

function normalizeLookup(payload: unknown, cnpj: string): CompanyCnpjLookup | undefined {
  const sources = sourceRecords(payload);
  if (!sources.length) return undefined;

  const legalName = firstText(sources, [
    'razao_social', 'razaoSocial', 'legalName', 'legal_name', 'nome_empresarial', 'companyName', 'nome',
  ]);
  const name = firstText(sources, [
    'nome_fantasia', 'nomeFantasia', 'fantasia', 'tradeName', 'fantasyName', 'name', 'nome',
  ]) || legalName;
  if (!name && !legalName) return undefined;

  const activity = firstText(sources, [
    'cnae_fiscal_descricao', 'cnaeFiscalDescricao', 'atividade_principal.descricao',
    'atividade_principal.0.text', 'atividade_principal.0.descricao', 'primaryActivity.description',
    'primaryActivity.text', 'sector', 'industry',
  ]);
  const directPhone = firstValue(sources, [
    'ddd_telefone_1', 'dddTelefone1', 'telefone', 'phone', 'phones.0', 'telefones.0',
  ]);
  const ddd = firstText(sources, ['ddd1', 'ddd', 'phoneAreaCode', 'telefone.ddd']);
  const phoneNumber = firstText(sources, ['telefone1', 'phoneNumber', 'telefone.numero']);
  const phoneValue = directPhone || (ddd && phoneNumber ? `${ddd}${phoneNumber}` : undefined);
  const emailValue = firstValue(sources, ['email', 'e_mail', 'emailAddress', 'contact.email']);
  const statusValue = firstValue(sources, [
    'descricao_situacao_cadastral', 'descricaoSituacaoCadastral', 'situacao_cadastral',
    'situacaoCadastral', 'status', 'situation',
  ]);
  const statusText = text(statusValue);
  const statusCode = typeof statusValue === 'number' || /^\d+$/u.test(statusText || '') ? Number(statusValue) : undefined;
  const registrationStatus = statusText && !statusCode
    ? statusText
    : ({ 1: 'NULA', 2: 'ATIVA', 3: 'SUSPENSA', 4: 'INAPTA', 8: 'BAIXADA' } as Record<number, string>)[statusCode || 0] || statusText;

  return {
    cnpj,
    name: name || legalName || cnpj,
    legalName: legalName || name || cnpj,
    sector: activity,
    size: companySize(firstValue(sources, ['porte', 'companySize', 'company_size', 'size'])),
    email: email(emailValue),
    phone: phone(phoneValue),
    registrationStatus,
    address: addressFrom(sources),
  };
}

@Injectable()
export class CompanyCnpjLookupService {
  private readonly cache = new Map<string, { expiresAt: number; value: CompanyCnpjLookup }>();

  async lookup(rawCnpj: string) {
    const cnpj = normalizeCnpj(rawCnpj);
    if (!isValidCnpj(cnpj)) throw new BadRequestException('Informe um CNPJ válido para realizar a consulta');

    const cached = this.cache.get(cnpj);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(cnpj);

    let timedOut = false;
    let foundNotFound = false;
    for (const baseUrl of lookupUrls()) {
      try {
        const response = await fetch(urlForCnpj(baseUrl, cnpj), {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'BZS-One/1.0 (+internal CRM)',
          },
          signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        });
        if (response.status === 404) {
          foundNotFound = true;
          continue;
        }
        if (!response.ok) continue;

        const result = normalizeLookup(await response.json(), cnpj);
        if (!result) continue;
        if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(cnpj, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
        return result;
      } catch (error) {
        if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) timedOut = true;
      }
    }
    if (timedOut) throw new GatewayTimeoutException('A consulta do CNPJ demorou mais que o esperado');
    if (foundNotFound) throw new NotFoundException('CNPJ não encontrado nas bases públicas');
    throw new BadGatewayException('Não foi possível consultar o CNPJ agora');
  }
}
