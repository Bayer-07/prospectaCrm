# Tempo real e notificações — Requisitos

## Visão geral

Propagar atualizações direcionadas por Socket.IO e manter notificações internas lidas ou não lidas por usuário. **[CONFIRMADO]**

## Regras de negócio

1. Socket autentica com a sessão e associa o cliente à organização e usuário. **[CONFIRMADO]**
2. Eventos não devem transmitir dados de outra organização ou conversa invisível. **[CONFIRMADO]**
3. Notificações persistem destinatário, tipo, conteúdo e leitura. **[CONFIRMADO]**
4. Marcar como lida remove o indicador sem apagar o histórico necessário. **[CONFIRMADO]**
5. Som de nova mensagem depende de foco da página e conversa aberta conforme regra de interface. **[CONFIRMADO]**
6. Listagens são invalidadas seletivamente, sem recarregar toda a aplicação. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| TEMPO_REAL_NOTIFICACOES-FR-001 | Manter canal em tempo real autorizado e reconectável para cada sessão da interface. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-FR-002 | Criar, listar e marcar notificações como lidas com contador correto por usuário. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-FR-003 | Atualizar somente caches afetados e tocar aviso sonoro de mensagem conforme foco e conversa ativa. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| TEMPO_REAL_NOTIFICACOES-FR-099 | Executar trabalho pesado em segundo plano e atualizar somente entidades afetadas. **[CONFIRMADO]** | Must | A API responde sem bloquear e o resultado chega por consulta ou evento. **[CONFIRMADO]** |

## Requisitos não funcionais

- PostgreSQL é a fonte de verdade; jobs efêmeros não substituem estado persistido. **[CONFIRMADO]**
- Processamentos repetidos devem ser idempotentes e retomáveis após reinício. **[CONFIRMADO]**
- Segredos e URLs temporárias não são persistidos em payloads públicos. **[CONFIRMADO]**
- Consultas novas não devem ser incluídas nas listagens gerais quando o dado só é necessário no detalhe. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: executar tempo real e notificações em segundo plano
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

`apps/api/src/realtime/realtime.gateway.ts`, `apps/api/src/reports/reports.controller.ts`, `apps/api/src/reports/reports.service.ts`, `apps/web/src/lib/realtime.ts`, `apps/web/src/components/Shell.tsx`. **[CONFIRMADO]**
