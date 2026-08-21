# Inventário técnico — BZS One

> Gerado pelo Scout do Reversa em 2026-08-21.  
> Escopo: arquivos versionados do repositório. Foram excluídos `.git`, `node_modules`, artefatos de build, logs locais, `.env`, `.agents`, `.reversa` e a própria saída `_reversa_sdd`.

## Resumo executivo

- 🟢 **CONFIRMADO** — monorepo TypeScript administrado com pnpm workspaces.
- 🟢 **CONFIRMADO** — quatro executáveis: API NestJS, frontend React/Vite, worker BullMQ e servidor MCP.
- 🟢 **CONFIRMADO** — dois pacotes compartilhados: contratos Zod/TypeScript e acesso ao banco Prisma.
- 🟢 **CONFIRMADO** — PostgreSQL é a fonte principal de dados; Redis sustenta filas e eventos; MinIO/S3 armazena arquivos.
- 🟢 **CONFIRMADO** — o sistema integra WhatsApp/Evolution API, Mailgun, Gmail SMTP, OpenAI, Speaches, BrasilAPI e armazenamento compatível com S3.
- 🟢 **CONFIRMADO** — não existe configuração de CI/CD versionada (`.github/workflows`, GitLab CI ou Jenkins).

## Dimensão do repositório

| Indicador | Quantidade |
| --- | ---: |
| Arquivos versionados analisados | 338 |
| TypeScript (`.ts` + `.tsx`) | 245 |
| Migrações SQL | 35 |
| JSON | 19 |
| Markdown | 8 |
| CSS | 4 |
| YAML | 4 |
| Arquivos de teste | 78 |
| Models Prisma | 63 |
| Enums Prisma | 25 |
| Serviços no Compose | 14 |

## Estrutura principal

```text
.
├── apps/
│   ├── api/                 API REST, autenticação, regras e integrações
│   ├── mcp/                 servidor MCP remoto sobre a API REST
│   ├── web/                 SPA React/Vite em pt-BR
│   └── worker/              processamento assíncrono e reconciliação
├── packages/
│   ├── contracts/           contratos, schemas Zod e utilitários comuns
│   └── database/            Prisma Client, schema, seed e migrações
├── infra/
│   ├── Caddyfile            proxy reverso e publicação
│   └── evolution/           imagem e patches da Evolution API
├── docs/OPERACAO.md              operação e implantação
├── scripts/backup.sh             backup operacional
├── animation-plans/              planos de movimento da interface
├── docker-compose.yml            topologia de produção
├── docker-compose.dev.yml        portas locais de desenvolvimento
├── rebuild.sh                    atualização segura no servidor
└── package.json                  comandos do workspace
```

## Executáveis e pontos de entrada

| Executável | Entrada | Responsabilidade |
| --- | --- | --- |
| API | `apps/api/src/main.ts` | Inicializa NestJS, segurança HTTP, CORS, cookies, validação, prefixo `/api/v1`, Swagger e Socket.IO. |
| Web | `apps/web/src/main.tsx` e `apps/web/src/App.tsx` | Inicializa a SPA, autenticação, lazy loading e rotas protegidas. |
| Worker | `apps/worker/src/main.ts` | Consome filas, executa campanhas, mensagens, chatbots, automações, follow-ups, IA, RAG, e-mails e transcrições. |
| MCP | `apps/mcp/src/main.ts` e `apps/mcp/src/server.ts` | Publica ferramentas MCP via Streamable HTTP e encaminha operações para a API autenticada. |
| Banco | `packages/database/src/index.ts` | Fornece singleton do Prisma Client e reexporta os tipos gerados. |

## Módulos funcionais identificados

