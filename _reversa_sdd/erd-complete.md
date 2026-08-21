# ERD completo — BZS One

> As 63 entidades Prisma foram divididas em sete diagramas para preservar legibilidade. Campos mostrados são chaves e atributos arquiteturalmente relevantes; o dicionário completo por campo permanece em `schema.prisma` e [`data-dictionary.md`](data-dictionary.md). Todas as relações são 🟢 confirmadas.

## 1. Organização, identidade e acesso

```mermaid
erDiagram
  Organization {
    uuid id PK
    string name
    string slug UK
    string timezone
    string currency
    int messageRetentionMonths
  }
  Team {
    uuid id PK
    uuid organizationId FK
    string name
    string color
  }
  Role {
    uuid id PK
    uuid organizationId FK
    string key
    string name
    boolean isSystem
  }
  RolePermission {
    uuid id PK
    uuid roleId FK
    string resource
    string action
    DataScope scope
  }
  User {
    uuid id PK
    uuid organizationId FK
    uuid teamId FK
    uuid roleId FK
    uuid profilePhotoId FK
    string email
    UserStatus status
    boolean messageSignatureEnabled
  }
  Session {
    uuid id PK
    uuid userId FK
    string tokenHash UK
    string csrfHash
    datetime expiresAt
  }
  InviteToken {
    uuid id PK
    uuid userId FK
    uuid createdById FK
    string tokenHash UK
    datetime expiresAt
    InviteEmailStatus emailStatus
  }
  PasswordResetToken {
    uuid id PK
    uuid userId FK
    uuid createdById FK
    string tokenHash UK
    datetime expiresAt
    InviteEmailStatus emailStatus
  }
  ApiKey {
    uuid id PK
    uuid organizationId FK
    uuid createdById FK
    string prefix
    string keyHash UK
    json scopes
    datetime revokedAt
  }
  AuditLog {
    uuid id PK
    uuid organizationId FK
    uuid userId FK
    string action
    string entityType
    string entityId
    json before
    json after
  }

  Organization ||--o{ Team : possui
  Organization ||--o{ Role : define
  Role ||--o{ RolePermission : concede
  Organization ||--o{ User : emprega
  Team o|--o{ User : agrupa
  Role ||--o{ User : autoriza
  User ||--o{ Session : autentica
  User ||--o{ InviteToken : recebe
  User ||--o{ InviteToken : cria
  User ||--o{ PasswordResetToken : recebe
  User ||--o{ PasswordResetToken : cria
  Organization ||--o{ ApiKey : emite
  User ||--o{ ApiKey : cria
  Organization ||--o{ AuditLog : registra
  User o|--o{ AuditLog : executa
```

## 2. CRM comercial, agenda e segmentação

