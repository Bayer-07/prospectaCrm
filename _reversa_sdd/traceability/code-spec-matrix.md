# Matriz de rastreabilidade código → especificação

## Objetivo

Relacionar cada fronteira principal do código legado às especificações reconstruídas, permitindo localizar requisitos, design e tarefas antes de alterar um módulo. **[INFERIDO]**

## Módulos

| Código legado | Especificação canônica | Casos de uso cobertos | Testes/evidência | Confiança |
|---|---|---|---|---|
| `apps/api/src/auth/**`, `apps/api/src/users/**`, `apps/web/src/auth/**` | `_reversa_sdd/identidade-acesso/` | login, sessões, usuários, papéis, convites, recuperação, chaves | `apps/api/src/auth/*.test.ts`, `apps/api/src/users/*.test.ts` | **[CONFIRMADO]** |
| `apps/api/src/crm/**`, páginas `Companies`, `Contacts`, `Pipeline`, `Tasks` | `_reversa_sdd/crm-vendas/` | empresas/contatos, oportunidades, tarefas, importação/segmentos | `apps/api/src/crm/*.test.ts`, testes web correspondentes | **[CONFIRMADO]** |
| `apps/api/src/integrations/**`, `apps/worker/src/inbound.processor.ts`, `Inbox.tsx` | `_reversa_sdd/whatsapp-inbox/` | conexões, tickets, mensagens/mídias, webhooks | testes Evolution, inbound e Inbox | **[CONFIRMADO]** |
| `apps/api/src/campaigns/**`, processors de campanha/e-mail | `_reversa_sdd/campanhas-email/` | audiência, WhatsApp, e-mail, ciclo | `campaign.processor.test.ts`, testes de campaigns | **[CONFIRMADO]** |
| `apps/api/src/chatbots/**`, `apps/worker/src/chatbot.processor.ts`, builder | `_reversa_sdd/chatbots/` | modelagem, regras, espera/handoff/IA | testes de chatbots e processor | **[CONFIRMADO]** |
| `apps/api/src/workflows/**`, `apps/worker/src/workflow.processor.ts`, builder | `_reversa_sdd/automacoes/` | modelagem, inscrição, execução de ações | testes de workflows e processor | **[CONFIRMADO]** |
| `apps/api/src/follow-ups/**`, `apps/worker/src/follow-up*`, modal | `_reversa_sdd/follow-ups/` | agendamento, sequência, interrupção/recuperação | testes follow-up API/worker/web | **[CONFIRMADO]** |
| `apps/api/src/ai/**`, `apps/worker/src/ai-*`, `openai-client.ts` | `_reversa_sdd/ia-conhecimento/` | configuração, resumo/sugestão, pré-atendimento, RAG | testes AI service/generation/knowledge | **[CONFIRMADO]** |
| `apps/api/src/media/**`, `storage.ts`, `transcription.processor.ts` | `_reversa_sdd/midia-transcricao/` | upload, mídia WhatsApp, transcrição, retenção | testes media/storage/transcription | **[CONFIRMADO]** |
| `apps/api/src/reports/**`, `conversation-pdf.ts`, webhook processor | `_reversa_sdd/relatorios-webhooks/` | relatórios/PDF, configuração e entrega webhook | testes reports, PDF, public-http-get | **[CONFIRMADO]** |
| `apps/api/src/quick-replies/**`, páginas QuickReplies/Inbox | `_reversa_sdd/respostas-rapidas/` | catálogo e composer | testes quick replies e Inbox | **[CONFIRMADO]** |
| gateway realtime, notifications e providers web | `_reversa_sdd/tempo-real-notificacoes/` | socket, notificações, invalidação/som | testes gateway/service/providers quando existentes | **[CONFIRMADO]** |
| guard/idempotency/swagger, `apps/api/src/mcp/**`, `apps/mcp/**` | `_reversa_sdd/api-externa-mcp/` | chaves, REST/Swagger e servidor MCP | testes auth guard, OpenAPI e MCP | **[CONFIRMADO]** |
| `apps/web/src/**`, CSS e componentes compartilhados | `_reversa_sdd/interface-web/` | autenticação/navegação, busca/feedback, interações, tema/movimento | 18 arquivos/68 testes no checkpoint Sonar anterior | **[CONFIRMADO]** |
| `apps/worker/src/main.ts`, queues/processors/reconcilers | `_reversa_sdd/plataforma-assincrona/` | filas, manutenção/reconciliação, shutdown | testes dos processors e filas | **[CONFIRMADO]** |
| Compose, Dockerfiles, proxies, scripts e README | `_reversa_sdd/infraestrutura/` | topologia, redes, deploy, backup | `docker compose config`, healthchecks e smoke tests | **[CONFIRMADO]** |

## Entidades e persistência

- Os 63 modelos Prisma estão enumerados no ERD completo e detalhados no dicionário de dados. **[CONFIRMADO]**
- A relação de modelos, índices, retenção e módulos está em `_reversa_sdd/erd-complete.md` e `_reversa_sdd/data-dictionary.md`. **[CONFIRMADO]**
- Mudanças de schema devem atualizar a especificação do módulo, o ERD, o dicionário e a matriz de impacto antes da migração. **[INFERIDO]**

## Contratos e integrações

| Fronteira | Especificação | Fonte | Confiança |
|---|---|---|---|
| API pública CRM | `_reversa_sdd/openapi/bzs-one.yaml` | controllers + filtro `public-api-document.ts` | **[CONFIRMADO]** |
| Evolution API | `_reversa_sdd/whatsapp-inbox/contracts.md` | `evolution.service.ts` e webhooks | **[CONFIRMADO]** |
| Mailgun/Gmail | `_reversa_sdd/campanhas-email/contracts.md` | módulos/worker de e-mail | **[CONFIRMADO]** |
| OpenAI/RAG | `_reversa_sdd/ia-conhecimento/contracts.md` | API/worker de IA | **[CONFIRMADO]** |
| MinIO/S3 e Speaches | `_reversa_sdd/midia-transcricao/contracts.md` | media/storage/transcription | **[CONFIRMADO]** |
| Webhooks de saída | `_reversa_sdd/relatorios-webhooks/contracts.md` | reports + external webhook worker | **[CONFIRMADO]** |
| Socket.IO | `_reversa_sdd/tempo-real-notificacoes/contracts.md` | gateway e provider web | **[CONFIRMADO]** |
| MCP | `_reversa_sdd/api-externa-mcp/contracts.md` | API MCP + servidor MCP | **[CONFIRMADO]** |

## Regra de manutenção

1. Localizar nesta matriz o módulo tocado pelo código. **[INFERIDO]**
2. Atualizar primeiro requisitos/design/contratos afetados e registrar incerteza como **[A VALIDAR]**. **[INFERIDO]**
3. Implementar e validar pelas tarefas do caso de uso. **[INFERIDO]**
4. Atualizar ERD/OpenAPI/ADR quando a alteração atravessar uma dessas fronteiras. **[INFERIDO]**
5. Não considerar concluído sem teste ou evidência explicitamente ligada ao requisito. **[INFERIDO]**
