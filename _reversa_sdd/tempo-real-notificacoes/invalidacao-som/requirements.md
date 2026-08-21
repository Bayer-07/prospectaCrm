# Invalidação e som — Requisitos

## Objetivo

Atualizar somente caches afetados e tocar aviso sonoro de mensagem conforme foco e conversa ativa. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| TEMPO_REAL_NOTIFICACOES-3-FR-001 | Invalidar conversa, contadores e mensagens relacionadas ao evento recebido. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-3-FR-002 | Evitar som duplicado para o mesmo identificador de mensagem. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-3-FR-003 | Com página em foco, não tocar quando a mesma conversa estiver aberta. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-3-FR-004 | Com página sem foco, tocar mesmo que a conversa esteja aberta. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-3-FR-005 | Respeitar restrições de autoplay e preferência futura do usuário. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de invalidação e som
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/web/src/lib/realtime.ts`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
