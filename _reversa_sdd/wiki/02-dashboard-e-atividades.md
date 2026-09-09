# Dashboard, atividades, notas e tarefas

> Rotas: `/`, `/atividades`, `/tarefas`.
> Fonte de implementação: `apps/web/src/pages/Dashboard.tsx`, `Activities.tsx`, `Tasks.tsx`, `apps/web/src/components/ActivityModal.tsx`.

## Intenções atendidas

- Ver o resumo da operação.
- Registrar uma nota ou atividade comercial.
- Associar uma atividade a empresa, contato ou oportunidade.
- Criar uma tarefa de retorno.
- Consultar, concluir, cancelar ou reagendar uma tarefa.

## Dashboard

A tela **Visão geral** apresenta, dentro do escopo de acesso do usuário:

- quantidade de oportunidades e contatos;
- tarefas em aberto e vencidas;
- distribuição das oportunidades por etapa;
- atividade comercial em períodos de 7, 30 ou 90 dias;
- foco de hoje;
- atividade recente;
- resumo do atendimento.

Os cards levam às telas de Pipeline, Contatos e Tarefas. Os números não devem ser interpretados como visão global quando o usuário possui escopo `OWN` ou `TEAM`. **[CONFIRMADO]**

## Registrar atividade

Na tela **Atividades**, clique em **Registrar atividade** e informe:

1. tipo: ligação, nota, reunião, tarefa, WhatsApp ou e-mail;
2. título e conteúdo;
3. data e, quando aplicável, duração e resultado;
4. responsável;
5. empresa, contato ou oportunidade relacionados.

Uma atividade pode ser filtrada por período, tipo, origem, status, resultado, usuário, equipe e associação. A listagem é paginada e permite carregar mais registros. **[CONFIRMADO]**

## Nota com follow-up

O fluxo comercial esperado é:

1. Abra **Atividades → Registrar atividade**.
2. Selecione o tipo **Nota**.
3. Selecione o contato ou a empresa relacionados.
4. Salve a nota.
5. Crie a tarefa de follow-up com título, prazo, prioridade e responsável.

Quando a tarefa é associada a um contato, o nome do contato deve aparecer no título/contexto da tarefa. O vínculo também permite ações de contato dentro dos detalhes da tarefa. **[CONFIRMADO na revisão `0dd0613`]**

## Tarefas

Em **Tarefas**, alterne entre visualização mensal e semanal. É possível:

- criar tarefa por **Nova tarefa** ou por uma posição do calendário;
- informar título, descrição, data, horário, prioridade e responsável;
- abrir detalhes de tarefa existente;
- concluir ou cancelar tarefa;
- arrastar uma tarefa aberta para reagendar;
- visualizar a associação com empresa, contato ou oportunidade.

Datas são enviadas para a API como ISO-8601 UTC e exibidas no fuso de São Paulo. **[CONFIRMADO]**

## Ações do contato na tarefa

Nos detalhes de uma tarefa relacionada a contato, clique no nome do contato ou na seta. O seletor oferece:

- **Ligar**: abre `tel:<telefone>` no dispositivo.
- **Mandar mensagem**: abre o fluxo de nova conversa com o contato.

Sem telefone cadastrado, **Ligar** fica desabilitado e o sistema informa que o cadastro precisa ser completado. **[CONFIRMADO]**

## Regras de conclusão

- Concluir manualmente uma tarefa com follow-up ativo cancela o follow-up pendente.
- Cancelar a tarefa também cancela o follow-up pendente.
- Reagendar uma tarefa de follow-up atualiza a data do follow-up e substitui a revisão do job agendado.
- Atividades automáticas geradas por mensagens, campanhas e follow-ups podem aparecer com origem **Automação**; elas não são editadas como notas manuais.

## Quando a atividade não aparece

Verifique: período selecionado, filtro de origem/status, escopo do usuário, associação escolhida e se a operação terminou de salvar. A atualização em tempo real invalida apenas os dados afetados, mas uma filtragem muito restritiva pode ocultar o registro. **[CONFIRMADO]**
