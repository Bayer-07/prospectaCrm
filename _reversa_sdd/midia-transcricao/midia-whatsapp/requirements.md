# Mídia no WhatsApp — Requisitos

## Objetivo

Enviar e receber imagem, áudio, vídeo, documento, sticker e conteúdos especiais preservando legenda e metadados. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| MIDIA_TRANSCRICAO-2-FR-001 | Enviar mídia com URL/base64 conforme endpoint Evolution. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-2-FR-002 | Persistir legenda junto do arquivo e renderizá-la no mesmo balão. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-2-FR-003 | Exibir sticker, contato e localização em componentes próprios. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-2-FR-004 | Representar tipo realmente não suportado por placeholder informativo. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-2-FR-005 | Permitir download de áudio e impedir copiar conteúdo inexistente. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de mídia no whatsapp
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/integrations/evolution.service.ts`, `apps/worker/src/inbound.processor.ts`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
