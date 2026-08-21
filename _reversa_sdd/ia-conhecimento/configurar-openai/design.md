# Configurar OpenAI — Design

## Fluxo

Administrador salva chave/modelo/instruções → API cifra → worker testa OpenAI → status sanitizado retorna à interface **[CONFIRMADO]**

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

`apps/api/src/ai/ai.controller.ts`, `apps/api/src/ai/ai.service.ts`, `apps/web/src/pages/AiSettings.tsx`. **[CONFIRMADO]**