| Módulo | Evidências principais | Escopo observado |
| --- | --- | --- |
| Identidade e acesso | `apps/api/src/auth`, `apps/api/src/users` | Login JWT/cookies, sessão, convites, recuperação, papéis, permissões e escopo de dados. |
| CRM comercial | `apps/api/src/crm`, `apps/web/src/pages/Companies.tsx`, `Contacts.tsx`, `Pipeline.tsx`, `Tasks.tsx` | Empresas, contatos, oportunidades, pipeline, tarefas, notas, atividades, tags, campos e segmentos. |
| WhatsApp e Inbox | `apps/api/src/integrations`, `apps/web/src/pages/Inbox.tsx`, `apps/worker/src/inbound.processor.ts`, `outbound.processor.ts` | Instâncias Evolution, webhooks, conversas, tickets, mensagens, mídias e atendimento. |
| Campanhas | `apps/api/src/campaigns`, `apps/worker/src/campaign.processor.ts` | Campanhas de WhatsApp e e-mail, destinatários, sequências, validação e métricas. |
| E-mail | `apps/api/src/email`, `apps/worker/src/mailgun-client.ts`, `gmail-campaign-client.ts` | Mailgun transacional, webhooks de entrega e Gmail SMTP para campanhas manuais. |
| Chatbots | `apps/api/src/chatbots`, `apps/worker/src/chatbot.processor.ts` | Fluxos visuais versionados por regras ou IA, sessões, ciclos e espera. |
| Automações | `apps/api/src/workflows`, `apps/worker/src/workflow.processor.ts` | Workflows publicados, inscrições e execução de grafo. |
| Follow-ups | `apps/api/src/follow-ups`, `apps/worker/src/follow-up.processor.ts` | Agendamento persistente, tarefa vinculada, mensagens sequenciais e automação. |
| IA e conhecimento | `apps/api/src/ai`, `apps/worker/src/ai.processor.ts`, `ai-knowledge.processor.ts` | Resumos, sugestões, pré-atendimento OpenAI e base RAG por organização. |
| Mídia e transcrição | `apps/api/src/media`, `apps/api/src/integrations/transcriptions.service.ts`, `apps/worker/src/audio-transcription.processor.ts` | Upload seguro, URLs assinadas e transcrição de áudio. |
| Relatórios e webhooks | `apps/api/src/reports` | Indicadores, PDFs, webhooks de saída assinados e proteção contra SSRF. |
| Respostas rápidas | `apps/api/src/quick-replies`, `apps/web/src/pages/QuickReplies.tsx` | Cadastro e inserção de textos/anexos no composer. |
| Tempo real e notificações | `apps/api/src/realtime`, publicações em `apps/worker/src/main.ts` | Socket.IO, Pub/Sub Redis e atualizações dirigidas por organização. |
| API externa e MCP | `apps/api/src/swagger`, `apps/api/src/mcp`, `apps/mcp/src` | OpenAPI selecionada, chaves com escopo e ferramentas MCP sem acesso direto ao banco. |
| Interface web | `apps/web/src/pages`, `components`, `lib` | SPA responsiva, tema claro/escuro, Kanban, calendário, construtores visuais e Inbox. |
| Plataforma assíncrona | `apps/api/src/queue`, `apps/worker/src/main.ts` | BullMQ/Redis, 12 consumidores, retries, jobs atrasados e reconciliadores. |
| Infraestrutura | `docker-compose.yml`, `infra`, `rebuild.sh`, `scripts/backup.sh` | Containers, proxy, bancos isolados, Evolution customizada, transcrição e operação Ubuntu. |

## Rotas principais da interface

🟢 **CONFIRMADO** em `apps/web/src/App.tsx`: autenticação, dashboard, pipeline, empresas, contatos, tarefas, Inbox, respostas rápidas, campanhas, chatbots, automações, relatórios, e-mail, conexões, configurações e integrações. As páginas de negócio são carregadas sob demanda com `React.lazy`.

## API e processamento assíncrono

- 🟢 **CONFIRMADO** — prefixo REST interno `/api/v1`; health, webhooks da Evolution e Mailgun ficam fora do prefixo.
- 🟢 **CONFIRMADO** — documentação Swagger filtrada em `/docs`.
- 🟢 **CONFIRMADO** — guard de autenticação e interceptor de idempotência globais.
- 🟢 **CONFIRMADO** — filas observadas: entrada e saída de mensagens, campanhas, automações, chatbots, webhooks externos, resumos de tarefas, e-mails transacionais, transcrições, follow-ups, gerações de IA e base de conhecimento.
- 🟢 **CONFIRMADO** — o worker publica eventos de Inbox, tarefas e IA no Redis para propagação em tempo real.

