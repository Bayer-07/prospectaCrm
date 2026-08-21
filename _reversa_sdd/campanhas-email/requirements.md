# Campanhas de WhatsApp e e-mail — Requisitos

## Visão geral

Preparar audiências e executar campanhas manuais por WhatsApp ou Gmail, mantendo o Mailgun para mensagens transacionais. **[CONFIRMADO]**

## Regras de negócio

1. Campanhas podem usar contatos salvos ou linhas importadas por CSV com conteúdo personalizado. **[CONFIRMADO]**
2. Contatos bloqueados para campanhas são excluídos tanto do WhatsApp quanto do e-mail. **[CONFIRMADO]**
3. Antes do WhatsApp, o número é validado e destinatários sem conta são ignorados como concluídos. **[CONFIRMADO]**
4. Mensagens e contatos respeitam atrasos, lotes, janelas e limite de aquecimento configurados. **[CONFIRMADO]**
5. Campanhas manuais de e-mail usam Gmail SMTP; e-mails transacionais permanecem no Mailgun. **[CONFIRMADO]**
6. Respostas e opt-out interrompem etapas futuras aplicáveis e atualizam métricas. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CAMPANHAS_EMAIL-FR-001 | Selecionar contatos por busca ou importar CSV, validar destinatários e congelar a audiência da campanha. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CAMPANHAS_EMAIL-FR-002 | Enviar sequências por uma conexão escolhida com controle de ritmo, aquecimento, pausa e conclusão idempotente. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CAMPANHAS_EMAIL-FR-003 | Enviar campanhas manuais pelo Gmail SMTP com conteúdo e audiência selecionados. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CAMPANHAS_EMAIL-FR-004 | Controlar rascunho, agendamento, execução, pausa, retomada, cancelamento, falha e conclusão sem duplicar envios. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CAMPANHAS_EMAIL-FR-099 | Aplicar autenticação, permissão, escopo e idempotência em toda operação sensível. **[CONFIRMADO]** | Must | Acesso indevido ou repetição não produz efeito comercial extra. **[CONFIRMADO]** |

## Requisitos não funcionais

- Trabalho externo ou demorado é executado por fila; a API e a interface não aguardam processamento pesado. **[CONFIRMADO]**
- Estado persistido no PostgreSQL é a fonte de verdade e Redis coordena jobs efêmeros. **[CONFIRMADO]**
- Eventos Socket.IO atualizam somente entidades afetadas. **[INFERIDO]**
- Falhas guardam motivo operacional sem expor segredo de provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: executar campanhas de whatsapp e e-mail sem duplicidade
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

`apps/api/src/campaigns/campaigns.controller.ts`, `apps/api/src/campaigns/campaigns.service.ts`, `apps/worker/src/campaign.processor.ts`, `apps/worker/src/gmail-campaign-client.ts`, `apps/web/src/pages/Campaigns.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
