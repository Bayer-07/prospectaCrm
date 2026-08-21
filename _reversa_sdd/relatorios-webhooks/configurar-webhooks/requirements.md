# Configurar webhooks — Requisitos

## Objetivo

Cadastrar múltiplos endpoints GET e selecionar quais ações do sistema os acionam. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RELATORIOS_WEBHOOKS-2-FR-001 | Criar nome, ação, endpoint e estado ativo. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-2-FR-002 | Aceitar somente HTTP/HTTPS sem credenciais embutidas. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-2-FR-003 | Bloquear localhost, redes privadas, link-local, metadata e nomes internos. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-2-FR-004 | Resolver DNS e rejeitar qualquer endereço privado retornado. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-2-FR-005 | Permitir editar, ativar, desativar e excluir configuração com auditoria. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de configurar webhooks
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/reports/outbound-webhook-url.service.ts`, `apps/api/src/reports/reports.service.ts`. **[CONFIRMADO]**
