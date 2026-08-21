# Dicionário de dados — BZS One

> Extraído de `packages/database/prisma/schema.prisma`.  
> Progresso: entidades dos 3 primeiros módulos; os demais domínios serão adicionados nos próximos checkpoints.

## Convenções globais

- Identificadores principais são UUIDs.
- Datas são `DateTime` UTC no banco; apresentação usa `America/Sao_Paulo`.
- `organizationId` é a fronteira obrigatória de isolamento lógico.
- Campos `archivedAt` implementam exclusão lógica.
- Campos `Json` guardam estruturas flexíveis validadas nos contratos/serviços.

## Identidade e acesso

### `Organization`

| Campo | Tipo | Obrigatório/padrão | Significado |
| --- | --- | --- | --- |
| `id` | UUID | gerado | Organização única do sistema. |
| `name`, `slug` | String | sim; `slug` único | Identidade da empresa. |
| `timezone` | String | `America/Sao_Paulo` | Fuso operacional. |
| `currency` | String | `BRL` | Moeda padrão. |
| `messageRetentionMonths` | Int | `24` | Retenção de mensagens/mídias. |

### `Team`

`id`, `organizationId`, `name`, `color` (`#4f46e5`), timestamps. Nome é único dentro da organização; relaciona usuários, carteiras e instâncias.

### `Role` e `RolePermission`

| Entidade | Campos centrais | Restrições |
| --- | --- | --- |
| `Role` | `organizationId`, `name`, `key`, `description?`, `isSystem=false` | `key` única por organização. |
| `RolePermission` | `roleId`, `resource`, `action`, `scope` | combinação única; `scope` padrão `OWN`. |

`DataScope`: `ALL`, `TEAM`, `OWN`.

### `User`

| Campo | Tipo | Obrigatório/padrão | Significado |
| --- | --- | --- | --- |
| `organizationId`, `roleId` | UUID | sim | Organização e papel. |
| `teamId`, `profilePhotoId` | UUID? | não | Equipe e foto. |
| `name`, `email` | String | sim | Identificação; e-mail único por organização. |
| `passwordHash` | String? | não no convite | Hash Argon2 após ativação. |
| `status` | `UserStatus` | `INVITED` | `INVITED`, `ACTIVE`, `SUSPENDED`. |
| `messageSignatureEnabled` | Boolean | `false` | Preferência persistente de assinatura. |
| `lastLoginAt` | DateTime? | não | Última autenticação. |

### `Session`

`id`, `userId`, `tokenHash` único, `csrfHash`, IP/user-agent opcionais, `expiresAt`, `lastSeenAt`, `createdAt`. Exclusão em cascata ao remover usuário.

### `InviteToken` e `PasswordResetToken`

Ambos guardam `tokenHash`, destinatário, criador, expiração, consumo (`usedAt`) e telemetria de entrega (`emailStatus`, tentativas, ID do provedor, erro). O token bruto não é persistido.

### `ApiKey`

🟢 **CONFIRMADO** no schema: organização, nome, prefixo, `keyHash`, lista JSON de escopos, expiração/uso/revogação e timestamps. A chave bruta aparece uma única vez.

## CRM comercial

### `Company`

| Grupo | Campos |
| --- | --- |
| Escopo | `organizationId`, `teamId?`, `ownerId?` |
| Identidade | `name`, `legalName?`, `cnpj?`, `domain?`, `linkedinUrl?`, `externalId?` |
| Perfil | `sector?`, `size?`, `phone?`, `address` JSON |
| Extensão | `logoId?`, `customFields` JSON |
| Ciclo de vida | `archivedAt?`, `createdAt`, `updatedAt` |

`externalId` é único por organização. CNPJ, domínio e nome possuem índices de busca; deduplicação efetiva é aplicada pelo serviço.

### `Contact`

| Grupo | Campos |
| --- | --- |
| Escopo | `organizationId`, `teamId?`, `ownerId?`, `primaryCompanyId?` |
| Identidade | `name`, `jobTitle?`, `email?`, `phone?`, `phoneKey?`, `externalId?` |
| Origem | `source?` |
| Consentimento | `consentStatus=UNKNOWN`, fonte/evidência, datas de concessão/revogação |
| Campanhas | `campaignsBlocked=false` |
| Extensão/ciclo | `customFields`, `archivedAt?`, timestamps |

`phoneKey` e `externalId` são únicos por organização. `ContactCompany` permite várias empresas com flag `isPrimary`.

### `Pipeline` e `PipelineStage`

