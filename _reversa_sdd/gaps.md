# Lacunas identificadas — BZS One

> Revisão concluída em 2026-08-21. As 39 marcações **[A VALIDAR]** foram preservadas porque dependem de decisão de produto, dados reais de produção ou política operacional. Nenhuma delas contradiz o comportamento reconstruído.

## Resumo

| Grupo | Ocorrências | Risco atual | Encaminhamento |
|---|---:|---|---|
| Metas de desempenho e testes com volume real | 15 | Médio | Responder à Pergunta 1 e executar medições |
| Métricas e alertas operacionais | 12 | Médio | Responder à Pergunta 2 |
| Escala horizontal e invalidação de cache | 2 | Médio antes de múltiplas réplicas | Responder à Pergunta 3 |
| Ciclo de vida de usuários e convites | 2 | Médio | Responder à Pergunta 4 |
| Roadmap de segurança de identidade | 3 | Médio | Responder à Pergunta 5 |
| Enriquecimento externo do CRM | 1 | Baixo | Responder à Pergunta 6 |
| Automações opcionais de roadmap | 4 | Baixo | Responder à Pergunta 7 |

## 1. Desempenho e carga

Faltam SLOs e resultados medidos com a massa oficial de produção. As marcações estão em tarefas de [`campanhas-email`](campanhas-email/tasks.md), [`automacoes`](automacoes/tasks.md), [`crm-vendas/tarefas-agenda`](crm-vendas/tarefas-agenda/tasks.md), [`crm-vendas/pipeline-oportunidades`](crm-vendas/pipeline-oportunidades/tasks.md), [`crm-vendas/importacao-segmentacao`](crm-vendas/importacao-segmentacao/tasks.md), [`crm-vendas/empresas-contatos`](crm-vendas/empresas-contatos/tasks.md), [`whatsapp-inbox`](whatsapp-inbox/tasks.md), [`chatbots`](chatbots/tasks.md), [`relatorios-webhooks`](relatorios-webhooks/tasks.md), [`follow-ups`](follow-ups/tasks.md), [`tempo-real-notificacoes`](tempo-real-notificacoes/tasks.md), [`midia-transcricao`](midia-transcricao/tasks.md), [`respostas-rapidas`](respostas-rapidas/tasks.md), [`ia-conhecimento`](ia-conhecimento/tasks.md) e [`identidade-acesso/login-sessoes`](identidade-acesso/login-sessoes/tasks.md).

## 2. Observabilidade

Métricas adicionais são opcionais ou não possuem limiar documentado em [`campanhas-email`](campanhas-email/requirements.md), [`automacoes`](automacoes/requirements.md), [`whatsapp-inbox`](whatsapp-inbox/requirements.md), [`relatorios-webhooks`](relatorios-webhooks/requirements.md), [`chatbots`](chatbots/requirements.md), [`follow-ups`](follow-ups/requirements.md), [`tempo-real-notificacoes`](tempo-real-notificacoes/requirements.md), [`midia-transcricao`](midia-transcricao/requirements.md), [`respostas-rapidas`](respostas-rapidas/requirements.md), [`ia-conhecimento`](ia-conhecimento/requirements.md), [`identidade-acesso/design.md`](identidade-acesso/design.md) e [`identidade-acesso/login-sessoes/design.md`](identidade-acesso/login-sessoes/design.md).

## 3. Identidade e escala

- Invalidação distribuída de chaves antes de escalar horizontalmente: [`identidade-acesso/chaves-api/tasks.md`](identidade-acesso/chaves-api/tasks.md).
- Medição e eventual adoção de Redis para cache de autenticação: [`identidade-acesso/tasks.md`](identidade-acesso/tasks.md).
- Reenvio/cancelamento de convites válidos: [`identidade-acesso/convites-recuperacao/tasks.md`](identidade-acesso/convites-recuperacao/tasks.md).
- Reatribuição ao desativar usuário: [`identidade-acesso/usuarios-papeis/tasks.md`](identidade-acesso/usuarios-papeis/tasks.md).
- MFA e encerramento seletivo de sessões: [`identidade-acesso/requirements.md`](identidade-acesso/requirements.md).
- Priorização de MFA/SSO e política de senha: duas marcações em [`identidade-acesso/tasks.md`](identidade-acesso/tasks.md).

## 4. Produto e roadmap

- Fonte e política de enriquecimento adicional do CRM: [`crm-vendas/requirements.md`](crm-vendas/requirements.md).
- Automações operacionais futuras em [`api-externa-mcp`](api-externa-mcp/requirements.md), [`plataforma-assincrona`](plataforma-assincrona/requirements.md), [`interface-web`](interface-web/requirements.md) e [`infraestrutura`](infraestrutura/requirements.md).

## Critério de encerramento

Cada lacuna é encerrada quando a resposta correspondente for incorporada à spec e sua marcação for reclassificada para **[CONFIRMADO]** ou **[INFERIDO]**, acompanhada de teste, ADR ou evidência operacional quando aplicável.
