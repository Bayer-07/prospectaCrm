# Respostas rápidas — Requisitos

## Visão geral

Gerenciar textos e anexos reutilizáveis e inseri-los de forma editável no composer da conversa. **[CONFIRMADO]**

## Regras de negócio

1. O atalho / abre respostas rápidas; automações permanecem sob @. **[CONFIRMADO]**
2. Selecionar uma resposta apenas preenche texto e anexo, sem enviar automaticamente. **[CONFIRMADO]**
3. Texto inserido continua editável e usa as mesmas variáveis das mensagens manuais. **[CONFIRMADO]**
4. Anexos referenciam MediaAsset seguro. **[CONFIRMADO]**
5. Listagem e alteração respeitam organização e permissões. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RESPOSTAS_RAPIDAS-FR-001 | Criar, buscar, editar e excluir respostas rápidas com texto e anexo opcional. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-FR-002 | Sugerir respostas ao digitar / e preencher o rascunho para revisão antes do envio. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| RESPOSTAS_RAPIDAS-FR-099 | Executar trabalho pesado em segundo plano e atualizar somente entidades afetadas. **[CONFIRMADO]** | Must | A API responde sem bloquear e o resultado chega por consulta ou evento. **[CONFIRMADO]** |

## Requisitos não funcionais

- PostgreSQL é a fonte de verdade; jobs efêmeros não substituem estado persistido. **[CONFIRMADO]**
- Processamentos repetidos devem ser idempotentes e retomáveis após reinício. **[CONFIRMADO]**
- Segredos e URLs temporárias não são persistidos em payloads públicos. **[CONFIRMADO]**
- Consultas novas não devem ser incluídas nas listagens gerais quando o dado só é necessário no detalhe. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: executar respostas rápidas em segundo plano
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

`apps/api/src/quick-replies/quick-replies.controller.ts`, `apps/api/src/quick-replies/quick-replies.service.ts`, `apps/web/src/pages/QuickReplies.tsx`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
