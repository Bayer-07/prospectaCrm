# WhatsApp e Inbox — Requisitos

## Visão geral

Conectar múltiplos números pela Evolution API, sincronizar eventos e operar tickets e mensagens em uma caixa compartilhada. **[CONFIRMADO]**

## Regras de negócio

1. Cada conexão Evolution possui identidade, segredo, estado e equipes próprios; o estado de uma instância não pode contaminar outra. **[CONFIRMADO]**
2. Webhooks são recebidos rapidamente, deduplicados e processados em fila. **[CONFIRMADO]**
3. Uma conversa sem responsável fica aguardando; assumir abre e atribui; finalizar encerra. **[CONFIRMADO]**
4. Usuários comuns veem somente conversas próprias e não atribuídas elegíveis; administradores podem ativar a visão global. **[CONFIRMADO]**
5. Mensagens, mídias, respostas, reações, edições, exclusões e recibos preservam o identificador remoto. **[CONFIRMADO]**
6. Nova mensagem do cliente em conversa encerrada inicia novo atendimento aguardando. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| WHATSAPP_INBOX-FR-001 | Criar, conectar por QR, monitorar, desconectar, trocar e excluir instâncias independentes. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| WHATSAPP_INBOX-FR-002 | Organizar conversas em aguardando, abertas e encerradas com atribuição, transferência e histórico interno. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| WHATSAPP_INBOX-FR-003 | Enviar, receber e apresentar conteúdo do WhatsApp com fidelidade, estado de entrega e interações de atendimento. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| WHATSAPP_INBOX-FR-004 | Converter eventos Evolution em estado interno idempotente sem bloquear o endpoint de webhook. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| WHATSAPP_INBOX-FR-099 | Aplicar autenticação, permissão, escopo e idempotência em toda operação sensível. **[CONFIRMADO]** | Must | Acesso indevido ou repetição não produz efeito comercial extra. **[CONFIRMADO]** |

## Requisitos não funcionais

- Trabalho externo ou demorado é executado por fila; a API e a interface não aguardam processamento pesado. **[CONFIRMADO]**
- Estado persistido no PostgreSQL é a fonte de verdade e Redis coordena jobs efêmeros. **[CONFIRMADO]**
- Eventos Socket.IO atualizam somente entidades afetadas. **[INFERIDO]**
- Falhas guardam motivo operacional sem expor segredo de provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: executar whatsapp e inbox sem duplicidade
  Dado que a operação está autorizada e possui identificador idempotente
  Quando o mesmo evento é entregue novamente
  Então o estado persistido permanece consistente
  E nenhum efeito externo é repetido indevidamente
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, casos de uso, autorização, persistência, idempotência e histórico descritos neste módulo. **[CONFIRMADO]**
- **Should:** atualizações em tempo real e diagnósticos acionáveis. **[INFERIDO]**
- **Could:** métricas operacionais adicionais por provedor. **[A VALIDAR]**
- **Won’t:** permitir que credenciais externas cheguem ao navegador. **[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/integrations/integrations.controller.ts`, `apps/api/src/integrations/integrations.service.ts`, `apps/api/src/integrations/evolution.service.ts`, `apps/worker/src/inbound.processor.ts`, `apps/web/src/pages/Inbox.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
