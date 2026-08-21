# Chaves e idempotência — Design

## Fluxo

Bearer pk_ → hash/cache → ApiKey → rota/escopo → idempotency record → serviço CRM **[CONFIRMADO]**

```mermaid
flowchart LR
  I[Entrada/configuração] --> V[Validar]
  V --> A[Aplicar operação]
  A --> P[Persistir/propagar]
  P --> H[Healthcheck ou resposta]
```
**[INFERIDO]**

## Falhas e segurança

- Falha obrigatória interrompe o fluxo antes de expor estado inconsistente. **[INFERIDO]**
- Valores secretos são redigidos em logs e não entram no frontend. **[CONFIRMADO]**
- Reexecução deve ser segura ou exigir confirmação explícita quando houver efeito externo. **[INFERIDO]**

## Referências

`apps/api/src/auth/auth.guard.ts`, `apps/api/src/common/idempotency.interceptor.ts`. **[CONFIRMADO]**
