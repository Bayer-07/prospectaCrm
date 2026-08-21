# CRM e vendas — Requisitos

## Visão geral

Gerenciar empresas, contatos, oportunidades, tarefas, funis, listas e importações dentro da única organização do BZS One. **[CONFIRMADO]**

## Regras de negócio

1. Empresas podem ter vários contatos e oportunidades; contatos sem empresa também são aceitos. **[CONFIRMADO]**
2. CNPJ e domínio participam da deduplicação de empresas; telefone equivalente e e-mail normalizado participam da deduplicação de contatos. **[CONFIRMADO]**
3. Telefones brasileiros equivalentes com ou sem o nono dígito adicional não podem gerar contatos duplicados. **[CONFIRMADO]**
4. Oportunidades pertencem a funil e etapa, preservam histórico de movimentação e usam valores em centavos. **[CONFIRMADO]**
5. Toda consulta e mutação aplica organização, permissão e escopo de dados. **[CONFIRMADO]**
6. Exclusões comerciais são lógicas e mesclagens devem preservar auditoria. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CRM-FR-001 | Cadastrar, consultar, editar, desativar e relacionar empresas e contatos sem introduzir duplicatas comerciais. **[CONFIRMADO]** | Must | O fluxo principal do caso de uso conclui com autorização, validação, persistência e auditoria. **[CONFIRMADO]** |
| CRM-FR-002 | Acompanhar oportunidades em múltiplos funis por um Kanban persistente e auditável. **[CONFIRMADO]** | Must | O fluxo principal do caso de uso conclui com autorização, validação, persistência e auditoria. **[CONFIRMADO]** |
| CRM-FR-003 | Planejar atividades em calendário, atribuí-las a usuários e sincronizar mudanças originadas por follow-ups. **[CONFIRMADO]** | Must | O fluxo principal do caso de uso conclui com autorização, validação, persistência e auditoria. **[CONFIRMADO]** |
| CRM-FR-004 | Ingerir cadastros em lote e criar audiências reutilizáveis sem travar a interface nem duplicar registros. **[CONFIRMADO]** | Must | O fluxo principal do caso de uso conclui com autorização, validação, persistência e auditoria. **[CONFIRMADO]** |
| CRM-FR-005 | Expor listagens pesquisáveis, filtráveis e paginadas por cursor. **[CONFIRMADO]** | Must | A interface não carrega todo o cadastro de uma vez e mantém filtros ao buscar a próxima página. **[CONFIRMADO]** |
| CRM-FR-006 | Aplicar permissões e escopos em todos os acessos comerciais. **[CONFIRMADO]** | Must | Acesso direto pela API a dado de outra equipe ou responsável é negado. **[CONFIRMADO]** |

## Requisitos não funcionais

- Índices devem cobrir organização, estado ativo, responsável/equipe, chaves de deduplicação, funil/etapa e cursores de listagem. **[CONFIRMADO]**
- Operações em lote devem evitar carregar o arquivo ou toda a base no navegador. **[INFERIDO]**
- Valores monetários usam centavos e datas usam ISO-8601 UTC, exibidas em `America/Sao_Paulo`. **[CONFIRMADO]**
- Mudanças críticas deixam atividade ou auditoria suficiente para reconstruir o histórico comercial. **[CONFIRMADO]**

## Cenários de aceitação

```gherkin
Cenário: impedir contato duplicado por telefone equivalente
  Dado que existe um contato brasileiro com telefone 5545999225389
  Quando outro cadastro usa 554599225389
  Então a API identifica a equivalência
  E não cria um segundo contato ativo
```
**[CONFIRMADO]**

```gherkin
Cenário: mover oportunidade no Kanban
  Dado que o usuário possui acesso à oportunidade e à etapa de destino
  Quando ele arrasta o card para outra coluna
  Então a etapa é atualizada
  E o histórico registra origem, destino, horário e ator
```
**[CONFIRMADO]**

## Priorização MoSCoW

- **Must:** cadastros, deduplicação, pipeline, tarefas, importação, paginação, escopo e auditoria. **[CONFIRMADO]**
- **Should:** consulta de CNPJ, logo por domínio, propostas e segmentos salvos. **[CONFIRMADO]**
- **Could:** enriquecimento adicional por fontes externas. **[A VALIDAR]**
- **Won’t reconstruir como regra nova:** exclusão física comum de registros comerciais. **[INFERIDO]**

## Rastreabilidade

`apps/api/src/crm/crm.controller.ts`, `apps/api/src/crm/crm.service.ts`, `apps/web/src/pages/Companies.tsx`, `apps/web/src/pages/Contacts.tsx`, `apps/web/src/pages/Pipeline.tsx`, `apps/web/src/pages/Tasks.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
