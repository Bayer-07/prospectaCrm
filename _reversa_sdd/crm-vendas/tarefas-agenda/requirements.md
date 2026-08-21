# Tarefas e agenda — Requisitos

## Objetivo

Planejar atividades em calendário, atribuí-las a usuários e sincronizar mudanças originadas por follow-ups. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CRM-3-FR-001 | Criar tarefa clicando em um espaço do calendário e editar seus campos no modal. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-3-FR-002 | Mover tarefas por drag-and-drop com indicador fino de destino. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-3-FR-003 | Exibir tarefas simultâneas em colunas sobrepostas no estilo de agenda. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-3-FR-004 | Enviar resumo diário às 8h para o e-mail do responsável quando configurado. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-3-FR-005 | Manter tarefas de follow-up vinculadas ao horário real de disparo. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |

## Regras transversais

- Organização, permissão e escopo são aplicados na API. **[CONFIRMADO]**
- Entradas são normalizadas antes da deduplicação ou transição. **[CONFIRMADO]**
- Mudanças relevantes preservam atividade ou auditoria. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: concluir tarefas e agenda
  Dado que o usuário está autenticado e possui o escopo necessário
  E os dados informados são válidos
  Quando ele executa a operação principal
  Então o domínio persiste um resultado consistente
  E a interface atualiza somente os dados afetados
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/crm/crm.controller.ts`, `apps/api/src/crm/crm.service.ts`, `apps/web/src/pages/Tasks.tsx`, `apps/worker/src/daily-tasks.processor.ts`. **[CONFIRMADO]**
