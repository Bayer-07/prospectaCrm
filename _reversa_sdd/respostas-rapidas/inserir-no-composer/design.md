# Inserir no composer — Design

## Fluxo

Digitar / → buscar catálogo → navegar/selecionar → preencher rascunho/anexo → usuário edita → envio normal **[CONFIRMADO]**

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

`apps/web/src/pages/Inbox.tsx`, `apps/api/src/quick-replies/quick-replies.controller.ts`. **[CONFIRMADO]**
