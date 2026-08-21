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

## Follow-ups automáticos

### `ConversationFollowUp`

| Grupo | Campos |
| --- | --- |
| Vínculos | `organizationId`, `conversationId`, `taskId`, `createdById`, `responsibleId` |
| Ação | `mode=MESSAGE_SEQUENCE|WORKFLOW`, `workflowVersionId?`, `workflowEnrollmentId?` |
| Estado | `status=SCHEDULED`, `scheduledAt`, `revision=1` |
| Resultado | `startedAt?`, `completedAt?`, `cancelledAt?`, `cancellationReason?`, `failureReason?` |
| Ciclo | `createdAt`, `updatedAt` |

`taskId` e `workflowEnrollmentId` são únicos. Índices cobrem estado/horário por organização e responsável. Uma migração adiciona índice parcial único por conversa quando o estado é `SCHEDULED` ou `RUNNING`.

### `ConversationFollowUpStep`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `followUpId`, `position` | UUID, Int | Ordem única dentro da sequência. |
| `messageId` | UUID? único | Mensagem efetivamente criada para a etapa. |
| `text` | String? | Texto editável e sujeito a variáveis. |
| `messageType` | `text` | Texto, imagem ou documento. |
| `mediaKey`, `mediaName`, `mediaType` | String? | Referência segura e metadados do anexo. |
| `delaySeconds` | `0` | Espera após a etapa anterior. |
| `status` | `PENDING` | `PENDING`, `QUEUED`, `SENT`, `CANCELLED`, `FAILED`. |
| `scheduledAt`, `sentAt`, `failureReason` | opcionais | Execução e diagnóstico. |

Índices suportam busca por sequência/estado/posição e reconciliação global por estado/horário.

## Inteligência artificial e RAG

### `OrganizationAiSettings`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId` | UUID, chave primária | Uma configuração por organização. |
| `enabled` | `false` | Liberação administrativa dos recursos de IA. |
| `globalInstructions` | `""` | Regras gerais agregadas ao system prompt. |
| `fallbackMessage` | texto padrão | Mensagem antes do handoff por indisponibilidade. |
| `model` | `gpt-5.6-luna` | Modelo escolhido na lista curada. |
| `openAiApiKeyEncrypted` | String? | Chave da organização cifrada no backend. |
| `openAiApiKeyLastFour` | String? | Indicador seguro exibido na configuração. |
| `openAiVectorStoreId` | String? | Índice vetorial remoto compartilhado pela organização. |
| `updatedById`, timestamps | opcionais/ciclo | Auditoria administrativa. |

### `AiKnowledgeDocument`

Documento único por `mediaAssetId`, com organização, criador, estado `INDEXING|READY|FAILED|DELETING`, IDs do arquivo e vínculo vetorial na OpenAI, erro, data de indexação e timestamps. Índices cobrem listagem por organização/estado e recuperação de processamento abandonado.

### `ConversationAiGeneration`

| Grupo | Campos |
| --- | --- |
| Origem | `organizationId`, `conversationId?`, `requestedById?`, `chatbotSessionId?` |
| Tipo/estado | `type`, `status=PENDING`, `scope?` |
| Idempotência | `deduplicationKey` único, primeira/última mensagem de origem |
| Processamento | `input`, `result`, `progress`, `model`, `error` |
| Métricas | tokens de entrada/saída e duração total em ms |
| Ciclo | criação, atualização e conclusão |

Tipos: `SUMMARY`, `REPLY_SUGGESTION`, `CHATBOT_REPLY`, `CONFIG_TEST`. Estados: `PENDING`, `WAITING_INPUT`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `STALE`.

### `ConversationAiProposal`

Proposta única por geração, ligada a conversa e contato. `changes` mantém campos sugeridos; `appliedFields` registra aplicação parcial; estados são `PENDING`, `PARTIALLY_APPLIED`, `APPLIED` e `DISMISSED`, com usuário/data da decisão.

## Mídias e transcrição

