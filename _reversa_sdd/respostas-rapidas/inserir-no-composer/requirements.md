# Inserir no composer — Requisitos

## Objetivo

Sugerir respostas ao digitar / e preencher o rascunho para revisão antes do envio. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RESPOSTAS_RAPIDAS-2-FR-001 | Abrir menu ao detectar / no contexto de comando. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-2-FR-002 | Filtrar por nome, atalho e conteúdo. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-2-FR-003 | Inserir texto na posição coerente e substituir variáveis somente no envio. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-2-FR-004 | Preparar anexo para prévia e possível remoção. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-2-FR-005 | Não sobrescrever rascunho concorrente nem enviar ao selecionar. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de inserir no composer
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/web/src/pages/Inbox.tsx`, `apps/api/src/quick-replies/quick-replies.controller.ts`. **[CONFIRMADO]**