## Banco de dados — visão superficial

- ORM: Prisma 6.11.
- Banco: PostgreSQL 17 no Compose.
- Schema: `packages/database/prisma/schema.prisma`.
- Histórico: 35 diretórios de migração, de `20260717150000_initial` a `20260820150000_ai_knowledge_base`.
- Dimensão: 63 models e 25 enums.
- Domínios persistidos incluem organização, usuários, CRM, conversas, campanhas, workflows, chatbots, follow-ups, IA/RAG, notificações, integrações, idempotência e auditoria.

> A estrutura relacional detalhada fica reservada ao agente Data Master.

## Integrações detectadas

| Integração | Finalidade | Evidência |
| --- | --- | --- |
| Evolution API | WhatsApp multi-instância e webhooks | `apps/api/src/integrations/evolution.service.ts` |
| MinIO / S3 | Mídias, propostas, anexos e documentos RAG | `apps/api/src/media`, `apps/worker/src/storage.ts` |
| OpenAI Responses/File Search | Resumos, sugestões, chatbot e RAG | `apps/worker/src/openai-client.ts`, `openai-knowledge-client.ts` |
| Mailgun | E-mails transacionais e eventos de entrega | `apps/api/src/email`, `apps/worker/src/mailgun-client.ts` |
| Gmail SMTP | Campanhas de e-mail manuais | `apps/worker/src/gmail-campaign-client.ts` |
| Speaches/faster-whisper | Transcrição local de áudio | `apps/worker/src/transcription-client.ts`, Compose |
| BrasilAPI | Consulta de CNPJ | `apps/api/src/crm/company-cnpj-lookup.service.ts` |
| MCP | Acesso controlado por clientes LLM | `apps/mcp/src` |

## Infraestrutura de containers

🟢 **CONFIRMADO** — serviços `caddy`, `web`, `api`, `mcp`, `worker`, `transcription`, `postgres`, `redis`, `minio`, `evolution-volume-init`, `evolution`, `evolution-minio`, `evolution-postgres` e `evolution-redis`.

🟢 **CONFIRMADO** — imagens principais: Node 24 Alpine, nginx 1.29 Alpine, Caddy 2.10 Alpine, PostgreSQL 17 Alpine, Redis 7.4 Alpine, MinIO com release fixada e Evolution API 2.3.7 customizada.

## Testes e qualidade

- Framework: Vitest 3.2 em todos os workspaces que possuem testes.
- 78 arquivos `*.test.ts`/`*.test.tsx` versionados.
- Cobertura funcional observada em autenticação, CRM, campanhas, chatbots, integrações, follow-ups, IA/RAG, worker, frontend, contratos e segurança HTTP.
- Typecheck/lint são executados pelo TypeScript; SonarCloud possui configuração em `.sonarcloud.properties`.
- 🟡 **INFERIDO** — a abrangência é relevante, mas este inventário não calculou cobertura por linhas ou branches.

## Configuração e entrega

- `.env.example` documenta as variáveis; `.env` local não foi lido nem incluído nesta análise.
- `docker-compose.dev.yml` publica somente portas locais de desenvolvimento para PostgreSQL, Redis, MinIO e Evolution.
- `rebuild.sh` é o fluxo de atualização documentado para Ubuntu.
- `scripts/backup.sh` cobre a rotina de backup operacional.
- 🔴 **LACUNA** — não existe pipeline de CI/CD versionado; build, teste, análise e deploy dependem de execução externa/manual.

## Sugestão do Scout

Organizar as futuras especificações de forma **híbrida**, porque o projeto combina módulos de domínio bem definidos, controladores REST, processadores assíncronos e páginas orientadas a casos de uso. A decisão final será registrada no checkpoint de organização do Reversa.