```mermaid
erDiagram
  Organization { uuid id PK }
  Team { uuid id PK }
  User { uuid id PK }
  Company {
    uuid id PK
    uuid organizationId FK
    uuid teamId FK
    uuid ownerId FK
    uuid logoId FK
    string name
    string cnpj
    string domain
    string externalId
    datetime archivedAt
  }
  Contact {
    uuid id PK
    uuid organizationId FK
    uuid teamId FK
    uuid ownerId FK
    uuid primaryCompanyId FK
    string name
    string email
    string phone
    string phoneKey
    ConsentStatus consentStatus
    boolean campaignsBlocked
    datetime archivedAt
  }
  ContactCompany {
    uuid contactId PK,FK
    uuid companyId PK,FK
    boolean isPrimary
  }
  Pipeline {
    uuid id PK
    uuid organizationId FK
    string name
    boolean isActive
  }
  PipelineStage {
    uuid id PK
    uuid pipelineId FK
    string name
    int position
    int probability
    boolean isWon
    boolean isLost
  }
  Opportunity {
    uuid id PK
    uuid organizationId FK
    uuid pipelineId FK
    uuid stageId FK
    uuid companyId FK
    uuid teamId FK
    uuid ownerId FK
    uuid proposalAssetId FK
    string title
    OpportunityStatus status
    int valueCents
    datetime archivedAt
  }
  OpportunityContact {
    uuid opportunityId PK,FK
    uuid contactId PK,FK
    boolean isPrimary
  }
  Task {
    uuid id PK
    uuid organizationId FK
    uuid teamId FK
    uuid assigneeId FK
    uuid createdById FK
    uuid companyId FK
    uuid contactId FK
    uuid opportunityId FK
    string title
    datetime dueAt
    TaskStatus status
    TaskPriority priority
  }
  TaskDigestDelivery {
    uuid id PK
    uuid organizationId FK
    uuid userId FK
    date digestDate
    TaskDigestStatus status
    string providerMessageId
  }
  Note {
    uuid id PK
    uuid authorId FK
    uuid companyId FK
    uuid contactId FK
    uuid opportunityId FK
    string body
  }
  Activity {
    uuid id PK
    uuid organizationId FK
    uuid userId FK
    uuid companyId FK
    uuid contactId FK
    uuid opportunityId FK
    string type
    datetime occurredAt
  }
  Tag {
    uuid id PK
    uuid organizationId FK
    string name
    string color
  }
  CompanyTag { uuid companyId PK,FK uuid tagId PK,FK }
  ContactTag { uuid contactId PK,FK uuid tagId PK,FK }
  OpportunityTag { uuid opportunityId PK,FK uuid tagId PK,FK }
  CustomFieldDefinition {
    uuid id PK
    uuid organizationId FK
    string entity
    string key
    string type
    boolean required
  }
  Segment {
    uuid id PK
    uuid organizationId FK
    string name
    json filters
    boolean isDynamic
  }
  SegmentMember { uuid segmentId PK,FK uuid contactId PK,FK }
  ConsentEvent {
    uuid id PK
    uuid contactId FK
    ConsentStatus status
    string source
    datetime createdAt
  }
  Suppression {
    uuid id PK
    uuid contactId FK
    ChannelType channel
    string reason
  }

  Organization ||--o{ Company : possui
  Organization ||--o{ Contact : possui
  Team o|--o{ Company : classifica
  Team o|--o{ Contact : classifica
  User o|--o{ Company : possui
  User o|--o{ Contact : possui
  Company ||--o{ ContactCompany : vincula
  Contact ||--o{ ContactCompany : vincula
  Company o|--o{ Contact : principal
  Organization ||--o{ Pipeline : configura
  Pipeline ||--o{ PipelineStage : ordena
  Pipeline ||--o{ Opportunity : recebe
  PipelineStage ||--o{ Opportunity : posiciona
  Company o|--o{ Opportunity : gera
  Team o|--o{ Opportunity : classifica
  User o|--o{ Opportunity : possui
  Opportunity ||--o{ OpportunityContact : inclui
  Contact ||--o{ OpportunityContact : participa
  Organization ||--o{ Task : agenda
  Team o|--o{ Task : classifica
  User o|--o{ Task : recebe
  User ||--o{ Task : cria
  Company o|--o{ Task : contextualiza
  Contact o|--o{ Task : contextualiza
  Opportunity o|--o{ Task : contextualiza
  Organization ||--o{ TaskDigestDelivery : controla
  User ||--o{ TaskDigestDelivery : recebe
  User ||--o{ Note : escreve
  Company o|--o{ Note : possui
  Contact o|--o{ Note : possui
  Opportunity o|--o{ Note : possui
  Organization ||--o{ Activity : registra
  User o|--o{ Activity : executa
  Company o|--o{ Activity : recebe
  Contact o|--o{ Activity : recebe
  Opportunity o|--o{ Activity : recebe
  Organization ||--o{ Tag : define
  Company ||--o{ CompanyTag : marca
  Contact ||--o{ ContactTag : marca
  Opportunity ||--o{ OpportunityTag : marca
  Tag ||--o{ CompanyTag : aplica
  Tag ||--o{ ContactTag : aplica
  Tag ||--o{ OpportunityTag : aplica
  Organization ||--o{ CustomFieldDefinition : define
  Organization ||--o{ Segment : define
  Segment ||--o{ SegmentMember : materializa
  Contact ||--o{ SegmentMember : integra
  Contact ||--o{ ConsentEvent : historiza
  Contact ||--o{ Suppression : bloqueia
```

## 3. WhatsApp, Inbox, mídia e notificações

