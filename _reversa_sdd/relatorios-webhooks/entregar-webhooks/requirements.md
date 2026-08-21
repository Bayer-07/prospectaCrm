# Entregar webhooks — Requisitos

## Objetivo

Executar GET assinado/configurado em fila, resistente a retry, redirect e DNS rebinding. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RELATORIOS_WEBHOOKS-3-FR-001 | Criar entrega com ID, horário e referência ao evento. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-3-FR-002 | Revalidar destino e fixar lookup aos IPs públicos resolvidos. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-3-FR-003 | Seguir poucos redirects, revalidando cada destino. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-3-FR-004 | Registrar attempts, lastError, retrying e dead_letter inclusive em falha de descriptografia. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-3-FR-005 | Nunca acessar loopback, RFC1918, CGNAT, link-local ou metadata. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de entregar webhooks
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/external-webhook.processor.ts`, `apps/worker/src/public-http-get.ts`. **[CONFIRMADO]**
