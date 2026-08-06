import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiUnauthorizedResponse,
  getSchemaPath,
  PartialType,
} from '@nestjs/swagger';

const UUID_EXAMPLE = '4d8353ae-59de-46bb-a217-9ac697e9d07f';
const USER_UUID_EXAMPLE = '95be697c-9618-4e2c-bc98-df629b28bfa0';
const COMPANY_UUID_EXAMPLE = 'a45ff0de-0818-4fc8-9908-ea9c24ac5b5c';
const CONTACT_UUID_EXAMPLE = '0bf51b4e-b29f-4734-ab75-34eed8d1d025';

export class CompanyCreateRequest {
  @ApiProperty({ description: 'Nome fantasia da empresa.', minLength: 2, maxLength: 180, example: 'BZS Tecnologia' })
  name: string;

  @ApiPropertyOptional({ description: 'Razão social.', maxLength: 180, example: 'BZS Tecnologia Ltda.' })
  legalName?: string;

  @ApiPropertyOptional({
    description: 'CNPJ válido. Aceita somente 14 dígitos ou a máscara padrão.',
    pattern: '^(?:\\d{14}|\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2})$',
    example: '29.277.764/0001-00',
  })
  cnpj?: string;

  @ApiPropertyOptional({ description: 'Domínio principal, sem protocolo.', maxLength: 160, example: 'bzs.com.br' })
  domain?: string;

  @ApiPropertyOptional({ type: String, description: 'Página da empresa no LinkedIn. Envie null para remover.', format: 'uri', nullable: true, maxLength: 300, example: 'https://www.linkedin.com/company/bzs-tecnologia' })
  linkedinUrl?: string | null;

  @ApiPropertyOptional({ description: 'Setor de atuação.', maxLength: 100, example: 'Tecnologia' })
  sector?: string;

  @ApiPropertyOptional({ description: 'Porte ou faixa de tamanho.', maxLength: 60, example: '11-50 funcionários' })
  size?: string;

  @ApiPropertyOptional({ description: 'Telefone comercial.', maxLength: 24, example: '4533035888' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Endereço estruturado. As chaves podem ser adaptadas ao integrador.',
    type: 'object',
    additionalProperties: true,
    example: { street: 'Rua Exemplo', number: '100', city: 'Cascavel', state: 'PR', zipCode: '85800-000' },
  })
  address?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'UUID do usuário responsável.', format: 'uuid', example: USER_UUID_EXAMPLE })
  ownerId?: string;

  @ApiPropertyOptional({ description: 'UUID da equipe responsável.', format: 'uuid', example: UUID_EXAMPLE })
  teamId?: string;

  @ApiPropertyOptional({
    description: 'Identificador no sistema de origem. Em chamadas com API Key, permite upsert.',
    maxLength: 160,
    example: 'erp-company-1024',
  })
  externalId?: string;

  @ApiPropertyOptional({
    description: 'Valores dos campos personalizados, usando a chave configurada em Campos personalizados.',
    type: 'object',
    additionalProperties: true,
    default: {},
    example: { sistemaAtual: 'Planilha', quantidadeUsuarios: 25 },
  })
  customFields?: Record<string, unknown>;
}

export class CompanyUpdateRequest extends PartialType(CompanyCreateRequest) {}

export class ContactCreateRequest {
  @ApiProperty({ description: 'Nome completo do contato.', minLength: 2, maxLength: 180, example: 'Gabriel Bayer' })
  name: string;

  @ApiPropertyOptional({ description: 'Cargo ou função.', maxLength: 120, example: 'Diretor comercial' })
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'E-mail válido.', format: 'email', maxLength: 180, example: 'gabriel@bzs.com.br' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Telefone no padrão internacional E.164, incluindo o sinal +.',
    pattern: '^\\+[1-9]\\d{7,14}$',
    example: '+5545999225389',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'UUID da empresa principal. Envie null na atualização para remover o vínculo.',
    type: String,
    format: 'uuid',
    nullable: true,
    example: COMPANY_UUID_EXAMPLE,
  })
  companyId?: string | null;

  @ApiPropertyOptional({ description: 'UUID do usuário responsável.', format: 'uuid', example: USER_UUID_EXAMPLE })
  ownerId?: string;

  @ApiPropertyOptional({ description: 'UUID da equipe responsável.', format: 'uuid', example: UUID_EXAMPLE })
  teamId?: string;

  @ApiPropertyOptional({ description: 'Origem comercial do contato.', maxLength: 80, example: 'Landing page' })
  source?: string;

  @ApiPropertyOptional({
    description: 'Identificador no sistema de origem. Em chamadas com API Key, permite upsert.',
    maxLength: 160,
    example: 'site-lead-8891',
  })
  externalId?: string;

  @ApiPropertyOptional({
    description: 'Situação do consentimento para WhatsApp.',
    enum: ['unknown', 'granted', 'revoked'],
    default: 'unknown',
    example: 'granted',
  })
  consentStatus?: 'unknown' | 'granted' | 'revoked';

  @ApiPropertyOptional({ description: 'Onde o consentimento foi obtido.', maxLength: 160, example: 'Formulário do site' })
  consentSource?: string;

  @ApiPropertyOptional({ description: 'Evidência ou referência do consentimento.', maxLength: 500, example: 'Checkbox aceito em 2026-07-28' })
  consentEvidence?: string;

  @ApiPropertyOptional({
    description: 'Quando verdadeiro, impede o contato de receber campanhas de WhatsApp e de e-mail.',
    default: false,
    example: false,
  })
  campaignsBlocked?: boolean;

  @ApiPropertyOptional({
    description: 'Valores dos campos personalizados.',
    type: 'object',
    additionalProperties: true,
    default: {},
    example: { produtoInteresse: 'SGA' },
  })
  customFields?: Record<string, unknown>;
}

