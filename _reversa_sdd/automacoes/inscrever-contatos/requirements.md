# Inscrever contatos — Requisitos

## Objetivo

Criar execução vinculada a um contato por gatilho ou comando manual, respeitando a política de reentrada. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| AUTOMACOES-2-FR-001 | Avaliar gatilhos somente para contatos dentro da organização. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-2-FR-002 | Permitir início manual pela conversa com @. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-2-FR-003 | Criar nova execução a cada início manual deliberado. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-2-FR-004 | Fixar a versão publicada no instante da inscrição. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-2-FR-005 | Registrar log interno de início e conclusão na conversa quando originada pelo chat. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de inscrever contatos
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/workflows/workflows.service.ts`, `apps/web/src/pages/Inbox.tsx`, `apps/worker/src/workflow.processor.ts`. **[CONFIRMADO]**
