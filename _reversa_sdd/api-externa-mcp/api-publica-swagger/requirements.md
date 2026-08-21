# API pública e Swagger — Requisitos

## Objetivo

Documentar e executar operações REST úteis com atributos, exemplos, segurança e erros claros. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| API_EXTERNA_MCP-2-FR-001 | Gerar documento separado contendo somente recursos públicos. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-2-FR-002 | Descrever parâmetros, corpos, respostas, paginação e erros. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-2-FR-003 | Aplicar tema escuro à página Swagger interna. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-2-FR-004 | Manter contratos compartilhados como fonte dos schemas quando possível. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-2-FR-005 | Testar que endpoint interno novo não entra automaticamente na documentação pública. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de api pública e swagger
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/swagger/public-api-document.ts`, `apps/api/src/main.ts`. **[CONFIRMADO]**