```mermaid
erDiagram
  Organization { uuid id PK }
  Team { uuid id PK }
  User { uuid id PK }
  Company { uuid id PK uuid logoId FK }
  Opportunity { uuid id PK uuid proposalAssetId FK }
  Contact { uuid id PK }
  WhatsappInstance {
    uuid id PK
    uuid organizationId FK
    string instanceKey
    string phone
    InstanceStatus status
    datetime archivedAt
  }
  WhatsappInstanceTeam { uuid instanceId PK,FK uuid teamId PK,FK }
  WarmupProfile {
    uuid id PK
    uuid instanceId FK,UK
    int currentDailyLimit
    int maxDailyLimit
    int batchSize
    json sendingDays
  }
  Conversation {
    uuid id PK
    uuid organizationId FK
    uuid instanceId FK
    uuid contactId FK
    uuid assigneeId FK
    string remoteJid
    string phoneJid
    ConversationStatus status
    int unreadCount
    datetime lastMessageAt
  }
  ConversationPin { uuid userId PK,FK uuid conversationId PK,FK datetime pinnedAt }
  ConversationEvent {
    uuid id PK
    uuid organizationId FK
    uuid conversationId FK
    uuid actorId FK
    string type
    string text
    json metadata
  }
  Message {
    uuid id PK
    uuid instanceId FK
    uuid conversationId FK
    string providerMessageId
    MessageDirection direction
    string type
    string text
    MessageStatus status
    json payload
    string transcriptionStatus
  }
  MediaAsset {
    uuid id PK
    uuid messageId FK
    string key UK
    string filename
    string contentType
    int sizeBytes
  }
  QuickReply {
    uuid id PK
    uuid organizationId FK
    uuid createdById FK
    uuid mediaAssetId FK,UK
    string title
    string shortcut
    string text
  }
  Notification {
    uuid id PK
    uuid organizationId FK
    uuid userId FK
    string type
    string title
    string actionUrl
    datetime readAt
  }

  Organization ||--o{ WhatsappInstance : possui
  WhatsappInstance ||--o{ WhatsappInstanceTeam : autoriza
  Team ||--o{ WhatsappInstanceTeam : acessa
  WhatsappInstance ||--|| WarmupProfile : limita
  Organization ||--o{ Conversation : possui
  WhatsappInstance ||--o{ Conversation : canaliza
  Contact ||--o{ Conversation : participa
  User o|--o{ Conversation : atende
  User ||--o{ ConversationPin : fixa
  Conversation ||--o{ ConversationPin : fixada
  Organization ||--o{ ConversationEvent : registra
  Conversation ||--o{ ConversationEvent : historiza
  User o|--o{ ConversationEvent : atua
  WhatsappInstance ||--o{ Message : transporta
  Conversation ||--o{ Message : contém
  Message o|--o{ MediaAsset : anexa
  Organization ||--o{ QuickReply : cataloga
  User ||--o{ QuickReply : cria
  MediaAsset o|--o| QuickReply : anexa
  MediaAsset o|--o| User : foto
  MediaAsset o|--o| Company : logo
  MediaAsset o|--o| Opportunity : proposta
  Organization ||--o{ Notification : produz
  User ||--o{ Notification : recebe
```

## 4. Campanhas e e-mail

```mermaid
erDiagram
  Organization { uuid id PK }
  User { uuid id PK }
  Contact { uuid id PK }
  Segment { uuid id PK }
  WhatsappInstance { uuid id PK }
  Campaign {
    uuid id PK
    uuid organizationId FK
    uuid instanceId FK
    uuid segmentId FK
    uuid createdById FK
    string name
    ChannelType channel
    CampaignStatus status
    datetime scheduledAt
    datetime archivedAt
  }
  CampaignBubble {
    uuid id PK
    uuid campaignId FK
    int position
    string type
    string content
    string mediaKey
  }
  CampaignRecipient {
    uuid id PK
    uuid campaignId FK
    uuid contactId FK
    MessageStatus status
    json messages
    string exclusionReason
    string providerMessageId
  }
  EmailDeliveryEvent {
    uuid id PK
    uuid recipientId FK
    string providerEventId UK
    string eventType
    string severity
    json payload
  }
  EmailTemplate {
    uuid id PK
    uuid organizationId FK
    string name
    string subject
    string html
    string text
  }

  Organization ||--o{ Campaign : possui
  User ||--o{ Campaign : cria
  WhatsappInstance o|--o{ Campaign : envia
  Segment o|--o{ Campaign : origina
  Campaign ||--o{ CampaignBubble : sequencia
  Campaign ||--o{ CampaignRecipient : entrega
  Contact ||--o{ CampaignRecipient : recebe
  CampaignRecipient ||--o{ EmailDeliveryEvent : historiza
  Organization ||--o{ EmailTemplate : cataloga
```

