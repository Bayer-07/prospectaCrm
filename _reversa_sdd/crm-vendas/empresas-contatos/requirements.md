# Empresas e contatos — Requisitos

## Objetivo

Cadastrar, consultar, editar, desativar e relacionar empresas e contatos sem introduzir duplicatas comerciais. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CRM-1-FR-001 | Cadastrar empresa com CNPJ, nome, domínio, setor, porte, endereço, LinkedIn, logo, responsável, equipe e campos extensíveis. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-1-FR-002 | Cadastrar contato com nome, cargo, e-mail, telefone normalizado, empresa, responsável, origem e bloqueio de campanhas. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-1-FR-003 | Buscar dados públicos de empresa pelo CNPJ digitado e permitir revisão antes de salvar. **[CONFIRMADO]** | Must | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-1-FR-004 | Importar contatos por CSV com modelo, mapeamento, prévia e erros por linha. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |
| CRM-1-FR-005 | Mesclar duplicatas preservando associações e auditoria. **[CONFIRMADO]** | Should | A operação autorizada persiste resultado consistente e apresenta erro acionável quando inválida. **[CONFIRMADO]** |

## Regras transversais

- Organização, permissão e escopo são aplicados na API. **[CONFIRMADO]**
- Entradas são normalizadas antes da deduplicação ou transição. **[CONFIRMADO]**
- Mudanças relevantes preservam atividade ou auditoria. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: concluir empresas e contatos
  Dado que o usuário está autenticado e possui o escopo necessário
  E os dados informados são válidos
  Quando ele executa a operação principal
  Então o domínio persiste um resultado consistente
  E a interface atualiza somente os dados afetados
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/crm/crm.controller.ts`, `apps/api/src/crm/crm.service.ts`, `apps/web/src/pages/Companies.tsx`, `apps/web/src/pages/Contacts.tsx`. **[CONFIRMADO]**
