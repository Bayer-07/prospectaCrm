# Servidor MCP — Requisitos

## Objetivo

Adaptar ferramentas MCP ao subconjunto REST autorizado, mantendo leitura/criação/edição e bloqueando exclusão. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| API_EXTERNA_MCP-3-FR-001 | Autenticar MCP com chave configurada no servidor. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-3-FR-002 | Anunciar somente tools realmente implementadas. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-3-FR-003 | Paginar listagens e devolver meta.nextCursor. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-3-FR-004 | Fazer duplicate check antes de criação quando aplicável. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-3-FR-005 | Não reiniciar o sistema ao criar ou editar registros. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de servidor mcp
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/mcp/src/main.ts`, `apps/api/src/mcp/mcp.controller.ts`. **[CONFIRMADO]**
