# Modelar e publicar automação — Requisitos

## Objetivo

Criar um grafo versionado de gatilhos, condições e ações sem ciclos. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| AUTOMACOES-1-FR-001 | Adicionar gatilhos de cadastro, alteração, etapa, mensagem, agenda e inscrição manual. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-1-FR-002 | Adicionar condições de CRM, consentimento, equipe, responsável, resposta e interação. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-1-FR-003 | Editar o texto de ações Enviar WhatsApp. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-1-FR-004 | Validar aciclicidade e configuração antes de publicar. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| AUTOMACOES-1-FR-005 | Excluir automação mediante confirmação e regras de vínculo. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de modelar e publicar automação
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/workflows/workflows.service.ts`, `apps/web/src/pages/Automations.tsx`. **[CONFIRMADO]**
