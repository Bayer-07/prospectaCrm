# Mídia e transcrição — Requisitos

## Visão geral

Armazenar anexos com segurança, transportar mídias do WhatsApp e transcrever áudios sem bloquear a conversa. **[CONFIRMADO]**

## Regras de negócio

1. Arquivos são armazenados no MinIO por chave; URLs assinadas são temporárias. **[CONFIRMADO]**
2. Tipos permitidos são validados no servidor por finalidade. **[CONFIRMADO]**
3. Mídia enviada à Evolution usa URL acessível internamente ou base64 conforme contrato do tipo. **[CONFIRMADO]**
4. Áudio gravado no navegador é convertido para formato aceito antes do envio quando necessário. **[CONFIRMADO]**
5. Transcrição é processada em fila e persistida junto da mensagem. **[CONFIRMADO]**
6. Retenção padrão de mensagens e mídias é configurável e parte de 24 meses. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| MIDIA_TRANSCRICAO-FR-001 | Aceitar seleção, colagem e drag-and-drop de arquivo, persistindo ativo seguro e servindo visualização/download temporários. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-FR-002 | Enviar e receber imagem, áudio, vídeo, documento, sticker e conteúdos especiais preservando legenda e metadados. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-FR-003 | Converter áudio recebido ou enviado em texto sob demanda e reutilizar a transcrição em resumo e exportação PDF. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-FR-004 | Remover ativos expirados conforme política sem apagar consentimento, auditoria ou métricas essenciais. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-FR-099 | Executar trabalho pesado em segundo plano e atualizar somente entidades afetadas. **[CONFIRMADO]** | Must | A API responde sem bloquear e o resultado chega por consulta ou evento. **[CONFIRMADO]** |

## Requisitos não funcionais

- PostgreSQL é a fonte de verdade; jobs efêmeros não substituem estado persistido. **[CONFIRMADO]**
- Processamentos repetidos devem ser idempotentes e retomáveis após reinício. **[CONFIRMADO]**
- Segredos e URLs temporárias não são persistidos em payloads públicos. **[CONFIRMADO]**
- Consultas novas não devem ser incluídas nas listagens gerais quando o dado só é necessário no detalhe. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: executar mídia e transcrição em segundo plano
  Dado que a solicitação é válida e autorizada
  Quando a API persiste a intenção e enfileira o trabalho
  Então o usuário continua utilizando o sistema
  E o resultado final é persistido e comunicado sem duplicidade
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, estados, autorização, idempotência e falhas descritos neste módulo. **[CONFIRMADO]**
- **Should:** progresso em tempo real e diagnóstico acionável. **[INFERIDO]**
- **Could:** métricas históricas adicionais. **[A VALIDAR]**
- **Won’t:** expor segredo de infraestrutura ao navegador. **[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/media/media.controller.ts`, `apps/api/src/media/media.service.ts`, `apps/worker/src/storage.ts`, `apps/worker/src/transcription.processor.ts`, `apps/web/src/pages/Inbox.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
