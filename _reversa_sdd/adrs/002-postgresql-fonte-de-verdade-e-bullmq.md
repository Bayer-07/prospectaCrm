# ADR 002 — PostgreSQL como fonte de verdade e BullMQ para execução assíncrona

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-17, ampliado em 2026-08-14
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commits `81d91ff`, `3661c7d`, `32c4d3c`, `70bf912`

## Contexto

Mensagens, campanhas, esperas, follow-ups, IA, transcrição e webhooks possuem latência externa, retries e necessidade de sobreviver a reinícios. Tratar a fila como única fonte de estado perderia histórico e dificultaria reconciliação.

## Decisão

- Persistir primeiro a intenção e o estado no PostgreSQL.
- Enfileirar trabalhos pequenos no Redis/BullMQ usando IDs determinísticos quando há risco de duplicidade.
- Fazer o worker revalidar estado, revisão, organização e horário no banco antes de produzir efeito externo.
- Executar reconciliadores periódicos para recuperar jobs ausentes ou abandonados.
- Usar Socket.IO apenas para atualização incremental da interface, nunca como fonte de verdade.

## Consequências

### Positivas

- Reinícios de API, worker ou Redis não apagam a intenção comercial.
- Idempotência pode ser conferida por restrições e transições condicionais no banco.
- A UI não precisa fazer polling pesado.

### Negativas

- O mesmo fluxo aparece em banco, fila e reconciliador, aumentando complexidade.
- É necessário projetar cuidadosamente estados terminais e revisões.
- Atrasos de BullMQ não garantem execução no milissegundo exato sob carga.

## Regras decorrentes

- Jobs obsoletos saem sem efeito.
- Falhas precisam atualizar o registro persistido antes de relançar para retry.
- Jobs concluídos podem ser removidos da fila; histórico comercial fica no PostgreSQL.
- Follow-ups, chatbot waits, gerações de IA e indexações possuem reconciliação própria.

## Alternativas consideradas

- Cron que consulta todas as tabelas: rejeitado por custo crescente e baixa precisão.
- Apenas delayed jobs sem registro persistido: rejeitado por perda de rastreabilidade.
- Kafka/event sourcing: desproporcional à escala e operação atual.

## Evidências atuais

`apps/api/src/queue/queue.module.ts`, `apps/worker/src/main.ts`, processadores, reconciliadores, índices do Prisma e testes de idempotência.
