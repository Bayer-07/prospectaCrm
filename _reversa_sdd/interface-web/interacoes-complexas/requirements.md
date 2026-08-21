# Interações complexas — Requisitos

## Objetivo

Manter drag-and-drop, drawers, calendários, builders, composer e lightbox acessíveis e previsíveis. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INTERFACE_WEB-3-FR-001 | Arrastar cards e tarefas pelo elemento inteiro sem deslocamento do ponteiro. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-3-FR-002 | Abrir detalhes em drawer lateral sem perder o contexto da lista. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-3-FR-003 | Manter mensagens paginadas, composer focado e scroll independente. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-3-FR-004 | Suportar teclado, menus contextuais, upload por paste/drop e modais focados. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-3-FR-005 | Reverter estado visual quando uma mutação falhar. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de interações complexas
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/web/src/pages/Inbox.tsx`, `apps/web/src/pages/Pipeline.tsx`, `apps/web/src/pages/Tasks.tsx`, `apps/web/src/components`. **[CONFIRMADO]**
