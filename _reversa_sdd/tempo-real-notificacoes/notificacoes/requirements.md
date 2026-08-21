# Notificações internas — Requisitos

## Objetivo

Criar, listar e marcar notificações como lidas com contador correto por usuário. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| TEMPO_REAL_NOTIFICACOES-2-FR-001 | Criar notificação para tarefa, atribuição, mensagem, menção, follow-up e falha relevante. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-2-FR-002 | Listar mais recentes com contador de não lidas. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-2-FR-003 | Marcar uma ou todas como lidas. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-2-FR-004 | Ocultar contador quando não houver item não lido. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-2-FR-005 | Abrir o destino correto ao clicar quando a referência existir. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de notificações internas
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/reports/reports.service.ts`, `apps/web/src/components/Shell.tsx`. **[CONFIRMADO]**
