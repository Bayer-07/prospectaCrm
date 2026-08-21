# Conexões Evolution — Requisitos

## Objetivo

Criar, conectar por QR, monitorar, desconectar, trocar e excluir instâncias independentes. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| WHATSAPP_INBOX-1-FR-001 | Manter estado individual por instância e atualizar QR da instância correta. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-1-FR-002 | Associar cada número a equipes e permissões. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-1-FR-003 | Ocultar credenciais da Evolution do navegador. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-1-FR-004 | Permitir trocar a conexão de uma conversa somente quando a atual estiver desconectada ou excluída. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| WHATSAPP_INBOX-1-FR-005 | Registrar conexão, desconexão, reinício e exclusão em auditoria. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de conexões evolution
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/integrations/integrations.controller.ts`, `apps/api/src/integrations/evolution.service.ts`, `apps/web/src/pages/Settings.tsx`. **[CONFIRMADO]**
