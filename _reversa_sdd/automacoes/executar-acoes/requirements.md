# Executar ações — Requisitos

## Objetivo

Executar nós pequenos e idempotentes, persistindo espera, ramificação e efeitos antes de avançar. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| AUTOMACOES-3-FR-001 | Enviar WhatsApp, esperar, ramificar, atualizar registro, mover etapa, atribuir, etiquetar, criar tarefa, notificar e encerrar. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-3-FR-002 | Aplicar variáveis no instante da ação. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-3-FR-003 | Usar assinatura do operador associado quando habilitada. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-3-FR-004 | Retomar espera e execução após reinício. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-3-FR-005 | Interromper etapas futuras em resposta, opt-out ou falha terminal. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de executar ações
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/workflow.processor.ts`. **[CONFIRMADO]**