| Entidade | Campos | Regras estruturais |
| --- | --- | --- |
| `Pipeline` | organização, nome, descrição, `isActive=true` | nome único por organização. |
| `PipelineStage` | pipeline, nome, cor, posição, probabilidade, `isWon`, `isLost` | posição única no pipeline. |

### `Opportunity`

| Grupo | Campos |
| --- | --- |
| Relações | `pipelineId`, `stageId`, `companyId?`, `teamId?`, `ownerId?` |
| Negócio | `title`, `status=OPEN`, `valueCents=0`, `currency=BRL`, `probability=0`, `expectedCloseAt?`, `source?` |
| Proposta | `proposalUrl?`, `proposalAssetId?`, `proposalAddedAt?` |
| Fechamento | `lossReason?`, `wonAt?`, `lostAt?` |
| Extensão/ciclo | `externalId?`, `customFields`, `archivedAt?`, timestamps |

`OpportunityContact` cria relação N:N e identifica contato principal.

### `Task`

`organizationId`, equipe/responsável/criador, vínculos opcionais a empresa/contato/oportunidade, título, descrição, `dueAt`, prioridade (`LOW|MEDIUM|HIGH`), status (`OPEN|COMPLETED|CANCELLED`) e `completedAt`. Pode possuir exatamente um follow-up associado.

### `Note`, `Activity`, `Tag`, `CustomFieldDefinition`, `Segment`

- `Note`: autor, corpo e exatamente os vínculos comerciais aplicáveis.
- `Activity`: usuário opcional, tipo/título/detalhes e instante; indexada por entidade/data.
- `Tag`: nome único por organização e cor; tabelas N:N para empresa, contato e oportunidade.
- `CustomFieldDefinition`: entidade, chave, label, tipo, opções JSON, obrigatoriedade e posição.
- `Segment`: nome único, filtros JSON, `isDynamic=true`; `SegmentMember` materializa contatos de listas estáticas.

## WhatsApp e Inbox

### `WhatsappInstance`

`organizationId`, nome, `instanceKey`, telefone, `InstanceStatus`, datas de conexão/evento/QR, `archivedAt` e timestamps. `instanceKey` é única na organização; `WhatsappInstanceTeam` controla acesso N:N.

`InstanceStatus`: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `ERROR`, `PAUSED`.

### `WarmupProfile`

Capacidade inicial/atual/máxima, incremento diário, delays de bolha/contato/lote, tamanho do lote, janela e dias de envio, contadores diários e último reset. Relação 1:1 com instância.

### `Conversation`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId`, `instanceId`, `contactId` | UUID | Isolamento, número e contato. |
| `assigneeId` | UUID? | Atendente atual. |
| `remoteJid` | String | Endereço corrente do WhatsApp. |
| `phoneJid` | String? | JID telefônico preservado. |
| `status` | `WAITING` | `WAITING`, `OPEN`, `CLOSED`. |
| `unreadCount` | `0` | Mensagens ainda não lidas. |
| `lastMessageAt`, `firstResponseAt`, `closedAt` | DateTime? | Métricas e ciclo do atendimento. |

Unicidade por instância para `remoteJid` e `phoneJid`; índices suportam listagem por status/responsável/data.

### `ConversationPin` e `ConversationEvent`

- `ConversationPin`: chave composta usuário/conversa e data de fixação.
- `ConversationEvent`: organização, conversa, ator opcional, tipo livre, texto, metadata JSON e data; representa logs internos não enviados ao cliente.

### `Message`

| Grupo | Campos |
| --- | --- |
| Identidade | `instanceId`, `conversationId`, `providerMessageId` |
| Conteúdo | `direction`, `type`, `text?`, `payload` JSON |
| Entrega | `status=PENDING`, `sentAt?`, `deliveredAt?`, `readAt?` |
| Transcrição | status, texto, erro, provedor e data opcionais |
| Ciclo | `createdAt`, `updatedAt` |

`(instanceId, providerMessageId)` é único. `MessageStatus`: `PENDING`, `QUEUED`, `SENT`, `DELIVERED`, `READ`, `REPLIED`, `FAILED`, `SKIPPED`, `OPTED_OUT`.

### `MediaAsset`

Chave S3 única, nome, MIME type, tamanho, expiração opcional e relações exclusivas com mensagem, foto, logo, resposta rápida, proposta ou documento de IA.

### `InboundWebhookEvent`

Provedor, `instanceKey`, chave/tipo do evento, payload JSON, estado textual, erro e timestamps. A combinação `(provider, instanceKey, eventKey)` impede ingestão duplicada.

