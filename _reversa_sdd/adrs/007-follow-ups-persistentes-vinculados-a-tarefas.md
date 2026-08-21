# ADR 007 — Follow-ups persistentes vinculados a tarefas

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-08-14
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commit `3661c7d`

## Contexto

Um operador precisa combinar contato futuro sem depender de lembrete manual. O compromisso deve aparecer na agenda, enviar mensagens ou iniciar automação, sobreviver a reinícios e parar quando o cliente responder.

## Decisão

- Modelar `ConversationFollowUp` e etapas persistidas.
- Criar, na mesma transação, uma `Task` vinculada à agenda.
- Permitir um único follow-up ativo por conversa via índice parcial.
- Usar jobs determinísticos com revisão incremental em reagendamentos.
- Revalidar banco antes de cada etapa e agendar a próxima somente após sucesso.
- Reconciliar horários após reinício e rejeitar envio com atraso superior a 30 minutos.
- Propagar transferências de responsável e interpretar resposta antes/durante a sequência.

## Consequências

### Positivas

- Agenda e execução automática representam o mesmo compromisso.
- Drag-and-drop altera o horário real, não apenas a apresentação.
- Respostas evitam mensagens desnecessárias e geram histórico explicável.

### Negativas

- Duas máquinas de estado (tarefa e follow-up) precisam permanecer consistentes.
- Edição após início é restringida para preservar determinismo.
- Falha de conexão demanda retry, tolerância e alertas próprios.

## Alternativas consideradas

- Apenas tarefa com texto livre: não executa automaticamente.
- Apenas delayed job BullMQ: não representa agenda nem sobrevive à perda da fila com histórico completo.
- Workflow genérico para todo follow-up: inadequado para edição simples de sequência e tarefa.

## Evidências atuais

Migrações de follow-up, `apps/api/src/follow-ups/*`, `apps/worker/src/follow-up.processor.ts`, `apps/worker/src/outbound.processor.ts`, calendário web.
