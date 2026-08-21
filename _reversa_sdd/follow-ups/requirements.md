# Follow-ups automáticos — Requisitos

## Visão geral

Agendar uma tarefa vinculada à conversa para enviar uma sequência de mensagens ou iniciar uma automação em horário futuro. **[CONFIRMADO]**

## Regras de negócio

1. Existe no máximo um follow-up SCHEDULED ou RUNNING por conversa. **[CONFIRMADO]**
2. Criar follow-up e tarefa ocorre na mesma transação. **[CONFIRMADO]**
3. Mensagens seguintes usam atraso próprio contado após o envio bem-sucedido da anterior. **[CONFIRMADO]**
4. Versão de workflow é fixada no agendamento. **[CONFIRMADO]**
5. Resposta do cliente cancela antes do início ou interrompe etapas restantes durante execução. **[CONFIRMADO]**
6. Jobs antigos validam revisão, status e horário antes de agir. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| FOLLOW_UPS-FR-001 | Escolher data, horário e ação em um modal por etapas, criando simultaneamente tarefa e follow-up. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| FOLLOW_UPS-FR-002 | Reabrir a conversa quando necessário e executar mensagens ou inscrição de workflow de forma idempotente. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| FOLLOW_UPS-FR-003 | Tratar respostas, cancelamentos, desconexão e reinício sem enviar conteúdo duplicado ou atrasado demais. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| FOLLOW_UPS-FR-099 | Executar trabalho pesado em segundo plano e atualizar somente entidades afetadas. **[CONFIRMADO]** | Must | A API responde sem bloquear e o resultado chega por consulta ou evento. **[CONFIRMADO]** |

## Requisitos não funcionais

- PostgreSQL é a fonte de verdade; jobs efêmeros não substituem estado persistido. **[CONFIRMADO]**
- Processamentos repetidos devem ser idempotentes e retomáveis após reinício. **[CONFIRMADO]**
- Segredos e URLs temporárias não são persistidos em payloads públicos. **[CONFIRMADO]**
- Consultas novas não devem ser incluídas nas listagens gerais quando o dado só é necessário no detalhe. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: executar follow-ups automáticos em segundo plano
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

`apps/api/src/follow-ups/follow-ups.controller.ts`, `apps/api/src/follow-ups/follow-ups.service.ts`, `apps/worker/src/follow-up.processor.ts`, `apps/web/src/components/FollowUpModal.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