export class ContactUpdateRequest extends PartialType(ContactCreateRequest) {}

export class OpportunityCreateRequest {
  @ApiProperty({ description: 'Título da oportunidade.', minLength: 2, maxLength: 180, example: 'BZS Tecnologia' })
  title: string;

  @ApiPropertyOptional({ description: 'UUID da empresa vinculada.', format: 'uuid', example: COMPANY_UUID_EXAMPLE })
  companyId?: string;

  @ApiPropertyOptional({ description: 'UUID do contato principal.', format: 'uuid', example: CONTACT_UUID_EXAMPLE })
  contactId?: string;

  @ApiProperty({ description: 'UUID do funil.', format: 'uuid', example: UUID_EXAMPLE })
  pipelineId: string;

  @ApiProperty({ description: 'UUID da etapa do funil.', format: 'uuid', example: UUID_EXAMPLE })
  stageId: string;

  @ApiPropertyOptional({ description: 'UUID do usuário responsável.', format: 'uuid', example: USER_UUID_EXAMPLE })
  ownerId?: string;

  @ApiPropertyOptional({ description: 'UUID da equipe responsável.', format: 'uuid', example: UUID_EXAMPLE })
  teamId?: string;

  @ApiPropertyOptional({ description: 'Valor em centavos de real.', type: 'integer', minimum: 0, default: 0, example: 125000 })
  valueCents?: number;

  @ApiPropertyOptional({ description: 'Probabilidade de fechamento de 0 a 100.', type: 'integer', minimum: 0, maximum: 100, default: 0, example: 40 })
  probability?: number;

  @ApiPropertyOptional({ description: 'Previsão de fechamento em ISO-8601 UTC.', format: 'date-time', example: '2026-08-31T18:00:00.000Z' })
  expectedCloseAt?: string;

  @ApiPropertyOptional({ description: 'Origem da oportunidade.', maxLength: 80, example: 'Prospecção ativa' })
  source?: string;

  @ApiPropertyOptional({
    description: 'Identificador no sistema de origem. Em chamadas com API Key, permite upsert.',
    maxLength: 160,
    example: 'erp-deal-7788',
  })
  externalId?: string;

  @ApiPropertyOptional({
    description: 'Valores dos campos personalizados.',
    type: 'object',
    additionalProperties: true,
    default: {},
    example: { concorrente: 'Nenhum' },
  })
  customFields?: Record<string, unknown>;
}

export class OpportunityUpdateRequest extends PartialType(OpportunityCreateRequest) {}

export class TaskCreateRequest {
  @ApiProperty({ description: 'Título da tarefa.', minLength: 2, maxLength: 180, example: 'Ligar para o decisor' })
  title: string;

  @ApiPropertyOptional({ description: 'Descrição da tarefa.', maxLength: 2000, example: 'Confirmar disponibilidade para demonstração.' })
  description?: string;

  @ApiProperty({ description: 'Data e hora do compromisso em ISO-8601.', format: 'date-time', example: '2026-07-29T13:30:00.000Z' })
  dueAt: string;

  @ApiPropertyOptional({ description: 'Prioridade.', enum: ['low', 'medium', 'high'], default: 'medium', example: 'high' })
  priority?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({
    description: 'UUID do responsável. É obrigatório quando a chamada usa API Key.',
    format: 'uuid',
    example: USER_UUID_EXAMPLE,
  })
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'UUID do contato relacionado.', format: 'uuid', example: CONTACT_UUID_EXAMPLE })
  contactId?: string;

  @ApiPropertyOptional({ description: 'UUID da empresa relacionada.', format: 'uuid', example: COMPANY_UUID_EXAMPLE })
  companyId?: string;

  @ApiPropertyOptional({ description: 'UUID da oportunidade relacionada.', format: 'uuid', example: UUID_EXAMPLE })
  opportunityId?: string;
}

export class TaskUpdateRequest extends PartialType(TaskCreateRequest) {}

export class TagCreateRequest {
  @ApiProperty({ description: 'Nome único da tag dentro da organização.', example: 'Cliente estratégico' })
  name: string;

  @ApiPropertyOptional({ description: 'Cor hexadecimal.', pattern: '^#[0-9A-Fa-f]{6}$', default: '#64748b', example: '#38bdf8' })
  color?: string;
}

export class TagUpdateRequest extends PartialType(TagCreateRequest) {}

export class CustomFieldCreateRequest {
  @ApiProperty({ description: 'Tipo de registro que receberá o campo.', enum: ['company', 'contact', 'opportunity'], example: 'contact' })
  entityType: 'company' | 'contact' | 'opportunity';

