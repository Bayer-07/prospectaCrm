# Atendimento e tickets — Requisitos

## Objetivo

Organizar conversas em aguardando, abertas e encerradas com atribuição, transferência e histórico interno. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| WHATSAPP_INBOX-2-FR-001 | Criar ticket aguardando para mensagem sem atendente. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-2-FR-002 | Assumir ou reabrir atribui o atendimento ao usuário que executou a ação. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-2-FR-003 | Transferir altera responsável e preserva histórico. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-2-FR-004 | Finalizar em segundo plano mantém a aba atual e limpa a seleção. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-2-FR-005 | Fixar somente conversas abertas e oferecer ações contextuais no ticket. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de atendimento e tickets
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/integrations/integrations.service.ts`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
