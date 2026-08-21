# Pipeline e oportunidades — Requisitos

## Objetivo

Acompanhar oportunidades em múltiplos funis por um Kanban persistente e auditável. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CRM-2-FR-001 | Criar oportunidade usando o nome da empresa ou, na ausência dela, o nome do contato como identificação principal. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-2-FR-002 | Mover cards pelo corpo inteiro entre etapas configuradas. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-2-FR-003 | Persistir valor em centavos, probabilidade, previsão, origem, responsáveis e motivo de perda. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-2-FR-004 | Vincular contatos e armazenar proposta por arquivo seguro ou link. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-2-FR-005 | Exibir drawer lateral com dados agregados ao selecionar o card. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |

## Regras transversais

- Organização, permissão e escopo são aplicados na API. **[CONFIRMADO]**
- Entradas são normalizadas antes da deduplicação ou transição. **[CONFIRMADO]**
- Mudanças relevantes preservam atividade ou auditoria. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: concluir pipeline e oportunidades
  Dado que o usuário está autenticado e possui o escopo necessário
  E os dados informados são válidos
  Quando ele executa a operação principal
  Então o domínio persiste um resultado consistente
  E a interface atualiza somente os dados afetados
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/crm/crm.controller.ts`, `apps/api/src/crm/crm.service.ts`, `apps/web/src/pages/Pipeline.tsx`. **[CONFIRMADO]**
