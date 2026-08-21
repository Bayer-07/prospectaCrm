# Relatórios e webhooks — Requisitos

## Visão geral

Produzir relatórios e PDFs do atendimento e notificar sistemas externos por chamadas HTTP GET configuráveis e seguras. **[CONFIRMADO]**

## Regras de negócio

1. Relatórios aplicam período, equipe, usuário, funil e conexão quando pertinentes. **[CONFIRMADO]**
2. Exportações solicitadas pela interface são PDF. **[CONFIRMADO]**
3. PDF de conversa inclui somente o último atendimento, do evento de início até o estado atual. **[CONFIRMADO]**
4. Webhooks configuráveis escolhem ação e endpoint GET. **[CONFIRMADO]**
5. URLs de webhook devem ser públicas e revalidadas antes de cada chamada. **[CONFIRMADO]**
6. Falhas de webhook usam retry e terminam em dead letter com histórico. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RELATORIOS_WEBHOOKS-FR-001 | Consolidar métricas comerciais e exportar documentos PDF legíveis e escopados. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-FR-002 | Cadastrar múltiplos endpoints GET e selecionar quais ações do sistema os acionam. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-FR-003 | Executar GET assinado/configurado em fila, resistente a retry, redirect e DNS rebinding. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-FR-099 | Executar trabalho pesado em segundo plano e atualizar somente entidades afetadas. **[CONFIRMADO]** | Must | A API responde sem bloquear e o resultado chega por consulta ou evento. **[CONFIRMADO]** |

## Requisitos não funcionais

- PostgreSQL é a fonte de verdade; jobs efêmeros não substituem estado persistido. **[CONFIRMADO]**
- Processamentos repetidos devem ser idempotentes e retomáveis após reinício. **[CONFIRMADO]**
- Segredos e URLs temporárias não são persistidos em payloads públicos. **[CONFIRMADO]**
- Consultas novas não devem ser incluídas nas listagens gerais quando o dado só é necessário no detalhe. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: executar relatórios e webhooks em segundo plano
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

`apps/api/src/reports/reports.controller.ts`, `apps/api/src/reports/reports.service.ts`, `apps/api/src/reports/outbound-webhook-url.service.ts`, `apps/worker/src/external-webhook.processor.ts`, `apps/worker/src/public-http-get.ts`, `apps/api/src/integrations/conversation-pdf.ts`. **[CONFIRMADO]**