### `MediaAsset`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `id` | UUID | Identificador usado para pedir URL temporária. |
| `messageId` | UUID? | Mensagem proprietária quando é anexo de conversa. |
| `key` | String única | Caminho privado no bucket, prefixado pela organização. |
| `filename` | String | Nome original para exibição/download. |
| `contentType` | String | MIME validado no upload e na confirmação. |
| `sizeBytes` | Int | Tamanho declarado e posteriormente confirmado. |
| `expiresAt` | DateTime? | Campo opcional para ciclo temporário. |
| `createdAt` | DateTime | Criação do registro. |

Relações 1:1 opcionais e exclusivas: foto de usuário, logo de empresa, resposta rápida, proposta de oportunidade e documento da base de IA. Relação N:1 opcional com mensagem.

### Campos de transcrição em `Message`

| Campo | Significado |
| --- | --- |
| `transcriptionStatus` | Estado textual: ausente/`PROCESSING`/`COMPLETED`/`FAILED`. |
| `transcriptionText` | Texto final persistido e reutilizado. |
| `transcriptionError` | Diagnóstico terminal limitado. |
| `transcriptionProvider` | Host do provedor e modelo usado. |
| `transcribedAt` | Data de conclusão. |

Não há tabela separada de transcrição: a reserva idempotente e o resultado vivem na própria mensagem.

## Relatórios e webhooks externos

### `ReportSummary` (estrutura calculada, não persistida)

| Grupo | Campos |
| --- | --- |
| Período | `from`, `to` |
| Funil | etapa, cor, quantidade e valor em centavos |
| Vendas | abertas, ganhas, perdidas, valores e taxa de conversão |
| Inbox | conversas iniciadas, abertas e média da primeira resposta |
| Campanhas | total e contagens por estado de destinatário |
| Operação | grupos de atividades e tarefas |

### `OutboundWebhook`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId` | UUID | Isolamento do cadastro por organização. |
| `name` | String | Nome de 2 a 120 caracteres. |
| `url` | String | Endpoint HTTP(S) público validado. |
| `secretEncrypted` | String | Segredo HMAC cifrado e nunca relistado. |
| `events` | JSON | No fluxo atual, lista com uma ação selecionada. |
| `enabled` | `true` no schema | A API cria explicitamente como `false`. |
| timestamps | DateTime | Criação e última alteração. |

### `WebhookDelivery`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `webhookId`, `eventId` | UUID/String, par único | Idempotência por webhook e evento. |
| `eventType` | String | Ação comercial que originou a entrega. |
| `payload` | JSON | Tipo/ID da entidade e estados anterior/posterior. |
| `attempts` | `0` | Tentativas efetivamente processadas. |
| `status` | `pending` | `pending`, `retrying`, `delivered` ou `dead_letter`. |
| `nextAttemptAt` | DateTime? | Diagnóstico do próximo retry calculado. |
| `deliveredAt`, `lastError` | opcionais | Resultado final ou última falha. |

O índice por estado/próxima tentativa auxilia operação e inspeção; o agendamento efetivo das retentativas fica no BullMQ.

## Respostas rápidas

### `QuickReply`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId` | UUID | Catálogo compartilhado da organização. |
| `createdById` | UUID | Usuário autor. |
| `mediaAssetId` | UUID? único | Imagem ou documento opcional de uso exclusivo. |
| `title` | String | Nome legível, até 100 caracteres. |
| `shortcut` | String | Comando normalizado sem `/`, até 40 caracteres. |
| `text` | String? | Conteúdo editável, até 4.096 caracteres. |
| timestamps | DateTime | Criação e atualização. |

O par organização/atalho é único. O índice organização/título/ID apoia a listagem, e o asset ligado usa `onDelete: SetNull`.

## Tempo real e notificações

### `Notification`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId` | UUID | Organização do evento. |
| `userId` | UUID | Destinatário individual. |
| `type` | String | Categoria livre, como mensagem, atribuição, follow-up ou handoff. |
| `title` | String | Resumo visível no popover. |
| `body` | String? | Contexto curto opcional. |
| `actionUrl` | String? | Rota interna aberta ao clicar. |
| `readAt` | DateTime? | Ausente enquanto não lida. |
| `createdAt` | DateTime | Ordenação decrescente. |

