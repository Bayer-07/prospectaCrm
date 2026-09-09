# Chatbots e automações

> Rotas: `/chatbots` e `/automacoes`.
> Fonte de implementação: `apps/api/src/chatbots`, `apps/api/src/workflows`, `apps/worker/src/chatbot.processor.ts`, `workflow.processor.ts`.

## Intenções atendidas

- Criar ou editar um fluxo visual.
- Publicar uma versão.
- Iniciar um workflow para contato.
- Automatizar respostas de atendimento.
- Transferir a conversa para uma pessoa.
- Entender por que uma automação parou.

## Diferença entre chatbot e workflow

| Recurso | Finalidade | Entrada típica |
|---|---|---|
| Chatbot | Conversa automática com regras, perguntas, espera e transferência. | Mensagem recebida em conversa elegível. |
| Workflow | Automação de grafo para contato, com ações e espera persistida. | Início manual, follow-up ou outra automação. |

Ambos são executados pelo worker e não devem bloquear a requisição do navegador. **[CONFIRMADO]**

## Publicação e versões

1. Monte ou edite o fluxo.
2. Salve a configuração.
3. Publique uma versão.
4. Ative a automação quando a tela disponibilizar a ação.

A publicação fixa uma versão imutável para execuções iniciadas. Alterações posteriores exigem nova publicação; uma execução em curso não deve trocar de versão no meio do processo. **[CONFIRMADO]**

## Blocos comuns

Chatbots e automações podem trabalhar com:

- gatilho de mensagem;
- envio de mensagem;
- pergunta e armazenamento da resposta em variável;
- espera por tempo ou por mensagem;
- condição por contém, igual, começa com ou termina com;
- atribuição de fila;
- transferência/handoff;
- encerramento ou finalização.

Variáveis de contato e resposta devem ser tratadas como dados do fluxo, não como instruções livres para executar ações externas. **[CONFIRMADO]**

## Atendimento humano e handoff

Quando um chatbot transfere para humano:

- a sessão automática deixa de responder;
- a conversa vai para atendimento aguardando (`WAITING`) sem responsável, conforme o fluxo;
- a equipe escolhida é preservada quando aplicável.

Quando um atendente assume a conversa, gerações automáticas pendentes são canceladas. A IA ou o chatbot não deve enviar uma resposta tardia depois da assunção. **[CONFIRMADO]**

## Workflow publicado pausado ou arquivado

Uma inscrição ativa ou em espera é encerrada quando o workflow correspondente é pausado ou arquivado. Um follow-up que aponta para workflow inválido falha e registra motivo. **[CONFIRMADO]**

## Diagnóstico

Para uma execução parada, verificar: status da versão, status da inscrição/sessão, `wakeAt` da espera, conversa atribuída, conexão WhatsApp, mensagens pendentes e logs do worker. O reconciliador recupera jobs perdidos após reinício, mas não substitui a correção da configuração do fluxo. **[CONFIRMADO]**