## Campanhas e e-mail

### `Campaign`

| Grupo | Campos |
| --- | --- |
| Identidade | `organizationId`, `instanceId?`, `segmentId?`, `createdById`, `name` |
| Canal | `channel=WHATSAPP`, `emailSubject?` |
| Estado | `status=DRAFT`, `scheduledAt?`, `startedAt?`, `completedAt?`, `archivedAt?` |
| Cadência | atrasos mínimo/máximo entre bolhas, contatos e lotes; `batchSize` |
| Janela | `sendingWindowStart=00:00`, `sendingWindowEnd=23:59`, `sendingDays=[0..6]` |
| Métricas | `sentRecipientCount`, `stats` JSON |

Índices cobrem organização/estado/agendamento e listagem ativa por criador/data.

### `CampaignBubble`

Posição única dentro da campanha, tipo, conteúdo e `mediaKey?`. Define a sequência geral usada por contatos da agenda.

### `CampaignRecipient`

| Campo | Significado |
| --- | --- |
| `campaignId`, `contactId` | Par único campanha/contato. |
| `status` | Estado de entrega compartilhado com mensagens. |
| `exclusionReason` | Motivo de bloqueio, falha ou descarte. |
| `messages` | Sequência personalizada importada do CSV. |
| `whatsappVerifiedAt` | Validade da consulta de existência do número. |
| `lastBubblePosition` | Última bolha confirmada. |
| `providerMessageId` | ID SMTP/Mailgun único quando aplicável. |
| timestamps | agendado, enviado, entregue, aberto, clicado, falhou e respondeu. |

### `EmailDeliveryEvent`

Evento imutável e deduplicado por `providerEventId`, ligado ao destinatário, com tipo, severidade, e-mail, payload e horário do provedor.

### `EmailTemplate`

Nome único por organização, assunto, HTML, texto opcional e timestamps. É independente da versão efetivamente copiada para uma campanha.

### `Suppression`

Par único contato/canal, razão e data. Bloqueia envio de WhatsApp ou e-mail independentemente da campanha.

## Chatbots

### `Chatbot`

Organização, instância, criador, nome, descrição, estado, motor `RULES|OPENAI`, configuração JSON e número da versão publicada. Índices priorizam instância/estado e listagem por organização/criador.

### `ChatbotVersion`

Número único por chatbot, grafo JSON, data de publicação e criação. Uma versão publicada não é alterada; novas edições criam a próxima versão.

### `ChatbotSession`

| Campo | Significado |
| --- | --- |
| `chatbotId`, `versionId` | Bot e versão fixada. |
| `conversationId` | Relação única: uma sessão persistida por conversa. |
| `status` | `ACTIVE`, `WAITING`, `COMPLETED`, `HANDED_OFF`, `STOPPED`, `FAILED`. |
| `currentNodeId` | Bloco atual ou fronteira de retomada. |
| `lastInboundMessageId` | Idempotência da mensagem recebida. |
| `context` | Dados coletados e contexto da conversa. |
| `wakeAt` | Retomada de espera temporal. |
| `stopReason`, timestamps | Diagnóstico e ciclo da sessão. |

### `ChatbotStepExecution`

Etapa única por sessão/bloco/mensagem de entrada. Mantém input, output, estado, erro e timestamps, permitindo retomar sem repetir envio.

## Automações

### `Workflow`

Organização, criador, nome, descrição, `WorkflowStatus`, versão publicada e política de reentrada (`once_per_version` e cooldown opcional). O código atual aplica a deduplicação por versão no fluxo em lote e cria nova execução no início manual pelo chat.

### `WorkflowVersion`

Número único dentro do workflow, grafo JSON, publicação e criação. Também pode ser fixada por follow-up automático.

### `WorkflowEnrollment`

| Campo | Significado |
| --- | --- |
| `workflowId`, `versionId`, `contactId` | Jornada, versão e contato. |
| `status` | `ACTIVE`, `WAITING`, `COMPLETED`, `STOPPED`, `FAILED`. |
| `currentNodeId`, `wakeAt` | Posição e retomada persistentes. |
| `context` | Origem manual/conversa, instância e usuário iniciador. |
| `stopReason`, timestamps | Resultado e duração. |

Índices cobrem esperas vencendo, workflow/contato e contato/estado.

### `WorkflowStepExecution`

Registro de cada passagem por nó, com estado, input/output, erro, início e conclusão. Diferentemente do chatbot, múltiplas passagens não possuem uma restrição única composta.
