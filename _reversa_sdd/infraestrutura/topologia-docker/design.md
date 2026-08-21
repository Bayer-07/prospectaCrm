# Topologia Docker — Design

## Fluxo

docker compose → infra saudável → init/migrations → API/web/MCP → workers e integrações **[CONFIRMADO]**

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

`docker-compose.yml`, `infra/evolution/Dockerfile`. **[CONFIRMADO]**