  @ApiProperty({
    description: 'Chave técnica imutável, iniciando com letra minúscula.',
    pattern: '^[a-z][a-z0-9_]{1,40}$',
    example: 'produto_interesse',
  })
  key: string;

  @ApiProperty({ description: 'Rótulo exibido para o usuário.', example: 'Produto de interesse' })
  label: string;

  @ApiProperty({
    description: 'Tipo do valor.',
    enum: ['text', 'number', 'date', 'boolean', 'select', 'multiselect'],
    example: 'select',
  })
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';

  @ApiPropertyOptional({
    description: 'Opções para campos select e multiselect.',
    type: 'array',
    items: {},
    default: [],
    example: ['SGA', 'CRM', 'Aplicativo'],
  })
  options?: unknown[];

  @ApiPropertyOptional({ description: 'Indica se o preenchimento é obrigatório.', default: false, example: false })
  required?: boolean;

  @ApiPropertyOptional({ description: 'Posição de exibição.', type: 'integer', default: 0, example: 1 })
  position?: number;
}

export class CustomFieldUpdateRequest {
  @ApiPropertyOptional({ description: 'Novo rótulo exibido.', example: 'Solução de interesse' })
  label?: string;

  @ApiPropertyOptional({ description: 'Novas opções para select e multiselect.', type: 'array', items: {}, example: ['SGA', 'CRM'] })
  options?: unknown[];

  @ApiPropertyOptional({ description: 'Indica se o preenchimento é obrigatório.', example: true })
  required?: boolean;

  @ApiPropertyOptional({ description: 'Nova posição de exibição.', type: 'integer', example: 2 })
  position?: number;
}

export class SegmentCreateRequest {
  @ApiProperty({ description: 'Nome único do segmento.', example: 'Leads de tecnologia' })
  name: string;

  @ApiPropertyOptional({ description: 'Descrição do público.', example: 'Contatos de empresas do setor de tecnologia.' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Filtros do segmento dinâmico. O formato depende dos campos escolhidos no CRM.',
    type: 'object',
    additionalProperties: true,
    example: { sector: 'Tecnologia', hasEmail: true },
  })
  filters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'UUIDs dos contatos de um segmento estático. Quando informado, o segmento deixa de ser dinâmico.',
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    example: [CONTACT_UUID_EXAMPLE],
  })
  contactIds?: string[];
}

export class SegmentUpdateRequest extends PartialType(SegmentCreateRequest) {}

export class UserSummaryResponse {
  @ApiProperty({ format: 'uuid', example: USER_UUID_EXAMPLE })
  id: string;

  @ApiProperty({ example: 'Gabriel Bayer' })
  name: string;
}

export class TeamSummaryResponse {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ example: 'Prospecção' })
  name: string;

  @ApiPropertyOptional({ example: '#38bdf8' })
  color?: string;
}

export class CompanyResponse {
  @ApiProperty({ format: 'uuid', example: COMPANY_UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Organização proprietária do registro.', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: UUID_EXAMPLE })
  teamId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: USER_UUID_EXAMPLE })
  ownerId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'erp-company-1024' })
  externalId?: string | null;

  @ApiProperty({ example: 'BZS Tecnologia' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'BZS Tecnologia Ltda.' })
  legalName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'CNPJ armazenado com 14 dígitos.', example: '29277764000100' })
  cnpj?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'bzs.com.br' })
  domain?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true, example: 'https://www.linkedin.com/company/bzs-tecnologia' })
  linkedinUrl?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Mídia vinculada como logo da empresa.' })
  logoId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Tecnologia' })
  sector?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '11-50 funcionários' })
  size?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '4533035888' })
  phone?: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { city: 'Cascavel', state: 'PR' } })
  address: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { sistemaAtual: 'Planilha' } })
  customFields: Record<string, unknown>;

  @ApiPropertyOptional({ type: UserSummaryResponse, nullable: true, description: 'Incluído nas listagens e consultas detalhadas.' })
  owner?: UserSummaryResponse | null;

  @ApiPropertyOptional({ type: TeamSummaryResponse, nullable: true, description: 'Incluída nas listagens e consultas detalhadas.' })
  team?: TeamSummaryResponse | null;

  @ApiPropertyOptional({
    description: 'Contadores incluídos na listagem.',
    type: 'object',
    properties: {
      contacts: { type: 'integer', example: 3 },
      opportunities: { type: 'integer', example: 1 },
    },
  })
  _count?: { contacts: number; opportunities: number };

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: null })
  archivedAt?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T14:30:00.000Z' })
  updatedAt: string;
}

