# Autenticação e navegação — Design

## Fluxo

Boot → auth/me → rotas protegidas/AppShell → navegação por permissão → 401/logout → login **[CONFIRMADO]**

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

`apps/web/src/App.tsx`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/auth`. **[CONFIRMADO]**
