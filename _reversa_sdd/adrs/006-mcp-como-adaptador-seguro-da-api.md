# ADR 006 — MCP como adaptador seguro da API REST

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-24
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commits `8e28e62`, `1167a33`

## Contexto

LLMs precisam ler, criar e editar dados do CRM sem acesso direto ao banco e sem poder excluir registros. O servidor deve permanecer estável após ferramentas de escrita e respeitar os mesmos limites da API externa.

## Decisão

- Implementar serviço MCP stateless que recebe chave de API e descobre seus escopos.
- Registrar dinamicamente apenas ferramentas autorizadas.
- Fazer cada ferramenta chamar `/api/v1`, reaproveitando validação, auditoria, escopo e idempotência.
- Não implementar ferramentas de excluir, apagar, arquivar ou cancelar.
- Exigir `idempotencyKey` em criações sensíveis.

## Consequências

### Positivas

- Nenhuma segunda camada de acesso ao Prisma ou regra comercial.
- O conjunto anunciado é menor para chaves de privilégio limitado.
- Testes garantem ausência de nomes destrutivos e leitura após escrita.

### Negativas

- Disponibilidade do MCP depende da API interna.
- Uma nova capacidade requer contrato REST e ferramenta MCP.
- A ausência deliberada de exclusão pode exigir intervenção humana para correções.

## Alternativas consideradas

- MCP direto no banco: rejeitado por duplicar autorização e permitir contornar invariantes.
- Expor toda OpenAPI automaticamente: superfície excessiva e risco de operações destrutivas.
- Uma credencial administrativa fixa: rejeitada por privilégio excessivo e baixa rastreabilidade.

## Evidências atuais

`apps/mcp/src/main.ts`, `apps/mcp/src/server.ts`, `apps/mcp/src/tools.ts`, `apps/mcp/src/api-client.ts`, `apps/mcp/src/tools.test.ts`.
