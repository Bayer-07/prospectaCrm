# Inbox e atendimento pelo WhatsApp

> Rotas: `/inbox`, `/conexoes`.
> Fonte de implementação: `apps/web/src/pages/Inbox.tsx`, `apps/api/src/integrations`, `apps/worker/src/inbound.processor.ts`, `outbound.processor.ts`.

## Intenções atendidas

- Conectar ou desconectar um número.
- Encontrar uma conversa.
- Assumir, transferir, resolver ou reabrir atendimento.
- Enviar texto, áudio, imagem, documento, reação ou resposta.
- Consultar contato, empresa, atividades e tarefas dentro do atendimento.

## Conectar um número

1. Abra **Conexões → Números do WhatsApp**.
2. Clique em **Adicionar número**.
3. Informe nome da caixa, identificador da instância e equipe principal.
4. Crie e conecte.
5. Escaneie o QR Code em **WhatsApp → Aparelhos conectados → Conectar um aparelho**.

O QR Code expira aproximadamente em 30 segundos. Desconectar preserva o histórico; excluir remove a sessão da Evolution, mas não apaga as conversas já registradas no CRM. **[CONFIRMADO]**

## Filas e estados de conversa

| Estado | Uso |
|---|---|
| `WAITING` / Aguardando | Conversa sem responsável aguardando atendimento. |
| `OPEN` / Aberta | Atendimento assumido por um usuário. |
| `CLOSED` / Encerrada | Atendimento resolvido/fechado. |

Assumir uma conversa abre e atribui o atendimento. Transferir troca responsável/equipe conforme a permissão. Resolver fecha a conversa. Uma nova mensagem recebida em uma conversa encerrada pode iniciar um novo atendimento aguardando. **[CONFIRMADO]**

## Atender uma conversa

1. Selecione uma conversa na caixa **Aguardando**, **Abertas** ou **Encerradas**.
2. Assuma o atendimento quando necessário.
3. Use o composer para escrever e enviar.
4. Adicione mídia ou use respostas rápidas quando necessário.
5. Resolva quando o trabalho estiver terminado.

Usuários comuns visualizam conversas próprias e não atribuídas elegíveis. Administradores podem ter visão global. Toda ação também passa por organização, permissão e escopo na API. **[CONFIRMADO]**

## Mensagens e estados de entrega

O sistema diferencia:

- `QUEUED`: mensagem criada e aguardando worker;
- `SENT`: aceita pelo provedor;
- `DELIVERED`: entregue;
- `READ`: lida;
- `REPLIED`: relacionada a uma resposta;
- `FAILED`: falhou após tentativas;
- `SKIPPED`: não foi enviada porque a regra impediu.

Colocar uma mensagem na fila não significa que ela já chegou ao WhatsApp. A origem, o ID remoto, a mídia, respostas e recibos ficam preservados no histórico. **[CONFIRMADO]**

## Ações de contato dentro do atendimento

O cabeçalho e o drawer do contato podem oferecer telefone, e-mail, empresa, oportunidades, atividades e início de conversa. `tel:` é usado para ligar quando há telefone. Uma nova conversa manual deve usar o contato selecionado e a instância disponível. **[CONFIRMADO]**

## Fechar, reabrir e follow-up

Fechar a conversa não cancela automaticamente um follow-up agendado. Quando o follow-up chegar ao horário, ele reabre a mesma conversa e envia nela. Para cancelar o disparo, conclua/cancele a tarefa vinculada ou cancele o follow-up pela ação própria. Veja [`05-followups.md`](05-followups.md). **[CONFIRMADO]**

## Entrada de mensagens e automações

Eventos da Evolution chegam por webhook, são deduplicados e processados em fila. Uma mensagem recebida pode:

- atualizar a conversa e notificações;
- interromper campanha, follow-up ou workflow ativo;
- iniciar chatbot quando o atendimento estiver elegível;
- revogar consentimento quando for uma palavra de descadastro.

O endpoint de webhook não deve ser tratado como confirmação de processamento final; o resultado aparece após o worker persistir o evento. **[CONFIRMADO]**

## Problemas comuns

| Sintoma | Verificações |
|---|---|
| Não consigo enviar | Conversa aberta, usuário atribuído, telefone válido e conexão `CONNECTED`. |
| Conversa não aparece | Fila, filtros, escopo de equipe/usuário e status. |
| Mensagem ficou pendente | Estado da instância, fila de saída e tentativas do worker. |
| QR não conecta | QR expirado, número limitado pelo WhatsApp ou Evolution indisponível. |
| Atendimento voltou para aberto | Follow-up automático agendado executou e reabriu o ticket. |
