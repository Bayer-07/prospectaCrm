# Gerenciar catálogo — Design

## Fluxo

Página de respostas → formulário → validação → QuickReply + MediaAsset opcional → catálogo atualizado **[CONFIRMADO]**

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

`apps/api/src/quick-replies/quick-replies.service.ts`, `apps/web/src/pages/QuickReplies.tsx`. **[CONFIRMADO]**
