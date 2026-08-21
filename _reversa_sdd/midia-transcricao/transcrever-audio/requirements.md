# Transcrever áudio — Requisitos

## Objetivo

Converter áudio recebido ou enviado em texto sob demanda e reutilizar a transcrição em resumo e exportação PDF. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| MIDIA_TRANSCRICAO-3-FR-001 | Exibir botão Transcrever em mensagens de áudio. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-3-FR-002 | Enfileirar uma transcrição idempotente por mensagem. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-3-FR-003 | Atualizar a conversa em tempo real quando o texto ficar pronto. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-3-FR-004 | Mostrar Ver mais para transcrição longa. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-3-FR-005 | Ao exportar atendimento, incluir transcrição disponível ou produzi-la antes do PDF. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de transcrever áudio
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/transcription.processor.ts`, `apps/api/src/integrations/conversation-pdf.ts`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
