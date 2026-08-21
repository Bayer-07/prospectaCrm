# Executar sequência — Requisitos

## Objetivo

Reabrir a conversa quando necessário e executar mensagens ou inscrição de workflow de forma idempotente. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| FOLLOW_UPS-2-FR-001 | Usar a conexão atualmente vinculada à conversa. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-2-FR-002 | Aplicar variáveis e assinatura do responsável no instante de cada envio. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-2-FR-003 | Criar URL assinada para mídia somente durante o envio. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-2-FR-004 | Agendar a próxima etapa apenas após sucesso da anterior. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-2-FR-005 | Concluir a tarefa quando a sequência terminar ou a inscrição no workflow for criada. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de executar sequência
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/follow-up.processor.ts`, `apps/api/src/follow-ups/follow-ups.service.ts`. **[CONFIRMADO]**
