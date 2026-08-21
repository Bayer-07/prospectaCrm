# Importação e segmentação — Requisitos

## Objetivo

Ingerir cadastros em lote e criar audiências reutilizáveis sem travar a interface nem duplicar registros. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CRM-4-FR-001 | Aceitar CSV selecionado ou arrastado, disponibilizando download do modelo padrão. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-4-FR-002 | Mostrar prévia, mapeamento e erros antes da confirmação. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-4-FR-003 | Processar linhas com normalização e deduplicação equivalentes ao cadastro manual. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-4-FR-004 | Salvar segmentos por filtros, tags, funil, etapa, equipe, responsável e campos personalizados. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-4-FR-005 | Paginar listagens por cursor e carregar contatos em blocos de vinte na interface. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |

## Regras transversais

- Organização, permissão e escopo são aplicados na API. **[CONFIRMADO]**
- Entradas são normalizadas antes da deduplicação ou transição. **[CONFIRMADO]**
- Mudanças relevantes preservam atividade ou auditoria. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: concluir importação e segmentação
  Dado que o usuário está autenticado e possui o escopo necessário
  E os dados informados são válidos
  Quando ele executa a operação principal
  Então o domínio persiste um resultado consistente
  E a interface atualiza somente os dados afetados
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/crm/crm.controller.ts`, `apps/api/src/crm/crm.service.ts`, `apps/web/src/pages/Contacts.tsx`. **[CONFIRMADO]**
