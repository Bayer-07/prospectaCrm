# Mensagens e mídias — Requisitos

## Objetivo

Enviar, receber e apresentar conteúdo do WhatsApp com fidelidade, estado de entrega e interações de atendimento. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| WHATSAPP_INBOX-3-FR-001 | Suportar texto, imagem, áudio, vídeo, documento, sticker, contato e localização. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-3-FR-002 | Permitir responder, reagir, copiar quando aplicável, editar e excluir mensagens próprias. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-3-FR-003 | Exibir erro detalhado no hover e permitir retry idempotente. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-3-FR-004 | Carregar trinta mensagens por página ao rolar para cima e abrir sempre na mais recente. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-3-FR-005 | Renderizar formatação WhatsApp, links clicáveis e prévias seguras. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de mensagens e mídias
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/integrations/evolution.service.ts`, `apps/worker/src/inbound.processor.ts`, `apps/web/src/pages/Inbox.tsx`, `apps/web/src/lib/WhatsappText.tsx`. **[CONFIRMADO]**
