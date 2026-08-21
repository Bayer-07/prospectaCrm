# Espera, handoff e IA — Requisitos

## Objetivo

Executar pré-atendimento com atrasos e OpenAI, transferindo de forma segura quando a automação não deve continuar. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CHATBOTS-3-FR-001 | Gerar resposta automática somente em conversa sem responsável humano. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-3-FR-002 | Usar instruções globais, instruções do bloco e contexto recente. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-3-FR-003 | Aplicar fallback e handoff em erro, anexo não interpretado, baixa confiança ou limite. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-3-FR-004 | Cancelar geração quando um humano assumir. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-3-FR-005 | Registrar evento interno e propostas de CRM para aprovação, sem alteração automática. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de espera, handoff e ia
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/chatbot.processor.ts`, `apps/worker/src/ai.processor.ts`, `apps/api/src/ai`. **[CONFIRMADO]**
