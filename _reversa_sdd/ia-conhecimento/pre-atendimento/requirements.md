# Pré-atendimento por IA — Requisitos

## Objetivo

Responder automaticamente dentro do bloco de chatbot e transferir com segurança em baixa confiança ou falha. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| IA_CONHECIMENTO-3-FR-001 | Respeitar objetivo, critérios, limite de 1 a 20 interações e confiança mínima. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-3-FR-002 | Usar contexto recente e estado coletado sem executar ferramentas. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-3-FR-003 | Aplicar fallback e handoff em timeout, JSON inválido, mídia não interpretada ou baixa confiança. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-3-FR-004 | Cancelar geração pendente quando humano assumir. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-3-FR-005 | Criar propostas de nome, e-mail, cargo, empresa e nota para aprovação. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de pré-atendimento por ia
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/ai-generation.processor.ts`, `apps/worker/src/chatbot.processor.ts`, `apps/api/src/ai`. **[CONFIRMADO]**
