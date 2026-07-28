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
const LOOKUP_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 12 * 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;

type BrasilApiCnpjResponse = {
  cnpj?: unknown;
  razao_social?: unknown;
  nome_fantasia?: unknown;
  cnae_fiscal_descricao?: unknown;
  porte?: unknown;
  ddd_telefone_1?: unknown;
  descricao_situacao_cadastral?: unknown;
  descricao_tipo_de_logradouro?: unknown;
  logradouro?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  cep?: unknown;
  municipio?: unknown;
  uf?: unknown;
};

export type CompanyCnpjLookup = {
  cnpj: string;
  name: string;
  legalName: string;
  sector?: string;
  size?: string;
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

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function companySize(value: unknown) {
  const size = text(value);
  if (!size) return undefined;
  const labels: Record<string, string> = {
    DEMAIS: 'Demais',
    'MICRO EMPRESA': 'Microempresa',
    'EMPRESA DE PEQUENO PORTE': 'Empresa de pequeno porte',
  };
  return labels[size.toUpperCase()] || size;
}

function phone(value: unknown) {
  const digits = text(value)?.replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.length === 10 || digits.length === 11 ? `+55${digits}` : digits;
}

function addressFrom(data: BrasilApiCnpjResponse): CompanyCnpjLookup['address'] {
  const street = [text(data.descricao_tipo_de_logradouro), text(data.logradouro)].filter(Boolean).join(' ') || undefined;
  const number = text(data.numero);
  const complement = text(data.complemento);
  const district = text(data.bairro);
  const postalCode = text(data.cep);
  const city = text(data.municipio);
  const state = text(data.uf);
  if (![street, number, complement, district, postalCode, city, state].some(Boolean)) return undefined;

  const streetAlreadyHasNumber = Boolean(street && number && street.replace(/\D/g, '').endsWith(number.replace(/\D/g, '')));
  const firstLine = [street, !streetAlreadyHasNumber ? number : undefined].filter(Boolean).join(', ');
  const cityLine = [city, state].filter(Boolean).join(' - ');
  const formatted = [firstLine, complement, district, cityLine, postalCode ? `CEP ${postalCode}` : undefined]
    .filter(Boolean)
    .join(' · ');

  return {
    formatted,
    street,
    number,
    complement,
    district,
    postalCode,
    city,
    state,
    country: 'Brasil',
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

    const baseUrl = (process.env.CNPJ_LOOKUP_API_URL || DEFAULT_CNPJ_API_URL).replace(/\/+$/, '');
    try {
      const response = await fetch(`${baseUrl}/${encodeURIComponent(cnpj)}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BZS-One/1.0 (+internal CRM)',
        },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (response.status === 404) throw new NotFoundException('CNPJ não encontrado na base pública');
      if (!response.ok) throw new BadGatewayException('O serviço de consulta de CNPJ não respondeu corretamente');

      const data = await response.json() as BrasilApiCnpjResponse;
      const legalName = text(data.razao_social);
      const name = text(data.nome_fantasia) || legalName;
      if (!name || !legalName) throw new BadGatewayException('A consulta não retornou os dados básicos da empresa');

      const result: CompanyCnpjLookup = {
        cnpj,
        name,
        legalName,
        sector: text(data.cnae_fiscal_descricao),
        size: companySize(data.porte),
        phone: phone(data.ddd_telefone_1),
        registrationStatus: text(data.descricao_situacao_cadastral),
        address: addressFrom(data),
      };
      if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(cnpj, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new GatewayTimeoutException('A consulta do CNPJ demorou mais que o esperado');
      }
      throw new BadGatewayException('Não foi possível consultar o CNPJ agora');
    }
  }
}
