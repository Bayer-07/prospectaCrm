# Shutdown e operação — Design

## Fluxo

SIGTERM → readiness off → pause workers → concluir/devolver jobs → fechar clientes/Redis/DB → exit **[CONFIRMADO]**

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

`apps/worker/src/main.ts`, `apps/api/src/main.ts`, `docker-compose.yml`. **[CONFIRMADO]**