export class ContactResponse {
  @ApiProperty({ format: 'uuid', example: CONTACT_UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: UUID_EXAMPLE })
  teamId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: USER_UUID_EXAMPLE })
  ownerId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: COMPANY_UUID_EXAMPLE })
  primaryCompanyId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'site-lead-8891' })
  externalId?: string | null;

  @ApiProperty({ example: 'Gabriel Bayer' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Diretor comercial' })
  jobTitle?: string | null;

  @ApiPropertyOptional({ type: String, format: 'email', nullable: true, example: 'gabriel@bzs.com.br' })
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+5545999225389' })
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Landing page' })
  source?: string | null;

  @ApiProperty({ enum: ['UNKNOWN', 'GRANTED', 'REVOKED'], example: 'GRANTED' })
  consentStatus: 'UNKNOWN' | 'GRANTED' | 'REVOKED';

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Formulário do site' })
  consentSource?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Checkbox aceito em 2026-07-28' })
  consentEvidence?: string | null;

  @ApiProperty({ description: 'Indica se o contato está bloqueado para campanhas.', example: false })
  campaignsBlocked: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { produtoInteresse: 'SGA' } })
  customFields: Record<string, unknown>;

  @ApiPropertyOptional({ type: UserSummaryResponse, nullable: true })
  owner?: UserSummaryResponse | null;

  @ApiPropertyOptional({ type: TeamSummaryResponse, nullable: true })
  team?: TeamSummaryResponse | null;

  @ApiPropertyOptional({
    description: 'Empresas vinculadas. Na listagem, contém apenas a empresa principal.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        isPrimary: { type: 'boolean', example: true },
        company: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: COMPANY_UUID_EXAMPLE },
            name: { type: 'string', example: 'BZS Tecnologia' },
          },
        },
      },
    },
  })
  companies?: Array<{ isPrimary: boolean; company: { id: string; name: string } }>;

  @ApiPropertyOptional({
    description: 'Tags vinculadas.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        tag: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: UUID_EXAMPLE },
            name: { type: 'string', example: 'Cliente estratégico' },
            color: { type: 'string', example: '#38bdf8' },
          },
        },
      },
    },
  })
  tags?: Array<{ tag: { id: string; name: string; color: string } }>;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: null })
  archivedAt?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T14:30:00.000Z' })
  updatedAt: string;
}

export class OpportunityResponse {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  pipelineId: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  stageId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: COMPANY_UUID_EXAMPLE })
  companyId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: UUID_EXAMPLE })
  teamId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: USER_UUID_EXAMPLE })
  ownerId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'erp-deal-7788' })
  externalId?: string | null;

  @ApiProperty({ example: 'BZS Tecnologia' })
  title: string;

  @ApiProperty({ enum: ['OPEN', 'WON', 'LOST'], example: 'OPEN' })
  status: 'OPEN' | 'WON' | 'LOST';

  @ApiProperty({ type: 'integer', description: 'Valor em centavos.', example: 125000 })
  valueCents: number;

  @ApiProperty({ example: 'BRL' })
  currency: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 100, example: 40 })
  probability: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: '2026-08-31T18:00:00.000Z' })
  expectedCloseAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Prospecção ativa' })
  source?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  lossReason?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: null })
  wonAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: null })
  lostAt?: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { concorrente: 'Nenhum' } })
  customFields: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: null })
  archivedAt?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T14:30:00.000Z' })
  updatedAt: string;
}

export class TaskResponse {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: UUID_EXAMPLE })
  teamId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: USER_UUID_EXAMPLE })
  assigneeId?: string | null;

  @ApiProperty({ format: 'uuid', example: USER_UUID_EXAMPLE })
  createdById: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: COMPANY_UUID_EXAMPLE })
  companyId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: CONTACT_UUID_EXAMPLE })
  contactId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, example: UUID_EXAMPLE })
  opportunityId?: string | null;

  @ApiProperty({ example: 'Ligar para o decisor' })
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Confirmar disponibilidade para demonstração.' })
  description?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-07-29T13:30:00.000Z' })
  dueAt: string;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' })
  priority: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiProperty({ enum: ['OPEN', 'COMPLETED', 'CANCELLED'], example: 'OPEN' })
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: null })
  completedAt?: string | null;

  @ApiPropertyOptional({ type: UserSummaryResponse, nullable: true, description: 'Incluído na listagem.' })
  assignee?: UserSummaryResponse | null;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T14:30:00.000Z' })
  updatedAt: string;
}

export class TagResponse {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiProperty({ example: 'Cliente estratégico' })
  name: string;

  @ApiProperty({ example: '#38bdf8' })
  color: string;
}

export class CustomFieldResponse {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiProperty({ enum: ['company', 'contact', 'opportunity'], example: 'contact' })
  entityType: string;

  @ApiProperty({ example: 'produto_interesse' })
  key: string;

  @ApiProperty({ example: 'Produto de interesse' })
  label: string;

  @ApiProperty({ enum: ['text', 'number', 'date', 'boolean', 'select', 'multiselect'], example: 'select' })
  fieldType: string;

  @ApiProperty({ type: 'array', items: {}, example: ['SGA', 'CRM'] })
  options: unknown[];

  @ApiProperty({ example: false })
  required: boolean;

  @ApiProperty({ type: 'integer', example: 1 })
  position: number;
}

export class SegmentResponse {
  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  id: string;

  @ApiProperty({ format: 'uuid', example: UUID_EXAMPLE })
  organizationId: string;

  @ApiProperty({ example: 'Leads de tecnologia' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Contatos de empresas do setor de tecnologia.' })
  description?: string | null;

  @ApiProperty({ description: 'true para filtros dinâmicos; false para uma lista estática.', example: true })
  isDynamic: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { sector: 'Tecnologia' } })
  filters: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Contadores incluídos na listagem.',
    type: 'object',
    properties: {
      members: { type: 'integer', example: 25 },
      campaigns: { type: 'integer', example: 2 },
    },
  })
  _count?: { members: number; campaigns: number };

  @ApiProperty({ format: 'date-time', example: '2026-07-28T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-28T14:30:00.000Z' })
  updatedAt: string;
}

