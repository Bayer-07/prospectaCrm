# ADR 005 — Gmail para campanhas manuais e Mailgun para e-mail transacional

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-22
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commit `6f06fe2`

## Contexto

O sistema envia dois tipos de e-mail com necessidades diferentes: campanhas comerciais criadas por operadores e notificações operacionais (convites, redefinição de senha, tarefas e alertas de follow-up).

## Decisão

- Enviar campanhas manuais por Gmail SMTP usando usuário e senha de app dedicados.
- Manter Mailgun para e-mails transacionais do sistema e seus webhooks de entrega.
- Isolar configurações e clientes no worker.
- Persistir estados/IDs do provedor e classificar erros temporários para retry.

## Consequências

### Positivas

- O remetente das campanhas pode ser a caixa comercial desejada.
- Falha/limite de campanha não muda o canal de convites e alertas.
- Templates transacionais permanecem centralizados e rastreáveis.

### Negativas

- Dois provedores, credenciais e procedimentos de diagnóstico.
- Gmail possui limites e políticas menos apropriados para alto volume.
- Métricas de campanha e de sistema não vêm da mesma fonte.

## Alternativas consideradas

- Tudo pelo Mailgun: rejeitado pela necessidade de campanha manual sair por outra conta.
- Tudo pelo Gmail: inadequado para transacionais, webhooks e retries estruturados.
- Provedor configurável por campanha: flexível, porém fora da necessidade e complexidade atuais.

## Evidências atuais

`apps/worker/src/gmail-campaign-client.ts`, `apps/worker/src/mailgun-client.ts`, `apps/worker/src/campaign.processor.ts`, `apps/worker/src/user-invite.processor.ts`, `apps/worker/src/task-digest.processor.ts`.
