# Gerenciar catálogo — Requisitos

## Objetivo

Criar, buscar, editar e excluir respostas rápidas com texto e anexo opcional. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RESPOSTAS_RAPIDAS-1-FR-001 | Cadastrar nome/atalho e texto. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-1-FR-002 | Associar imagem ou documento opcional. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-1-FR-003 | Pesquisar opções disponíveis ao usuário. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-1-FR-004 | Editar mantendo referências válidas de mídia. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-1-FR-005 | Excluir mediante confirmação e sem afetar mensagens já enviadas. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de gerenciar catálogo
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/quick-replies/quick-replies.service.ts`, `apps/web/src/pages/QuickReplies.tsx`. **[CONFIRMADO]**