export class DeletedResponse {
  @ApiProperty({ example: true })
  deleted: boolean;
}

export class ApiErrorResponse {
  @ApiProperty({ type: 'integer', example: 400 })
  statusCode: number;

  @ApiProperty({
    description: 'Mensagem legível ou lista de mensagens de validação.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Dados inválidos',
  })
  message: string | string[];

  @ApiPropertyOptional({ example: 'Bad Request' })
  error?: string;

  @ApiPropertyOptional({ description: 'Detalhes de validação por campo.', type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'UUID do possível registro duplicado.', format: 'uuid', example: COMPANY_UUID_EXAMPLE })
  duplicateId?: string;
}

const CRM_OPENAPI_MODELS = [
  CompanyCreateRequest,
  CompanyUpdateRequest,
  ContactCreateRequest,
  ContactUpdateRequest,
  OpportunityCreateRequest,
  OpportunityUpdateRequest,
  TaskCreateRequest,
  TaskUpdateRequest,
  TagCreateRequest,
  TagUpdateRequest,
  CustomFieldCreateRequest,
  CustomFieldUpdateRequest,
  SegmentCreateRequest,
  SegmentUpdateRequest,
  UserSummaryResponse,
  TeamSummaryResponse,
  CompanyResponse,
  ContactResponse,
  OpportunityResponse,
  TaskResponse,
  TagResponse,
  CustomFieldResponse,
  SegmentResponse,
  DeletedResponse,
  ApiErrorResponse,
] as const;

const envelope = (model: Function) => ({
  type: 'object' as const,
  required: ['data'],
  properties: { data: { $ref: getSchemaPath(model) } },
});

const arrayEnvelope = (model: Function) => ({
  type: 'object' as const,
  required: ['data'],
  properties: {
    data: { type: 'array' as const, items: { $ref: getSchemaPath(model) } },
  },
});

const pageEnvelope = (model: Function) => ({
  type: 'object' as const,
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array' as const, items: { $ref: getSchemaPath(model) } },
    meta: {
      type: 'object' as const,
      required: ['count', 'nextCursor'],
      properties: {
        count: { type: 'integer' as const, description: 'Quantidade retornada nesta página.', example: 25 },
        nextCursor: {
          type: 'string' as const,
          format: 'uuid',
          nullable: true,
          description: 'Cursor para a próxima página. null indica que não há mais resultados.',
          example: UUID_EXAMPLE,
        },
      },
    },
  },
});

const standardErrors = () => applyDecorators(
  ApiBadRequestResponse({ description: 'Parâmetros ou corpo inválidos.', type: ApiErrorResponse }),
  ApiUnauthorizedResponse({ description: 'API Key ausente, inválida, revogada ou expirada.', type: ApiErrorResponse }),
  ApiForbiddenResponse({ description: 'A chave não possui o escopo necessário para esta operação.', type: ApiErrorResponse }),
);

const resourceId = (label: string) => ApiParam({
  name: 'id',
  description: `UUID ${label}.`,
  schema: { type: 'string', format: 'uuid' },
  example: UUID_EXAMPLE,
});

const cursorQueries = () => applyDecorators(
  ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor retornado em meta.nextCursor pela página anterior.',
    schema: { type: 'string', format: 'uuid' },
  }),
  ApiQuery({
    name: 'limit',
    required: false,
    description: 'Quantidade por página.',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  }),
  ApiQuery({
    name: 'search',
    required: false,
    description: 'Busca textual, sem diferenciar maiúsculas e minúsculas.',
    schema: { type: 'string', maxLength: 160 },
  }),
);

const idempotencyHeader = () => ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'Chave única de 8 a 160 caracteres. Repetir a mesma chave e o mesmo corpo devolve a resposta original por 24 horas.',
  schema: { type: 'string', minLength: 8, maxLength: 160, example: 'crm-import-20260728-0001' },
});

export function ApiCrmDocumentationModels() {
  return ApiExtraModels(...CRM_OPENAPI_MODELS);
}

export function ApiListCompaniesDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar empresas',
      description: 'Retorna empresas ativas visíveis para a chave, ordenadas pela atualização mais recente.',
      operationId: 'listCompanies',
    }),
    cursorQueries(),
    ApiQuery({ name: 'ownerId', required: false, description: 'UUID do responsável ou `none` para empresas sem responsável.', schema: { type: 'string' } }),
    ApiQuery({ name: 'teamId', required: false, description: 'UUID da equipe ou `none` para empresas sem equipe.', schema: { type: 'string' } }),
    ApiQuery({ name: 'sector', required: false, description: 'Filtra por setor contendo o texto.', schema: { type: 'string', maxLength: 100 } }),
    ApiQuery({ name: 'size', required: false, description: 'Filtra por porte contendo o texto.', schema: { type: 'string', maxLength: 60 } }),
    ApiQuery({ name: 'hasContacts', required: false, description: 'Filtra empresas com ou sem contatos ativos.', schema: { type: 'boolean' } }),
    ApiOkResponse({ description: 'Página de empresas.', schema: pageEnvelope(CompanyResponse) }),
    standardErrors(),
  );
}

