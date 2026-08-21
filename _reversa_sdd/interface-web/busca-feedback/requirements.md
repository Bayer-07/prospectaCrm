# Busca e feedback — Requisitos

## Objetivo

Permitir localizar registros pelo teclado e comunicar resultados sem bloquear o fluxo do usuário. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INTERFACE_WEB-2-FR-001 | Abrir busca global com Ctrl+K. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-2-FR-002 | Buscar empresas, contatos, oportunidades e conversas abertas/aguardando. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-2-FR-003 | Navegar aos resultados corretos. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-2-FR-004 | Padronizar sucesso/erro/atenção em toast temporizado. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-2-FR-005 | Mostrar estados vazios específicos em listas e inbox. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de busca e feedback
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/web/src/components/AppShell.tsx`, `apps/web/src/api/client.ts`. **[CONFIRMADO]**
