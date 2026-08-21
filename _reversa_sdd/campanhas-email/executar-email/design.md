# Executar campanha de e-mail — Design

## Fluxo

Campanha pronta → job de e-mail → SMTP Gmail → resultado por destinatário → métricas consolidadas **[CONFIRMADO]**

```mermaid
flowchart LR
  I[Entrada] --> V[Validar autorização e estado]
  V --> P[Persistir intenção]
  P --> Q[Enfileirar se necessário]
  Q --> E[Executar efeito idempotente]
  E --> R[Persistir resultado]
  R --> U[Notificar interface]
```
**[INFERIDO]**

## Falhas e retomada

- Entrada inválida falha antes da escrita. **[CONFIRMADO]**
- Falha externa conserva o motivo e segue a política delimitada de retry. **[CONFIRMADO]**
- Reinício retoma pelo estado persistido, não pela memória do processo. **[CONFIRMADO]**
- Estado terminal impede sucessores ou efeitos atrasados indevidos. **[INFERIDO]**

## Observabilidade

- Logs técnicos usam IDs correlacionáveis e não incluem credenciais. **[INFERIDO]**
- Eventos internos explicam transições relevantes ao operador. **[CONFIRMADO]**

## Referências

`apps/worker/src/campaign.processor.ts`, `apps/worker/src/gmail-campaign-client.ts`, `apps/api/src/email`, `apps/web/src/pages/Email.tsx`. **[CONFIRMADO]**
