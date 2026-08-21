# Chaves e idempotência — Requisitos

## Objetivo

Autenticar integrações por chave escopada e impedir duplicações em criações repetidas. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| API_EXTERNA_MCP-1-FR-001 | Validar hash, expiração, revogação e escopos da chave. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-1-FR-002 | Limitar rotas públicas por allowlist explícita. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-1-FR-003 | Exigir Idempotency-Key em criações sensíveis. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-1-FR-004 | Persistir resposta e detectar reutilização incompatível da chave idempotente. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| API_EXTERNA_MCP-1-FR-005 | Atualizar último uso sem gravar a cada requisição. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de chaves e idempotência
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/auth/auth.guard.ts`, `apps/api/src/common/idempotency.interceptor.ts`. **[CONFIRMADO]**