## 5. Workflows, execuções e follow-ups

```mermaid
erDiagram
  Organization { uuid id PK }
  User { uuid id PK }
  Contact { uuid id PK }
  Conversation { uuid id PK }
  Task { uuid id PK }
  Message { uuid id PK }
  Workflow {
    uuid id PK
    uuid organizationId FK
    uuid createdById FK
    string name
    WorkflowStatus status
    int publishedVersion
    string reentryMode
  }
  WorkflowVersion {
    uuid id PK
    uuid workflowId FK
    int version
    json graph
    datetime publishedAt
  }
  WorkflowEnrollment {
    uuid id PK
    uuid workflowId FK
    uuid versionId FK
    uuid contactId FK
    EnrollmentStatus status
    string currentNodeId
    datetime wakeAt
    json context
  }
  WorkflowStepExecution {
    uuid id PK
    uuid enrollmentId FK
    string nodeId
    string status
    json input
    json output
  }
  ConversationFollowUp {
    uuid id PK
    uuid organizationId FK
    uuid conversationId FK
    uuid taskId FK,UK
    uuid createdById FK
    uuid responsibleId FK
    uuid workflowVersionId FK
    uuid workflowEnrollmentId FK,UK
    FollowUpMode mode
    FollowUpStatus status
    datetime scheduledAt
    int revision
  }
  ConversationFollowUpStep {
    uuid id PK
    uuid followUpId FK
    uuid messageId FK,UK
    int position
    string text
    string mediaKey
    int delaySeconds
    FollowUpStepStatus status
  }

  Organization ||--o{ Workflow : possui
  User ||--o{ Workflow : cria
  Workflow ||--o{ WorkflowVersion : versiona
  Workflow ||--o{ WorkflowEnrollment : executa
  WorkflowVersion ||--o{ WorkflowEnrollment : fixa
  Contact ||--o{ WorkflowEnrollment : recebe
  WorkflowEnrollment ||--o{ WorkflowStepExecution : detalha
  Organization ||--o{ ConversationFollowUp : possui
  Conversation ||--o{ ConversationFollowUp : agenda
  Task ||--o| ConversationFollowUp : representa
  User ||--o{ ConversationFollowUp : cria
  User ||--o{ ConversationFollowUp : responde
  WorkflowVersion o|--o{ ConversationFollowUp : inicia
  WorkflowEnrollment o|--o| ConversationFollowUp : resulta
  ConversationFollowUp ||--o{ ConversationFollowUpStep : sequencia
  Message o|--o| ConversationFollowUpStep : materializa
```

## 6. Chatbots, IA e conhecimento

```mermaid
erDiagram
  Organization { uuid id PK }
  User { uuid id PK }
  Contact { uuid id PK }
  Conversation { uuid id PK }
  WhatsappInstance { uuid id PK }
  MediaAsset { uuid id PK }
  Chatbot {
    uuid id PK
    uuid organizationId FK
    uuid instanceId FK
    uuid createdById FK
    string name
    WorkflowStatus status
    string responseProvider
    int publishedVersion
  }
  ChatbotVersion {
    uuid id PK
    uuid chatbotId FK
    int version
    json graph
    datetime publishedAt
  }
  ChatbotSession {
    uuid id PK
    uuid chatbotId FK
    uuid versionId FK
    uuid conversationId FK,UK
    ChatbotSessionStatus status
    string currentNodeId
    uuid lastInboundMessageId
    json context
    datetime wakeAt
  }
  ChatbotStepExecution {
    uuid id PK
    uuid sessionId FK
    string nodeId
    uuid inboundMessageId
    string status
    json output
  }
  OrganizationAiSettings {
    uuid organizationId PK,FK
    uuid updatedById FK
    boolean enabled
    string model
    string openAiApiKeyEncrypted
    string openAiVectorStoreId
  }
  AiKnowledgeDocument {
    uuid id PK
    uuid organizationId FK
    uuid mediaAssetId FK,UK
    uuid createdById FK
    AiKnowledgeDocumentStatus status
    string openAiFileId
    string openAiVectorFileId
  }
  ConversationAiGeneration {
    uuid id PK
    uuid organizationId FK
    uuid conversationId FK
    uuid requestedById FK
    uuid chatbotSessionId FK
    AiGenerationType type
    AiGenerationStatus status
    string deduplicationKey UK
    json input
    json result
  }
  ConversationAiProposal {
    uuid id PK
    uuid organizationId FK
    uuid conversationId FK
    uuid contactId FK
    uuid generationId FK,UK
    uuid appliedById FK
    AiProposalStatus status
    json changes
    json appliedFields
  }

  Organization ||--o{ Chatbot : possui
  WhatsappInstance ||--o{ Chatbot : atende
  User ||--o{ Chatbot : cria
  Chatbot ||--o{ ChatbotVersion : versiona
  Chatbot ||--o{ ChatbotSession : executa
  ChatbotVersion ||--o{ ChatbotSession : fixa
  Conversation ||--o| ChatbotSession : mantém
  ChatbotSession ||--o{ ChatbotStepExecution : detalha
  Organization ||--o| OrganizationAiSettings : configura
  User o|--o{ OrganizationAiSettings : atualiza
  Organization ||--o{ AiKnowledgeDocument : indexa
  MediaAsset ||--o| AiKnowledgeDocument : origina
  User o|--o{ AiKnowledgeDocument : cria
  Organization ||--o{ ConversationAiGeneration : solicita
  Conversation o|--o{ ConversationAiGeneration : contextualiza
  User o|--o{ ConversationAiGeneration : pede
  ChatbotSession o|--o{ ConversationAiGeneration : aguarda
  Organization ||--o{ ConversationAiProposal : possui
  Conversation ||--o{ ConversationAiProposal : exibe
  Contact ||--o{ ConversationAiProposal : altera
  ConversationAiGeneration ||--o| ConversationAiProposal : propõe
  User o|--o{ ConversationAiProposal : decide
```

