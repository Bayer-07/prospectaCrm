# Follow-ups automáticos

> Rotas de API: `/api/v1/conversations/:conversationId/follow-ups`.
> Interface: Inbox, Atividades e Tarefas.
> Fonte de implementação: `apps/api/src/follow-ups`, `apps/worker/src/follow-up.processor.ts`, `apps/worker/src/outbound.processor.ts`.

## Intenções atendidas

- Agendar um retorno automático.
- Enviar uma ou mais mensagens depois de um horário.
- Iniciar um workflow publicado no horário.
- Entender o efeito de resolver uma conversa.
- Cancelar ou reagendar um retorno.

## Pré-condições

- O usuário precisa ter permissão de escrita em conversas e tarefas.
- A conversa precisa estar atribuída a um responsável.
- O horário deve estar no futuro.
- Só pode existir um follow-up `SCHEDULED` ou `RUNNING` por conversa.
- Para o modo workflow, o usuário também precisa poder usar workflows e deve escolher uma versão publicada.

## Agendar

1. Abra a conversa no Inbox.
2. Escolha **Agendar follow-up automático**.
3. Selecione dia e horário.
4. Escolha **Enviar mensagens** ou **Iniciar automação**.
5. Para mensagens, escreva o texto e, opcionalmente, imagem ou documento; configure atrasos das mensagens seguintes.
6. Salve.

O sistema cria uma tarefa de agenda e o registro do follow-up em uma mesma transação. A tarefa recebe o contato, título `Follow-up · <nome>` e o responsável da conversa. **[CONFIRMADO]**

## Modos

### Enviar mensagens

Cada mensagem vira uma etapa. A primeira é executada no horário agendado. A próxima só recebe seu horário depois que a anterior é enviada com sucesso; o atraso é contado a partir desse sucesso. **[CONFIRMADO]**

### Iniciar automação

No horário, o sistema cria/aciona a inscrição do contato no workflow publicado. A execução usa a versão publicada selecionada. Se o workflow estiver pausado ou arquivado, o follow-up falha com motivo. **[CONFIRMADO]**

## Regra ao resolver a conversa

Se o usuário apenas fechar/resolver a conversa:

1. o follow-up continua `SCHEDULED`;
2. no horário, o worker verifica o responsável e a conexão;
3. se a conversa estiver fechada, ela é reaberta como `OPEN` e atribuída ao responsável;
4. a mensagem é criada com o mesmo `conversationId` e enviada para o mesmo contato;
5. não é criada uma nova conversa lógica.

Portanto, **resolver a conversa não impede o envio**. Para impedir, cancele o follow-up ou conclua/cancele a tarefa vinculada antes do horário. **[CONFIRMADO]**

## Estados

| Estado | Significado |
|---|---|
| `SCHEDULED` | Agendado, ainda não iniciado. |
| `RUNNING` | Uma etapa está em execução ou aguardando a próxima. |
| `COMPLETED` | Todas as etapas foram concluídas. |
| `CANCELLED` | Cancelado manualmente, por conclusão da tarefa ou por resposta antes do início. |
| `INTERRUPTED` | O contato respondeu durante a sequência; etapas restantes foram canceladas. |
| `FAILED` | Falhou por bloqueio, responsável indisponível, workflow inválido, mídia ausente ou limite operacional. |

## Eventos que impedem o envio

- O contato responde antes do horário: follow-up e tarefa são cancelados.
- O contato responde durante a sequência: somente as etapas restantes são interrompidas e a tarefa é concluída pela resposta.
- A tarefa é concluída ou cancelada manualmente: follow-up ativo é cancelado.
- O contato está descadastrado ou suprimido no WhatsApp: falha sem envio.
- A instância está desconectada: o worker tenta novamente por até 30 minutos; depois marca falha.
- O responsável não está ativo: falha.

## Reagendar ou cancelar

- Arrastar a tarefa no calendário altera a data do follow-up, incrementa a revisão e invalida o job anterior.
- Editar o follow-up só é permitido enquanto `SCHEDULED`.
- Cancelar pelo modal interrompe etapas pendentes e mensagens ainda enfileiradas.

## Diagnóstico para o agente

Quando alguém perguntar “por que não enviou?”, verifique nesta ordem: status do follow-up, status da tarefa, resposta do contato, consentimento/supressão, telefone, status da instância, responsável, conexão e `failureReason`. Não confunda `QUEUED` com `SENT`.