export function ApiGetCompanyDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar empresa',
      description: 'Retorna os dados completos da empresa e seus vínculos de CRM, como contatos, oportunidades, tarefas, notas, atividades e tags.',
      operationId: 'getCompany',
    }),
    resourceId('da empresa'),
    ApiOkResponse({ description: 'Empresa encontrada.', schema: envelope(CompanyResponse) }),
    ApiNotFoundResponse({ description: 'Empresa inexistente, arquivada ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiCreateCompanyDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Criar ou atualizar empresa por externalId',
      description: 'Cria uma empresa. Se externalId já existir na organização, atualiza o registro correspondente. CNPJ ou domínio duplicado sem externalId retorna erro.',
      operationId: 'createCompany',
    }),
    idempotencyHeader(),
    ApiBody({ type: CompanyCreateRequest, description: 'Atributos da empresa.' }),
    ApiCreatedResponse({ description: 'Empresa criada ou atualizada por externalId.', schema: envelope(CompanyResponse) }),
    ApiConflictResponse({ description: 'A Idempotency-Key já foi usada com outro conteúdo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiUpdateCompanyDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Atualizar empresa',
      description: 'Atualiza apenas os atributos enviados. Campos omitidos permanecem inalterados.',
      operationId: 'updateCompany',
    }),
    resourceId('da empresa'),
    ApiBody({ type: CompanyUpdateRequest, description: 'Atributos que serão alterados.' }),
    ApiOkResponse({ description: 'Empresa atualizada.', schema: envelope(CompanyResponse) }),
    ApiNotFoundResponse({ description: 'Empresa inexistente, arquivada ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiArchiveCompanyDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Arquivar empresa',
      description: 'Realiza exclusão lógica. O registro deixa de aparecer nas consultas, mas permanece na auditoria.',
      operationId: 'archiveCompany',
    }),
    resourceId('da empresa'),
    ApiOkResponse({ description: 'Empresa arquivada.', schema: envelope(CompanyResponse) }),
    ApiNotFoundResponse({ description: 'Empresa inexistente, já arquivada ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiListContactsDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar contatos',
      description: 'Retorna contatos ativos visíveis para a chave, ordenados pela atualização mais recente.',
      operationId: 'listContacts',
    }),
    cursorQueries(),
    ApiQuery({ name: 'consent', required: false, description: 'Situação do consentimento.', enum: ['unknown', 'granted', 'revoked'] }),
    ApiQuery({ name: 'emailOnly', required: false, deprecated: true, description: 'Compatibilidade: use hasEmail=true.', schema: { type: 'boolean' } }),
    ApiQuery({ name: 'ownerId', required: false, description: 'UUID do responsável ou `none` para contatos sem responsável.', schema: { type: 'string' } }),
    ApiQuery({ name: 'teamId', required: false, description: 'UUID da equipe ou `none` para contatos sem equipe.', schema: { type: 'string' } }),
    ApiQuery({ name: 'tagId', required: false, description: 'UUID da tag vinculada.', schema: { type: 'string', format: 'uuid' } }),
    ApiQuery({ name: 'company', required: false, description: 'Filtra pelo nome da empresa principal.', schema: { type: 'string', maxLength: 160 } }),
    ApiQuery({ name: 'hasPhone', required: false, description: 'Filtra contatos com ou sem telefone.', schema: { type: 'boolean' } }),
    ApiQuery({ name: 'hasEmail', required: false, description: 'Filtra contatos com ou sem e-mail.', schema: { type: 'boolean' } }),
    ApiOkResponse({ description: 'Página de contatos.', schema: pageEnvelope(ContactResponse) }),
    standardErrors(),
  );
}

export function ApiGetContactDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar contato',
      description: 'Retorna o contato e seus vínculos com empresas, oportunidades, tarefas, consentimentos e conversas.',
      operationId: 'getContact',
    }),
    resourceId('do contato'),
    ApiOkResponse({ description: 'Contato encontrado.', schema: envelope(ContactResponse) }),
    ApiNotFoundResponse({ description: 'Contato inexistente, arquivado ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiCreateContactDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Criar ou atualizar contato por externalId',
      description: 'Cria um contato. Se externalId já existir, atualiza o registro. Telefones equivalentes com ou sem o nono dígito são tratados como duplicados.',
      operationId: 'createContact',
    }),
    idempotencyHeader(),
    ApiBody({ type: ContactCreateRequest, description: 'Atributos do contato.' }),
    ApiCreatedResponse({ description: 'Contato criado ou atualizado por externalId.', schema: envelope(ContactResponse) }),
    ApiConflictResponse({ description: 'A Idempotency-Key já foi usada com outro conteúdo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiUpdateContactDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Atualizar contato',
      description: 'Atualiza apenas os atributos enviados. Use companyId=null para remover a empresa principal.',
      operationId: 'updateContact',
    }),
    resourceId('do contato'),
    ApiBody({ type: ContactUpdateRequest, description: 'Atributos que serão alterados.' }),
    ApiOkResponse({ description: 'Contato atualizado.', schema: envelope(ContactResponse) }),
    ApiNotFoundResponse({ description: 'Contato inexistente, arquivado ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiArchiveContactDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Arquivar contato',
      description: 'Realiza exclusão lógica e libera o número normalizado para um novo cadastro.',
      operationId: 'archiveContact',
    }),
    resourceId('do contato'),
    ApiOkResponse({ description: 'Contato arquivado.', schema: envelope(ContactResponse) }),
    ApiNotFoundResponse({ description: 'Contato inexistente, já arquivado ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiListOpportunitiesDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar oportunidades',
      description: 'Retorna oportunidades ativas visíveis para a chave.',
      operationId: 'listOpportunities',
    }),
    cursorQueries(),
    ApiOkResponse({ description: 'Página de oportunidades.', schema: pageEnvelope(OpportunityResponse) }),
    standardErrors(),
  );
}

