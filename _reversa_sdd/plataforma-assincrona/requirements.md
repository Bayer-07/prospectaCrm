# Plataforma assíncrona — Requisitos

## Visão geral

Executar filas, reconciliações e manutenção de forma persistente, idempotente e isolada do ciclo HTTP. **[CONFIRMADO]**

## Regras de negócio

1. A API persiste intenção antes de enfileirar trabalho relevante. **[CONFIRMADO]**
2. Cada processor relê estado no banco e tolera redelivery. **[CONFIRMADO]**
3. Jobs concluídos são removidos da fila e histórico comercial permanece no PostgreSQL. **[CONFIRMADO]**
4. Reconciliação recupera registros pendentes após reinício ou perda de job. **[CONFIRMADO]**
5. Concorrência é configurada por carga e dependência, mantendo IA em baixa concorrência. **[CONFIRMADO]**
6. Shutdown para de aceitar trabalho, conclui ou devolve jobs e fecha recursos. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| PLATAFORMA_ASSINCRONA-FR-001 | Distribuir jobs pequenos por domínio com concorrência, retry e identificadores previsíveis. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-FR-002 | Recuperar trabalhos ausentes e limpar dados expirados por consultas indexadas em lotes pequenos. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-FR-003 | Encerrar API e worker sem abandonar job em estado enganoso ou corromper conexões. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-FR-099 | Falhar de modo seguro quando configuração, dependência ou autorização obrigatória estiver ausente. **[CONFIRMADO]** | Must | Nenhum dado protegido ou efeito parcial é produzido. **[INFERIDO]** |

## Requisitos não funcionais

- Configuração varia por ambiente e nenhum endereço de desenvolvimento é fixado no código de domínio. **[CONFIRMADO]**
- Operações volumosas usam paginação, streaming, lote ou fila conforme sua natureza. **[INFERIDO]**
- Logs e respostas não expõem chaves, senhas, cookies ou URLs assinadas duradouras. **[CONFIRMADO]**
- A interface e os serviços opcionais degradam de forma isolada. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: operar plataforma assíncrona com configuração válida
  Dado que dependências, credenciais e permissões necessárias estão disponíveis
  Quando o caso de uso é executado
  Então o resultado é consistente e rastreável
  E nenhuma fronteira interna é exposta indevidamente
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, isolamento, segurança e casos de uso documentados. **[CONFIRMADO]**
- **Should:** healthcheck, observabilidade e recuperação orientada. **[INFERIDO]**
- **Could:** automação operacional adicional após métricas reais. **[A VALIDAR]**
- **Won’t:** depender de segredo ou IP hardcoded no repositório. **[CONFIRMADO]**

## Rastreabilidade

`apps/worker/src/main.ts`, `apps/worker/src/maintenance.processor.ts`, `apps/api/src/queue/queue.module.ts`, `docker-compose.yml`. **[CONFIRMADO]**
