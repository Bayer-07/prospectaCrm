# Upload e download — Requisitos

## Objetivo

Aceitar seleção, colagem e drag-and-drop de arquivo, persistindo ativo seguro e servindo visualização/download temporários. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| MIDIA_TRANSCRICAO-1-FR-001 | Validar autorização, MIME, finalidade e tamanho operacional no servidor. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-1-FR-002 | Não impor limite artificial de frontend diferente do backend. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-1-FR-003 | Guardar nome, tipo, tamanho, chave e proprietário do ativo. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-1-FR-004 | Gerar URL assinada curta para visualizar ou baixar. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-1-FR-005 | Permitir lightbox de imagem com zoom por scroll e pan. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de upload e download
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/media/media.controller.ts`, `apps/api/src/media/media.service.ts`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