Índices cobrem as 100 notificações recentes por usuário e atualização em massa das não lidas.

### Envelope Redis/Socket.IO (não persistido)

| Campo | Significado |
| --- | --- |
| `organizationId` | Sala organizacional que receberá o evento. |
| `userId?` | Sala individual adicional, quando necessário. |
| `event` | Nome dinâmico: Inbox, tarefas, conexões, IA ou conhecimento. |
| `payload?` | IDs e indicadores mínimos para invalidação seletiva. |

## API externa e MCP

### `ApiKey`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId` | UUID | Organização autorizada pela credencial. |
| `createdById` | UUID | Administrador que emitiu a chave. |
| `name` | String | Identificação operacional da integração. |
| `prefix` | String | Trecho não secreto usado para identificação visual. |
| `keyHash` | SHA-256 único | Única representação persistida do segredo. |
| `scopes` | JSON | Lista de permissões `recurso:ação`. |
| `expiresAt` | DateTime? | Expiração opcional. |
| `lastUsedAt` | DateTime? | Uso atualizado no máximo uma vez a cada cinco minutos. |
| `revokedAt` | DateTime? | Revogação lógica e imediata. |
| `createdAt` | DateTime | Emissão da credencial. |

### `IdempotencyRecord`

| Campo | Tipo/padrão | Significado |
| --- | --- | --- |
| `organizationId`, `key`, `route` | chave composta única | Uma resposta por operação externa identificada. |
| `requestHash` | SHA-256 | Detecta reutilização da mesma chave com corpo diferente. |
| `responseCode` | Int | Status HTTP originalmente devolvido. |
| `responseBody` | JSON | Resultado reproduzido em tentativas idênticas. |
| `expiresAt` | DateTime | Retenção de 24 horas e índice de limpeza. |
| `createdAt` | DateTime | Primeira execução aceita. |

### Contrato de ferramenta MCP (não persistido)

| Campo | Significado |
| --- | --- |
| `name` | Uma das 27 operações registráveis. |
| `inputSchema` | Schema Zod convertido no contrato MCP. |
| `annotations` | Indica leitura/criação/atualização, idempotência e ausência de destruição. |
| `content` | Resultado serializado para leitura textual da LLM. |
| `structuredContent` | Mesmo resultado preservado como objeto estruturado. |

## Interface web

### `UserContext` (estado de sessão no navegador)

| Grupo | Campos |
| --- | --- |
| Identidade | `id`, `name`, `email`, `roleKey`, `teamId?`, `profilePhotoAssetId?` |
| Autorização | `permissions[{ resource, action, scope }]` |
| Preferências | tema persistido e assinatura de atendimento retornada pela API |

O contexto é obtido novamente de `/auth/me`; o evento local entre abas comunica apenas `login`, `logout` ou `expired`, horário e nonce, sem transportar credenciais.

### `ToastMessage` (efêmero)

| Campo | Significado |
| --- | --- |
| `id` | Identificador local único. |
| `tone` | `success`, `error`, `info` ou `warning`. |
| `title`, `message` | Conteúdo curto exibido no canto superior direito. |
| `durationMs` | Tempo ativo, pausado durante hover ou foco. |

### `SearchResult` (calculado)

| Campo | Significado |
| --- | --- |
| `id` | ID da entidade de origem. |
| `type` | `conversation`, `company`, `contact` ou `opportunity`. |
| `section` | Agrupamento visual. |
| `title`, `subtitle` | Identificação e contexto do resultado. |
| `target` | Rota interna de destino. |

## Plataforma assíncrona

### Envelope de job BullMQ (não é fonte de verdade)

