# Socket autenticado — Requisitos

## Objetivo

Manter canal em tempo real autorizado e reconectável para cada sessão da interface. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| TEMPO_REAL_NOTIFICACOES-1-FR-001 | Autenticar handshake com cookie/sessão vigente. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-1-FR-002 | Entrar apenas em rooms da organização/usuário autorizados. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-1-FR-003 | Reconectar com backoff e revalidar sessão. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-1-FR-004 | Desconectar ou negar após logout/expiração. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-1-FR-005 | Emitir payloads pequenos com IDs e tipo de evento. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de socket autenticado
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/realtime/realtime.gateway.ts`, `apps/web/src/providers/RealtimeProvider.tsx`. **[CONFIRMADO]**
