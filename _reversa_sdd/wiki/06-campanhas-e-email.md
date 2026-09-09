# Campanhas de WhatsApp e e-mail

> Rotas: `/campanhas` e `/email`.
> Fonte de implementação: `apps/api/src/campaigns`, `apps/api/src/email`, `apps/worker/src/campaign.processor.ts`, `gmail-campaign-client.ts` e `mailgun-client.ts`.

## Intenções atendidas

- Criar uma campanha para vários contatos.
- Selecionar audiência por busca, segmento ou importação.
- Enviar sequência de WhatsApp.
- Criar campanha de e-mail a partir de modelo.
- Pausar, retomar, cancelar e acompanhar métricas.

## Campanhas de WhatsApp

Em **Campanhas**:

1. Crie a campanha e escolha a conexão WhatsApp.
2. Selecione contatos individualmente, por busca ou por segmento.
3. Revise a audiência e o conteúdo.
4. Configure sequência, intervalo, lote, janela e aquecimento quando disponíveis.
5. Salve como rascunho, agende ou inicie conforme a permissão de `launch`.

A audiência é congelada para a execução. Antes do envio, o sistema elimina duplicados, contatos sem telefone válido, contatos suprimidos, opt-outs e destinatários sem conta WhatsApp quando a validação do provedor for executada. **[CONFIRMADO]**

## Estados de campanha

Os estados comuns são:

- `DRAFT`: rascunho;
- `SCHEDULED`: agendada;
- `RUNNING`: em execução;
- `PAUSED`: pausada;
- `COMPLETED`: concluída;
- `CANCELLED`: cancelada;
- `FAILED`: falhou.

Pausar não deve ser usado para compensar bloqueios ou desconexões. Em caso de aumento de falhas, pause e investigue a conexão, a audiência e o aquecimento. **[CONFIRMADO]**

## Respostas e descadastro

Uma resposta do contato atualiza o destinatário e pode interromper a cadência correspondente. Palavras de descadastro revogam consentimento, criam supressão de WhatsApp e interrompem execuções elegíveis. O bloqueio de campanhas não impede, por si só, mensagens individuais, follow-ups operacionais ou leitura do CRM. **[CONFIRMADO]**

## E-mail

Em **E-mail**, alterne entre **Modelos** e **Campanhas**.

### Modelo

1. Clique em **Novo modelo**.
2. Informe nome interno, assunto e conteúdo HTML.
3. Use variáveis como `{{saudacao}}`, `{{nome}}`, `{{telefone}}`, `{{email}}`, `{{empresa}}` e `{{cargo}}`.
4. Salve.

Ao usar um modelo em campanha, a campanha armazena sua própria cópia do conteúdo. Alterar ou excluir o modelo não altera campanhas já criadas. **[CONFIRMADO]**

### Campanha de e-mail

1. Use um modelo existente ou acesse a criação a partir de um contato.
2. Selecione destinatários com e-mail por busca ou seleção individual.
3. Revise assunto, conteúdo e audiência.
4. Inicie a validação e execução.

Campanhas manuais usam Gmail SMTP. E-mails transacionais do sistema, como alertas e convites, usam Mailgun. Não confunda o provedor de campanha com o provedor transacional. **[CONFIRMADO]**

## Métricas e destinatários

As métricas distinguem audiência, elegíveis, enviados, entregues, lidos, respondidos, ignorados e falhos. Um destinatário `SKIPPED`, `FAILED` ou `OPTED_OUT` não deve deixar a campanha em execução indefinidamente. **[CONFIRMADO]**

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| Campanha não inicia | Falta `launch`, provedor não configurado, audiência vazia ou conexão indisponível. |
| Muitos ignorados | Telefones inválidos, ausência de WhatsApp, duplicidade ou bloqueio de campanha. |
| E-mail não inicia | Gmail SMTP não configurado ou destinatários sem e-mail. |
| Campanha parou | Pausa manual, desconexão, limite de aquecimento ou falha de worker. |