| Campo | Significado |
| --- | --- |
| `name` | Operação pequena, como enviar mensagem, avançar fluxo ou gerar IA. |
| `data` | Normalmente apenas o ID persistido necessário para recarregar o domínio. |
| `jobId` | Identificador determinístico usado para deduplicação/reconciliação. |
| `delay` | Instante futuro expresso como atraso em milissegundos. |
| `attempts/backoff` | Política de retry, geralmente exponencial. |
| `priority` | Prioridade explícita nas gerações de IA. |

Redis retém no máximo 1.000 jobs concluídos e 5.000 falhos por fila. Estados comerciais, mensagens, etapas e diagnósticos permanecem em suas tabelas PostgreSQL correspondentes.

### Lock de sincronização Evolution (efêmero)

| Campo | Significado |
| --- | --- |
| chave | `prospecta:evolution-recent-sync-lock`. |
| valor | PID e timestamp do worker proprietário. |
| validade | 30 segundos com aquisição `NX`. |

A liberação usa compare-and-delete em Lua para não apagar um lock que já tenha expirado e sido adquirido por outro processo.

## Infraestrutura e operação

### Serviços de produção

| Serviço | Porta interna | Persistência | Redes | Exposição padrão |
| --- | ---: | --- | --- | --- |
| `caddy` | 80/443/9002 | certificados/configuração | `edge`, `app` | 80/443 TCP e 443 UDP |
| `web` | 80 | imagem imutável | `app` | somente Caddy |
| `api` | 3000 | PostgreSQL/MinIO indiretos | `app`, `egress` | somente Caddy |
| `mcp` | 3100 | nenhuma local | `app` | `/mcp` via Caddy |
| `worker` | — | PostgreSQL/Redis/MinIO indiretos | `app`, `egress` | nenhuma |
| `postgres` | 5432 | `postgres_data` | `app` | nenhuma |
| `redis` | 6379 | `redis_data` AOF | `app` | nenhuma |
| `minio` | 9000/9001 | `minio_data` | `app` | API em loopback 9000 |
| `evolution` | 8080 | instâncias + banco/MinIO próprios | `app`, `egress` | loopback 8082 |
| `transcription` | 8000 | modelos Hugging Face | `app`, `egress` | loopback 8000 |

### Grupos de configuração por ambiente

| Grupo | Variáveis principais | Regra |
| --- | --- | --- |
| Endereçamento | `APP_ADDRESS`, `APP_URL`, `VITE_API_URL`, `VITE_SOCKET_URL`, `CORS_ORIGINS` | Browser usa rotas relativas em produção. |
| Banco/fila | `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL` | Credenciais do CRM não são compartilhadas com Evolution. |
| Sessão/criptografia | `SESSION_SECRET`, `JWT_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY` | Segredos obrigatórios e não versionados. |
| Mídia | `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_DELIVERY_ENDPOINT`, `S3_*` | Endpoints interno, browser e Evolution podem ser diferentes. |
| WhatsApp | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_*` | Serviço não é publicado pela borda. |
| E-mail | `MAILGUN_*`, `CAMPAIGN_GMAIL_*` | Mailgun interno; Gmail apenas campanhas manuais. |
| Transcrição | `TRANSCRIPTION_*`, `SPEACHES_IMAGE` | CPU/int8 e modelo persistente. |
| IA | `AI_ASSISTANT_ENABLED`, `OPENAI_*` | Recurso opcional; configuração organizacional pode guardar a chave. |
| Backup | `BACKUP_DIR`, `BACKUP_UPLOAD_COMMAND`, `BACKUP_ENCRYPTION_KEY` | Chave está declarada, mas não consumida pelo script atual. |

### Artefato de backup atual

| Conteúdo | Formato | Incluído? |
| --- | --- | --- |
| Banco CRM | `pg_dump -Fc` | Sim. |
| Banco Evolution | `pg_dump -Fc` | Sim. |
| Mídias CRM | `tar.gz` do volume MinIO | Sim. |
| Mídias Evolution | volume `evolution_minio_data` | Não. |
| Instâncias Evolution | volume `evolution_instances` | Não. |
| Criptografia | uso de `BACKUP_ENCRYPTION_KEY` | Não. |
| Restauração verificável | script/manifeste de restore | Não. |
