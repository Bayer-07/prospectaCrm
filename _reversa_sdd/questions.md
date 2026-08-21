# Perguntas para Validação — BZS One

> Gerado pelo Revisor em 2026-08-21.
> Estas decisões não bloqueiam o uso das specs atuais. Preencha quando quiser transformar as lacunas em requisitos confirmados.

---

## Pergunta 1

**Contexto:** As specs de CRM, campanhas, atendimento, chatbots, follow-ups, IA, mídia, notificações e tarefas exigem medição com o volume real, mas o código não define SLOs nem uma massa de carga oficial.
**Specs afetadas:** [`_reversa_sdd/crm-vendas/`](crm-vendas/), [`_reversa_sdd/campanhas-email/`](campanhas-email/), [`_reversa_sdd/whatsapp-inbox/`](whatsapp-inbox/), [`_reversa_sdd/chatbots/`](chatbots/), [`_reversa_sdd/follow-ups/`](follow-ups/), [`_reversa_sdd/ia-conhecimento/`](ia-conhecimento/), [`_reversa_sdd/midia-transcricao/`](midia-transcricao/), [`_reversa_sdd/tempo-real-notificacoes/`](tempo-real-notificacoes/), [`_reversa_sdd/respostas-rapidas/`](respostas-rapidas/) e [`_reversa_sdd/relatorios-webhooks/`](relatorios-webhooks/).
**Pergunta:** Quais volumes e tempos máximos de resposta devem ser usados como critério oficial de aceite por módulo?
**Impacto:** A resposta define testes de carga, planos de consulta, índices e limites para detectar regressões de desempenho.

**Resposta:** <!-- preencha aqui -->

---

## Pergunta 2

**Contexto:** Há logs e estados operacionais, mas não existe uma lista aprovada de métricas, alertas, retenção e responsáveis por incidentes.
**Specs afetadas:** [`_reversa_sdd/identidade-acesso/design.md`](identidade-acesso/design.md), [`_reversa_sdd/automacoes/requirements.md`](automacoes/requirements.md), [`_reversa_sdd/campanhas-email/requirements.md`](campanhas-email/requirements.md), [`_reversa_sdd/whatsapp-inbox/requirements.md`](whatsapp-inbox/requirements.md), [`_reversa_sdd/chatbots/requirements.md`](chatbots/requirements.md), [`_reversa_sdd/follow-ups/requirements.md`](follow-ups/requirements.md), [`_reversa_sdd/ia-conhecimento/requirements.md`](ia-conhecimento/requirements.md), [`_reversa_sdd/midia-transcricao/requirements.md`](midia-transcricao/requirements.md), [`_reversa_sdd/tempo-real-notificacoes/requirements.md`](tempo-real-notificacoes/requirements.md), [`_reversa_sdd/respostas-rapidas/requirements.md`](respostas-rapidas/requirements.md) e [`_reversa_sdd/relatorios-webhooks/requirements.md`](relatorios-webhooks/requirements.md).
**Pergunta:** Quais métricas e alertas operacionais são obrigatórios na produção e quem deve recebê-los?
**Impacto:** A resposta transforma métricas opcionais em requisitos verificáveis de observabilidade e operação.

**Resposta:** <!-- preencha aqui -->

---

## Pergunta 3

**Contexto:** Sessões e chaves de API usam cache local em partes do fluxo; a arquitetura atual é adequada a uma única réplica, mas a estratégia de invalidação distribuída ainda não foi decidida.
**Specs afetadas:** [`_reversa_sdd/identidade-acesso/chaves-api/tasks.md`](identidade-acesso/chaves-api/tasks.md), [`_reversa_sdd/identidade-acesso/login-sessoes/tasks.md`](identidade-acesso/login-sessoes/tasks.md) e [`_reversa_sdd/identidade-acesso/tasks.md`](identidade-acesso/tasks.md).
**Pergunta:** Existe intenção de executar mais de uma réplica da API? Em caso positivo, Redis deverá ser a fonte compartilhada de cache e invalidação de sessões/chaves?
**Impacto:** A resposta define se a arquitetura atual permanece ou se precisa de invalidação distribuída antes da escala horizontal.

**Resposta:** <!-- preencha aqui -->

---

## Pergunta 4

**Contexto:** O código permite convidar, redefinir senha e desativar usuários, mas não evidencia a política humana para convites válidos nem para registros pertencentes a usuários desativados.
**Specs afetadas:** [`_reversa_sdd/identidade-acesso/convites-recuperacao/tasks.md`](identidade-acesso/convites-recuperacao/tasks.md) e [`_reversa_sdd/identidade-acesso/usuarios-papeis/tasks.md`](identidade-acesso/usuarios-papeis/tasks.md).
**Pergunta:** Ao reenviar um convite ainda válido, o anterior deve ser cancelado? E, ao desativar um usuário, seus contatos, oportunidades, tarefas, conversas e follow-ups devem ser reatribuídos obrigatoriamente?
**Impacto:** A resposta define regras de ciclo de vida, auditoria e continuidade operacional.

**Resposta:** <!-- preencha aqui -->

---

## Pergunta 5

**Contexto:** MFA, SSO, encerramento remoto seletivo e uma política de senha mais forte não fazem parte do comportamento confirmado atual.
**Specs afetadas:** [`_reversa_sdd/identidade-acesso/requirements.md`](identidade-acesso/requirements.md) e [`_reversa_sdd/identidade-acesso/tasks.md`](identidade-acesso/tasks.md).
**Pergunta:** Algum desses controles deve entrar no roadmap? Se sim, qual é a ordem de prioridade e qual será a política mínima de senha?
**Impacto:** A resposta evita alterar o login por suposição e permite criar ADRs e testes de segurança com critérios claros.

**Resposta:** <!-- preencha aqui -->

---

## Pergunta 6

**Contexto:** O CRM possui enriquecimentos pontuais, mas não há provedor ou política aprovada para enriquecimento adicional de empresas e contatos.
**Spec afetada:** [`_reversa_sdd/crm-vendas/requirements.md`](crm-vendas/requirements.md).
**Pergunta:** Quais fontes externas, campos e regras de atualização podem ser usados para enriquecimento automático do CRM?
**Impacto:** A resposta define consentimento, precedência entre dados manuais e externos, custo e tratamento de conflitos.

**Resposta:** <!-- preencha aqui -->

---

## Pergunta 7

**Contexto:** API/MCP, plataforma assíncrona, interface e infraestrutura registram automações futuras como opcionais, sem escopo priorizado.
**Specs afetadas:** [`_reversa_sdd/api-externa-mcp/requirements.md`](api-externa-mcp/requirements.md), [`_reversa_sdd/plataforma-assincrona/requirements.md`](plataforma-assincrona/requirements.md), [`_reversa_sdd/interface-web/requirements.md`](interface-web/requirements.md) e [`_reversa_sdd/infraestrutura/requirements.md`](infraestrutura/requirements.md).
**Pergunta:** Quais automações operacionais adicionais, se houver, devem entrar no roadmap após a coleta de métricas reais?
**Impacto:** A resposta separa melhorias desejadas de requisitos obrigatórios e evita expansão silenciosa de escopo.

**Resposta:** <!-- preencha aqui -->
