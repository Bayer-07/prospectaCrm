# Configurar OpenAI — Requisitos

## Objetivo

Permitir ao administrador armazenar chave, selecionar modelo, definir instruções e testar o provedor. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| IA_CONHECIMENTO-1-FR-001 | Criptografar a chave e exibir somente estado e últimos caracteres. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-1-FR-002 | Exigir uma chave válida antes de habilitar IA. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-1-FR-003 | Selecionar modelo permitido e instruções globais em português. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-1-FR-004 | Executar teste assíncrono sem revelar prompt ou segredo. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-1-FR-005 | Manter CRM saudável quando provedor estiver desabilitado ou indisponível. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de configurar openai
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/ai/ai.controller.ts`, `apps/api/src/ai/ai.service.ts`, `apps/web/src/pages/Settings.tsx`. **[CONFIRMADO]**
