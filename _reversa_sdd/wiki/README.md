# Wiki operacional e base de conhecimento — BZS One

> Status: documentação gerada a partir do comportamento confirmado no código.
> Revisão de referência: `0dd0613`.
> Data: 2026-09-09.
> Idioma: pt-BR.

Esta pasta é a camada de documentação orientada a pessoas usuárias e agentes de IA. A especificação técnica completa continua em `_reversa_sdd/`; esta wiki organiza o que fazer, quais regras respeitar e como interpretar estados e erros.

## Como usar esta wiki

1. Comece por [`00-base-para-agente.md`](00-base-para-agente.md) quando a consulta for feita por um agente.
2. Use [`01-acesso-e-navegacao.md`](01-acesso-e-navegacao.md) para login, permissões e navegação.
3. Escolha o documento do domínio funcional:

   - [`02-dashboard-e-atividades.md`](02-dashboard-e-atividades.md) — dashboard, atividades, notas e tarefas.
   - [`03-crm.md`](03-crm.md) — empresas, contatos, oportunidades, pipeline, tags e segmentação.
   - [`04-inbox-whatsapp.md`](04-inbox-whatsapp.md) — conexões, conversas, mensagens e atendimento.
   - [`05-followups.md`](05-followups.md) — follow-ups automáticos, sequências e automações agendadas.
   - [`06-campanhas-e-email.md`](06-campanhas-e-email.md) — campanhas de WhatsApp, modelos e campanhas de e-mail.
   - [`07-chatbots-e-automacoes.md`](07-chatbots-e-automacoes.md) — chatbots, workflows e inscrições.
   - [`08-ia-e-conhecimento.md`](08-ia-e-conhecimento.md) — IA, sugestões, resumos e base de conhecimento.
   - [`09-midia-transcricao-e-respostas.md`](09-midia-transcricao-e-respostas.md) — anexos, áudio, transcrição e respostas rápidas.
   - [`10-relatorios-e-notificacoes.md`](10-relatorios-e-notificacoes.md) — indicadores, relatórios, notificações e tempo real.
   - [`11-configuracoes-integracoes-e-api.md`](11-configuracoes-integracoes-e-api.md) — usuários, equipes, conexões, API, MCP, webhooks e Swagger.
   - [`12-operacao-seguranca-e-glossario.md`](12-operacao-seguranca-e-glossario.md) — operação, segurança, limites e glossário.

## Convenções de conhecimento

- **[CONFIRMADO]**: comportamento observado diretamente no código, contratos ou configuração.
- **[INFERIDO]**: interpretação coerente da interface ou da arquitetura, mas que não deve ser tratada como regra adicional.
- **[LACUNA]**: ponto não definido pelo sistema; o agente deve pedir confirmação em vez de inventar.
- Identificadores como `conversationId`, `contactId` e `taskId` são IDs internos; não os substitua pelo nome exibido.
- Datas são armazenadas em UTC e exibidas no fuso `America/Sao_Paulo` quando a interface informa o horário.
- A API é a fronteira de autorização. Esconder um botão na interface não concede nem remove permissão.

## Índice por intenção

| Intenção do usuário | Documento principal |
|---|---|
| Entrar, recuperar senha, convidar usuário | [`01-acesso-e-navegacao.md`](01-acesso-e-navegacao.md) |
| Ver números do negócio | [`02-dashboard-e-atividades.md`](02-dashboard-e-atividades.md) |
| Criar empresa ou contato | [`03-crm.md`](03-crm.md) |
| Criar ou mover oportunidade | [`03-crm.md`](03-crm.md) |
| Atender uma conversa do WhatsApp | [`04-inbox-whatsapp.md`](04-inbox-whatsapp.md) |
| Fechar ou reabrir atendimento | [`04-inbox-whatsapp.md`](04-inbox-whatsapp.md) |
| Agendar retorno automático | [`05-followups.md`](05-followups.md) |
| Criar campanha | [`06-campanhas-e-email.md`](06-campanhas-e-email.md) |
| Criar chatbot ou automação | [`07-chatbots-e-automacoes.md`](07-chatbots-e-automacoes.md) |
| Configurar IA ou enviar documentos para RAG | [`08-ia-e-conhecimento.md`](08-ia-e-conhecimento.md) |
| Enviar arquivo ou transcrever áudio | [`09-midia-transcricao-e-respostas.md`](09-midia-transcricao-e-respostas.md) |
| Consultar relatório ou notificações | [`10-relatorios-e-notificacoes.md`](10-relatorios-e-notificacoes.md) |
| Configurar usuários, WhatsApp, API ou MCP | [`11-configuracoes-integracoes-e-api.md`](11-configuracoes-integracoes-e-api.md) |
| Investigar falha operacional | [`12-operacao-seguranca-e-glossario.md`](12-operacao-seguranca-e-glossario.md) |

## Fonte técnica

Os detalhes de implementação e a rastreabilidade estão em:

- `_reversa_sdd/inventory.md`
- `_reversa_sdd/permissions.md`
- `_reversa_sdd/state-machines.md`
- `_reversa_sdd/data-dictionary.md`
- `_reversa_sdd/<domínio>/{requirements,design,contracts}.md`
- `apps/web/src/App.tsx` para rotas da interface
- `apps/api/src/` e `apps/worker/src/` para regras de negócio e processamento assíncrono
