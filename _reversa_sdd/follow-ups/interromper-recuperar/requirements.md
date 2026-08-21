# Interromper e recuperar follow-up — Requisitos

## Objetivo

Tratar respostas, cancelamentos, desconexão e reinício sem enviar conteúdo duplicado ou atrasado demais. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| FOLLOW_UPS-3-FR-001 | Cancelar e avisar por e-mail quando o cliente responder antes do início. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-3-FR-002 | Interromper somente mensagens restantes quando responder durante a sequência. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-3-FR-003 | Retentar conexão desconectada a cada minuto por até trinta minutos. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-3-FR-004 | Reconciliar agendamentos na inicialização e em intervalos curtos. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-3-FR-005 | Marcar falha após tolerância, manter tarefa vencida aberta e notificar responsável. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de interromper e recuperar follow-up
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/follow-up.processor.ts`, `apps/worker/src/follow-up-reconciler.ts`. **[CONFIRMADO]**