## 7. Integração, idempotência e webhooks

```mermaid
erDiagram
  Organization { uuid id PK }
  OutboundWebhook {
    uuid id PK
    uuid organizationId FK
    string name
    string url
    string secretEncrypted
    json events
    boolean enabled
  }
  WebhookDelivery {
    uuid id PK
    uuid webhookId FK
    string eventId
    string eventType
    json payload
    int attempts
    string status
    datetime nextAttemptAt
  }
  IdempotencyRecord {
    uuid id PK
    uuid organizationId FK
    string key
    string route
    string requestHash
    int responseCode
    json responseBody
    datetime expiresAt
  }
  InboundWebhookEvent {
    uuid id PK
    uuid organizationId FK
    string provider
    string instanceKey
    string eventKey
    string eventType
    json payload
    string status
  }

  Organization ||--o{ OutboundWebhook : configura
  OutboundWebhook ||--o{ WebhookDelivery : entrega
  Organization ||--o{ IdempotencyRecord : deduplica
  Organization ||--o{ InboundWebhookEvent : recebe
```

## 8. Restrições estruturais de destaque

| Entidade/combinação | Restrição |
|---|---|
| `Role` | chave única por organização |
| `RolePermission` | papel + recurso + ação únicos |
| `User` | e-mail único por organização |
| `Company`/`Contact`/`Opportunity` | `externalId` único por organização quando presente |
| `Contact` | `phoneKey` único por organização quando ativo |
| `PipelineStage` | posição única por funil |
| `Conversation` | JID remoto e telefônico únicos por instância |
| `Message` | `providerMessageId` único por instância |
| `InboundWebhookEvent` | provedor + instância + chave de evento únicos |
| `CampaignRecipient` | campanha + contato únicos |
| `WorkflowVersion`/`ChatbotVersion` | número único por definição |
| `ChatbotSession` | uma sessão persistida por conversa |
| `ConversationFollowUp` | tarefa e inscrição resultante únicas; índice parcial limita um ativo por conversa |
| `ConversationFollowUpStep` | posição única por follow-up; mensagem no máximo em uma etapa |
| `ConversationAiGeneration` | chave de deduplicação global única |
| `ConversationAiProposal` | no máximo uma proposta por geração |
| `AiKnowledgeDocument` | um documento por ativo de mídia |
| `WebhookDelivery` | webhook + evento únicos |
| `IdempotencyRecord` | organização + chave + rota únicas durante retenção |

## 9. Contagem de cobertura

- **Entidades Prisma no schema:** 63.
- **Entidades representadas nos diagramas:** 63.
- **Entidades efêmeras não Prisma:** jobs BullMQ, envelopes Redis/Socket.IO, contratos MCP e resultados calculados; documentadas em [`data-dictionary.md`](data-dictionary.md), não no ERD persistente.
