import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadGatewayResponse, ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { PublicMessagesService } from './public-messages.service.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const optionResponse = (properties: Record<string, object>) => ({
  type: 'object' as const,
  properties: { data: { type: 'array' as const, items: { type: 'object' as const, properties } } },
});

@ApiTags('Mensagens')
@ApiUnauthorizedResponse({ description: 'Chave de API ou sessão inválida.' })
@ApiForbiddenResponse({ description: 'Permissão ou escopo insuficiente.' })
@RequirePermission('conversations', 'write')
@Controller('messages')
export class PublicMessagesController {
  constructor(private readonly messages: PublicMessagesService) {}

  @Get('users')
  @ApiOperation({ summary: 'Listar usuários para atribuição', description: 'Retorna usuários ativos da organização e os IDs das suas equipes. Exige conversations:write.' })
  @ApiOkResponse({ schema: optionResponse({ id: uuid, name: { type: 'string' }, teamIds: { type: 'array', items: uuid } }) })
  async users(@CurrentUser() auth: AuthContext) { return { data: await this.messages.users(auth) }; }

  @Get('teams')
  @ApiOperation({ summary: 'Listar equipes para atribuição', description: 'Retorna equipes acessíveis da organização. isDefault identifica a equipe Geral. Exige conversations:write.' })
  @ApiOkResponse({ schema: optionResponse({ id: uuid, name: { type: 'string' }, isDefault: { type: 'boolean' } }) })
  async teams(@CurrentUser() auth: AuthContext) { return { data: await this.messages.teams(auth) }; }

  @Get('connections')
  @ApiOperation({ summary: 'Listar conexões para envio', description: 'Retorna conexões conectadas e acessíveis. Use id como instanceId no envio. Exige conversations:write.' })
  @ApiOkResponse({ schema: optionResponse({ id: uuid, name: { type: 'string' }, phone: { type: 'string', nullable: true }, status: { type: 'string', enum: ['CONNECTED'] } }) })
  async connections(@CurrentUser() auth: AuthContext) { return { data: await this.messages.connections(auth) }; }

  @Post('send')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Enviar mensagem para um número',
    description: 'Enfileira uma mensagem de texto pelo WhatsApp e cadastra automaticamente o contato quando necessário. Exige conversations:write e contacts:write. Atribuições explícitas atualizam o contato e o atendimento; campos omitidos preservam atribuições existentes. Sem atendente, o atendimento fica WAITING. O envio é assíncrono. Repetir a mesma chave e conteúdo retorna os mesmos IDs por 24 horas.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Identificador único desta requisição (8 a 160 caracteres). Use a mesma chave ao tentar novamente.', schema: { type: 'string', minLength: 8, maxLength: 160 }, example: 'pedido-1024-mensagem-1' })
  @ApiBody({ required: true, schema: {
    type: 'object', additionalProperties: false, required: ['phone', 'text', 'instanceId'],
    properties: {
      phone: { type: 'string', description: 'Número internacional com código do país e DDD. Aceita + e máscara; normaliza números brasileiros com e sem o nono dígito.', example: '+5545999990000', maxLength: 32 },
      text: { type: 'string', description: 'Conteúdo da mensagem de texto.', minLength: 1, maxLength: 10_000, example: 'Olá! Podemos conversar?' },
      instanceId: { ...uuid, description: 'ID da conexão retornado por GET /messages/connections.' },
      teamId: { ...uuid, description: 'Equipe do contato e do atendimento. Se omitida, usa a equipe existente ou Geral.' },
      assigneeId: { ...uuid, nullable: true, description: 'Usuário ativo pertencente à equipe selecionada. Atualiza o responsável pelo contato e atendimento. null remove a atribuição; omitido preserva o atendente existente ou usa o usuário da sessão.' },
      contactName: { type: 'string', minLength: 2, maxLength: 180, description: 'Nome utilizado somente ao criar o contato. Se omitido, usa o número.', example: 'Maria Silva' },
    },
  } })
  @ApiAcceptedResponse({ description: 'Mensagem registrada e enfileirada. QUEUED ainda não confirma entrega.', schema: {
    type: 'object', properties: { data: {
      type: 'object', properties: {
        contactId: uuid, contactCreated: { type: 'boolean' }, conversationId: uuid, messageId: uuid,
        instanceId: uuid, teamId: uuid, assigneeId: { ...uuid, nullable: true }, status: { type: 'string', enum: ['QUEUED'] },
      },
    } },
  } })
  @ApiBadRequestResponse({ description: 'Corpo ou chave inválida, número sem WhatsApp, conexão indisponível ou atribuição inválida.' })
  @ApiConflictResponse({ description: 'Idempotency-Key já utilizado com outro conteúdo.' })
  @ApiBadGatewayResponse({ description: 'Falha ao verificar o número na Evolution API.' })
  @ApiServiceUnavailableResponse({ description: 'Falha ao enfileirar. Repita com a mesma chave para recuperar o envio registrado.' })
  async send(@CurrentUser() auth: AuthContext, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    return { data: await this.messages.send(auth, body, key) };
  }
}
