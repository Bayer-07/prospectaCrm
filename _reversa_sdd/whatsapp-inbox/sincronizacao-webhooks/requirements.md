# Sincronização e webhooks — Requisitos

## Objetivo

Converter eventos Evolution em estado interno idempotente sem bloquear o endpoint de webhook. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| WHATSAPP_INBOX-4-FR-001 | Aceitar QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE e SEND_MESSAGE. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-4-FR-002 | Responder ao webhook antes do processamento pesado. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-4-FR-003 | Deduplicar por evento e identificador remoto. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-4-FR-004 | Atualizar recibos, edições, exclusões e respostas citadas. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-4-FR-005 | Publicar apenas atualizações da conversa, mensagem ou instância afetada. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de sincronização e webhooks
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/integrations/integrations.controller.ts`, `apps/worker/src/inbound.processor.ts`. **[CONFIRMADO]**