export function ApiGetOpportunityDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar oportunidade',
      description: 'Retorna a oportunidade e seus vínculos com empresa, funil, etapa, contatos, tarefas, notas, atividades e tags.',
      operationId: 'getOpportunity',
    }),
    resourceId('da oportunidade'),
    ApiOkResponse({ description: 'Oportunidade encontrada.', schema: envelope(OpportunityResponse) }),
    ApiNotFoundResponse({ description: 'Oportunidade inexistente, arquivada ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiCreateOpportunityDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Criar ou atualizar oportunidade por externalId',
      description: 'Cria uma oportunidade no funil e etapa indicados. Se externalId já existir, atualiza o registro.',
      operationId: 'createOpportunity',
    }),
    idempotencyHeader(),
    ApiBody({ type: OpportunityCreateRequest, description: 'Atributos da oportunidade.' }),
    ApiCreatedResponse({ description: 'Oportunidade criada ou atualizada por externalId.', schema: envelope(OpportunityResponse) }),
    ApiConflictResponse({ description: 'A Idempotency-Key já foi usada com outro conteúdo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiUpdateOpportunityDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Atualizar oportunidade',
      description: 'Atualiza apenas os atributos enviados. A etapa precisa pertencer ao funil informado ou atual.',
      operationId: 'updateOpportunity',
    }),
    resourceId('da oportunidade'),
    ApiBody({ type: OpportunityUpdateRequest, description: 'Atributos que serão alterados.' }),
    ApiOkResponse({ description: 'Oportunidade atualizada.', schema: envelope(OpportunityResponse) }),
    ApiNotFoundResponse({ description: 'Oportunidade inexistente, arquivada ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiArchiveOpportunityDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Arquivar oportunidade',
      description: 'Realiza exclusão lógica. A oportunidade deixa de aparecer nas listagens e no Kanban.',
      operationId: 'archiveOpportunity',
    }),
    resourceId('da oportunidade'),
    ApiOkResponse({ description: 'Oportunidade arquivada.', schema: envelope(OpportunityResponse) }),
    ApiNotFoundResponse({ description: 'Oportunidade inexistente, já arquivada ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiListTasksDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar tarefas',
      description: 'Retorna até 2.000 tarefas do período, em ordem cronológica.',
      operationId: 'listTasks',
    }),
    ApiQuery({ name: 'from', required: false, description: 'Início inclusivo do período em ISO-8601.', schema: { type: 'string', format: 'date-time' } }),
    ApiQuery({ name: 'to', required: false, description: 'Fim exclusivo do período em ISO-8601.', schema: { type: 'string', format: 'date-time' } }),
    ApiQuery({ name: 'status', required: false, description: 'Status da tarefa. ALL não aplica filtro.', enum: ['OPEN', 'COMPLETED', 'CANCELLED', 'ALL'] }),
    ApiOkResponse({ description: 'Lista de tarefas.', schema: arrayEnvelope(TaskResponse) }),
    standardErrors(),
  );
}

export function ApiCreateTaskDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Criar tarefa',
      description: 'Cria uma tarefa vinculada ao responsável informado. Com API Key, assigneeId é obrigatório.',
      operationId: 'createTask',
    }),
    idempotencyHeader(),
    ApiBody({ type: TaskCreateRequest, description: 'Atributos da tarefa.' }),
    ApiCreatedResponse({ description: 'Tarefa criada.', schema: envelope(TaskResponse) }),
    ApiConflictResponse({ description: 'A Idempotency-Key já foi usada com outro conteúdo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiUpdateTaskDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Atualizar tarefa',
      description: 'Atualiza apenas os atributos enviados.',
      operationId: 'updateTask',
    }),
    resourceId('da tarefa'),
    ApiBody({ type: TaskUpdateRequest, description: 'Atributos que serão alterados.' }),
    ApiOkResponse({ description: 'Tarefa atualizada.', schema: envelope(TaskResponse) }),
    ApiNotFoundResponse({ description: 'Tarefa inexistente ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiCompleteTaskDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Concluir tarefa',
      description: 'Altera o status para COMPLETED e registra completedAt.',
      operationId: 'completeTask',
    }),
    resourceId('da tarefa'),
    ApiOkResponse({ description: 'Tarefa concluída.', schema: envelope(TaskResponse) }),
    ApiNotFoundResponse({ description: 'Tarefa inexistente ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiCancelTaskDocumentation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancelar tarefa',
      description: 'Altera o status para CANCELLED. O registro permanece disponível para auditoria.',
      operationId: 'cancelTask',
    }),
    resourceId('da tarefa'),
    ApiOkResponse({ description: 'Tarefa cancelada.', schema: envelope(TaskResponse) }),
    ApiNotFoundResponse({ description: 'Tarefa inexistente ou fora do escopo.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiListTagsDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Listar tags', description: 'Retorna todas as tags em ordem alfabética.', operationId: 'listTags' }),
    ApiOkResponse({ description: 'Lista de tags.', schema: arrayEnvelope(TagResponse) }),
    standardErrors(),
  );
}

