# Agendar e editar follow-up — Requisitos

## Objetivo

Escolher data, horário e ação em um modal por etapas, criando simultaneamente tarefa e follow-up. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| FOLLOW_UPS-1-FR-001 | Exigir conversa atribuída e permissões de conversa e tarefa. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-1-FR-002 | Selecionar data em calendário e horário no fuso America/Sao_Paulo. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-1-FR-003 | Configurar sequência reordenável com texto, mídia e atraso ou workflow publicado. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-1-FR-004 | Editar e mover pela agenda somente antes da execução. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| FOLLOW_UPS-1-FR-005 | Cancelar mediante confirmação e registrar evento interno. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de agendar e editar follow-up
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/follow-ups/follow-ups.service.ts`, `apps/web/src/components/FollowUpModal.tsx`, `apps/web/src/pages/Tasks.tsx`. **[CONFIRMADO]**
