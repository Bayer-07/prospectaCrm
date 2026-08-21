# Executar regras — Requisitos

## Objetivo

Consumir mensagens recebidas, avançar a sessão determinística e enviar a resposta configurada uma única vez. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CHATBOTS-2-FR-001 | Criar ou retomar sessão do chatbot associada à conversa e versão. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-2-FR-002 | Avaliar resposta e escolher aresta compatível. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-2-FR-003 | Persistir estado antes ou junto do envio idempotente. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-2-FR-004 | Executar espera sem bloquear processo ou navegador. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-2-FR-005 | Retomar após reinício sem duplicar mensagem. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de executar regras
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/chatbot.processor.ts`, `apps/worker/src/inbound.processor.ts`. **[CONFIRMADO]**
