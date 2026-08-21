# API externa e MCP — Requisitos

## Visão geral

Expor um subconjunto seguro e documentado do CRM para integrações REST e clientes MCP capazes de ler, criar e editar, nunca excluir. **[CONFIRMADO]**

## Regras de negócio

1. A API pública usa JSON, UUID, ISO-8601 UTC, E.164, centavos e paginação por cursor. **[CONFIRMADO]**
2. Chaves nomeadas possuem hash, escopos, expiração e rate limit. **[CONFIRMADO]**
3. Idempotency-Key é obrigatório em criações externas sensíveis. **[CONFIRMADO]**
4. Swagger inclui somente endpoints públicos úteis e seus schemas completos. **[CONFIRMADO]**
5. MCP anuncia apenas ferramentas reais de leitura, criação e edição. **[CONFIRMADO]**
6. MCP não expõe operações destrutivas nem credenciais estáticas. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| API_EXTERNA_MCP-FR-001 | Autenticar integrações por chave escopada e impedir duplicações em criações repetidas. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| API_EXTERNA_MCP-FR-002 | Documentar e executar operações REST úteis com atributos, exemplos, segurança e erros claros. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| API_EXTERNA_MCP-FR-003 | Adaptar ferramentas MCP ao subconjunto REST autorizado, mantendo leitura/criação/edição e bloqueando exclusão. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| API_EXTERNA_MCP-FR-099 | Falhar de modo seguro quando configuração, dependência ou autorização obrigatória estiver ausente. **[CONFIRMADO]** | Must | Nenhum dado protegido ou efeito parcial é produzido. **[INFERIDO]** |

## Requisitos não funcionais

- Configuração varia por ambiente e nenhum endereço de desenvolvimento é fixado no código de domínio. **[CONFIRMADO]**
- Operações volumosas usam paginação, streaming, lote ou fila conforme sua natureza. **[INFERIDO]**
- Logs e respostas não expõem chaves, senhas, cookies ou URLs assinadas duradouras. **[CONFIRMADO]**
- A interface e os serviços opcionais degradam de forma isolada. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: operar api externa e mcp com configuração válida
  Dado que dependências, credenciais e permissões necessárias estão disponíveis
  Quando o caso de uso é executado
  Então o resultado é consistente e rastreável
  E nenhuma fronteira interna é exposta indevidamente
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, isolamento, segurança e casos de uso documentados. **[CONFIRMADO]**
- **Should:** healthcheck, observabilidade e recuperação orientada. **[INFERIDO]**
- **Could:** automação operacional adicional após métricas reais. **[A VALIDAR]**
- **Won’t:** depender de segredo ou IP hardcoded no repositório. **[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/auth/auth.guard.ts`, `apps/api/src/common/idempotency.interceptor.ts`, `apps/api/src/swagger/public-api-document.ts`, `apps/api/src/mcp/mcp.controller.ts`, `apps/mcp/src/main.ts`, `packages/contracts/src`. **[CONFIRMADO]**
