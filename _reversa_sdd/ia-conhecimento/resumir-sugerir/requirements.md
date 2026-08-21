# Resumir e sugerir resposta — Requisitos

## Objetivo

Gerar resumo persistente ou texto editável sob demanda, preservando o composer do usuário. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| IA_CONHECIMENTO-2-FR-001 | Resumir atendimento atual ou conversa completa hierarquicamente. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-2-FR-002 | Estruturar visão geral, necessidade, compromissos, próximos passos e pendências. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-2-FR-003 | Montar sugestão com resumo válido, contato/empresa e últimas doze mensagens. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-2-FR-004 | Inserir automaticamente apenas se o composer permanecer vazio e inalterado. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-2-FR-005 | Marcar resumo desatualizado ao chegar nova mensagem. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de resumir e sugerir resposta
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/ai/ai.service.ts`, `apps/worker/src/ai.processor.ts`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
