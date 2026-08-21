# Executar sequência — Design

## Fluxo

Job vencido → validar status/revisão/tolerância → abrir/atribuir conversa → executar etapa → persistir → sucessor ou conclusão **[CONFIRMADO]**

```mermaid
flowchart LR
  I[Entrada] --> V[Validar acesso e estado]
  V --> P[Persistir intenção]
  P --> J[Executar agora ou por job]
  J --> R[Persistir resultado]
  R --> N[Notificar consumidor]
```
**[INFERIDO]**

## Falhas e retomada

- Entrada inválida falha antes do efeito. **[CONFIRMADO]**
- Falha de dependência mantém motivo sanitizado e segue retry delimitado. **[CONFIRMADO]**
- Reinício recupera pelo banco e não pela memória do processo. **[CONFIRMADO]**
- Resultado obsoleto não substitui estado mais recente. **[INFERIDO]**

## Referências

`apps/worker/src/follow-up.processor.ts`, `apps/api/src/follow-ups/follow-ups.service.ts`. **[CONFIRMADO]**
