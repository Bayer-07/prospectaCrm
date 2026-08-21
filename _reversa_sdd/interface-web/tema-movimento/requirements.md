# Tema e movimento — Requisitos

## Objetivo

Aplicar tokens visuais consistentes, tipografia legível e animações físicas discretas no padrão adotado. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INTERFACE_WEB-4-FR-001 | Manter contraste e tipografia uniforme nos temas claro e escuro. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-4-FR-002 | Usar tokens em vez de cores divergentes por página. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-4-FR-003 | Animar entrada, saída e feedback sem atrasar ações. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-4-FR-004 | Respeitar prefers-reduced-motion. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-4-FR-005 | Evitar animação que interfira em hitbox, scroll ou drag-and-drop. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de tema e movimento
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/web/src/styles.css`, `apps/web/src/interface-v2.css`, `apps/web/src/interface-components.css`, `apps/web/src/apple-ui.css`. **[CONFIRMADO]**