export function ApiCreateTagDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Criar tag', description: 'Cria uma tag única na organização.', operationId: 'createTag' }),
    ApiBody({ type: TagCreateRequest }),
    ApiCreatedResponse({ description: 'Tag criada.', schema: envelope(TagResponse) }),
    standardErrors(),
  );
}

export function ApiUpdateTagDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Atualizar tag', description: 'Altera o nome e/ou a cor da tag.', operationId: 'updateTag' }),
    resourceId('da tag'),
    ApiBody({ type: TagUpdateRequest }),
    ApiOkResponse({ description: 'Tag atualizada.', schema: envelope(TagResponse) }),
    ApiNotFoundResponse({ description: 'Tag não encontrada.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiDeleteTagDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Excluir tag', description: 'Exclui definitivamente a tag e seus vínculos.', operationId: 'deleteTag' }),
    resourceId('da tag'),
    ApiOkResponse({ description: 'Tag excluída.', schema: envelope(DeletedResponse) }),
    ApiNotFoundResponse({ description: 'Tag não encontrada.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiListCustomFieldsDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Listar campos personalizados', description: 'Retorna as definições na ordem de exibição.', operationId: 'listCustomFields' }),
    ApiQuery({ name: 'entityType', required: false, description: 'Filtra pelo tipo de registro.', enum: ['company', 'contact', 'opportunity'] }),
    ApiOkResponse({ description: 'Lista de definições.', schema: arrayEnvelope(CustomFieldResponse) }),
    standardErrors(),
  );
}

export function ApiCreateCustomFieldDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Criar campo personalizado', description: 'Cria uma definição de campo para empresas, contatos ou oportunidades.', operationId: 'createCustomField' }),
    ApiBody({ type: CustomFieldCreateRequest }),
    ApiCreatedResponse({ description: 'Campo criado.', schema: envelope(CustomFieldResponse) }),
    standardErrors(),
  );
}

export function ApiUpdateCustomFieldDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Atualizar campo personalizado', description: 'Altera rótulo, opções, obrigatoriedade e/ou posição.', operationId: 'updateCustomField' }),
    resourceId('do campo personalizado'),
    ApiBody({ type: CustomFieldUpdateRequest }),
    ApiOkResponse({ description: 'Campo atualizado.', schema: envelope(CustomFieldResponse) }),
    ApiNotFoundResponse({ description: 'Campo personalizado não encontrado.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiDeleteCustomFieldDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Excluir campo personalizado', description: 'Exclui a definição do campo.', operationId: 'deleteCustomField' }),
    resourceId('do campo personalizado'),
    ApiOkResponse({ description: 'Campo excluído.', schema: envelope(DeletedResponse) }),
    ApiNotFoundResponse({ description: 'Campo personalizado não encontrado.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiListSegmentsDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Listar segmentos', description: 'Retorna segmentos dinâmicos e listas estáticas, com contadores.', operationId: 'listSegments' }),
    ApiOkResponse({ description: 'Lista de segmentos.', schema: arrayEnvelope(SegmentResponse) }),
    standardErrors(),
  );
}

export function ApiCreateSegmentDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Criar segmento', description: 'Cria um segmento dinâmico por filtros ou uma lista estática por contactIds.', operationId: 'createSegment' }),
    ApiBody({ type: SegmentCreateRequest }),
    ApiCreatedResponse({ description: 'Segmento criado.', schema: envelope(SegmentResponse) }),
    standardErrors(),
  );
}

export function ApiUpdateSegmentDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Atualizar segmento', description: 'Atualiza os atributos. Ao enviar contactIds, substitui integralmente os membros estáticos.', operationId: 'updateSegment' }),
    resourceId('do segmento'),
    ApiBody({ type: SegmentUpdateRequest }),
    ApiOkResponse({ description: 'Segmento atualizado.', schema: envelope(SegmentResponse) }),
    ApiNotFoundResponse({ description: 'Segmento não encontrado.', type: ApiErrorResponse }),
    standardErrors(),
  );
}

export function ApiDeleteSegmentDocumentation() {
  return applyDecorators(
    ApiOperation({ summary: 'Excluir segmento', description: 'Exclui definitivamente o segmento e seus vínculos.', operationId: 'deleteSegment' }),
    resourceId('do segmento'),
    ApiOkResponse({ description: 'Segmento excluído.', schema: envelope(DeletedResponse) }),
    ApiNotFoundResponse({ description: 'Segmento não encontrado.', type: ApiErrorResponse }),
    standardErrors(),
  );
}
