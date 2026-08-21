# Dependências e plataforma — BZS One

> Gerado pelo Scout do Reversa em 2026-08-21 a partir dos `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, Dockerfiles e arquivos Compose.

## Gerenciamento do monorepo

| Item | Versão/configuração | Evidência |
| --- | --- | --- |
| Node.js | 24 Alpine nas imagens | `apps/*/Dockerfile` |
| pnpm | 11.9.0 | `package.json#packageManager` |
| Lockfile | formato 9.0 | `pnpm-lock.yaml` |
| TypeScript | ^5.8.0 | workspaces |
| Workspaces | `apps/*`, `packages/*` | `pnpm-workspace.yaml` |

## API (`@prospecta/api`)

| Dependência | Versão declarada | Uso observado |
| --- | --- | --- |
| NestJS | ^11.1.0 | API modular, DI, controllers, guards e WebSocket gateway |
| Prisma Client | ^6.11.0 | persistência PostgreSQL |
| BullMQ | ^5.56.0 | publicação de jobs |
| ioredis | ^5.6.0 | conexão Redis e Pub/Sub |
| Socket.IO | ^4.8.0 | atualizações em tempo real |
| jose | 6.2.4 | tokens JWT |
| argon2 | ^0.41.1 | hash de senha |
| Zod | ^4.0.0 | validação de contratos |
| AWS SDK S3 | ^3.883.0 | upload/download e URLs assinadas |
| pdf-lib | ^1.17.1 | relatórios e exportações PDF |
| csv-parse | ^5.6.0 | importação de contatos/campanhas |
| Helmet | ^8.1.0 | cabeçalhos de segurança |
| Swagger | ^11.2.0 | OpenAPI selecionada |

## Frontend (`@prospecta/web`)

| Dependência | Versão declarada | Uso observado |
| --- | --- | --- |
| React / React DOM | ^19.1.0 | SPA |
| Vite | ^7.0.0 | desenvolvimento e build |
| React Router DOM | ^7.18.2 | rotas protegidas |
| TanStack Query | ^5.81.0 | cache e sincronização da API |
| Socket.IO Client | ^4.8.0 | eventos em tempo real |
| dnd-kit | core ^6.3.1 / sortable ^10.0.0 | Kanban, calendário e reordenação |
| XYFlow React | ^12.8.0 | construtores visuais de chatbot e automação |
| Recharts | ^3.0.0 | gráficos e relatórios |
| emoji-picker-react | 4.19.1 | seletor de emojis |
| Lucide React | ^0.525.0 | iconografia |

## Worker (`@prospecta/worker`)

| Dependência | Versão declarada | Uso observado |
| --- | --- | --- |
| BullMQ | ^5.56.0 | 12 consumidores assíncronos |
| Prisma Client | ^6.11.0 | estado idempotente e histórico |
| ioredis | ^5.6.0 | filas, timers reconciliadores e Pub/Sub |
| AWS SDK S3 | ^3.883.0 | mídias e base de conhecimento |
| mailgun.js | 11.1.0 | mensagens transacionais |
| nodemailer | 9.0.1 | Gmail SMTP para campanhas |
| form-data | 4.0.6 | payloads multipart |

## Servidor MCP (`@prospecta/mcp`)

| Dependência | Versão declarada | Uso observado |
| --- | --- | --- |
| Model Context Protocol | 2.0.0 | cliente, core e servidor MCP |
| Hono | ^4.11.4 | transporte HTTP e health check |
| Zod | ^4.2.0 | schemas das ferramentas |

## Pacotes compartilhados

| Pacote | Dependências | Papel |
| --- | --- | --- |
| `@prospecta/contracts` | Zod ^4.0.0 | contratos HTTP, templates, telefones e validação de URL pública |
| `@prospecta/database` | Prisma ^6.11.0, Argon2 ^0.41.1 | client, schema, migrations, seed e setup de homologação |

## Testes

| Ferramenta | Versão | Abrangência |
| --- | --- | --- |
| Vitest | ^3.2.0 | API, worker, web, MCP e contratos |
| Supertest | ^7.1.0 | endpoints NestJS |
| TypeScript | ^5.8.0 | typecheck usado também como lint estrutural |

## Serviços de infraestrutura

| Serviço | Imagem/versão | Papel |
| --- | --- | --- |
| PostgreSQL | `postgres:17-alpine` | dados do CRM e banco isolado da Evolution |
| Redis | `redis:7.4-alpine` | filas/eventos e Redis isolado da Evolution |
| MinIO | `RELEASE.2025-07-23T15-54-02Z` | mídia do CRM e bucket isolado da Evolution |
| Evolution API | `v2.3.7` em imagem customizada | WhatsApp via QR/Baileys e previews de link |
| Speaches | `latest-cpu` configurável | API local compatível com Whisper |
| Caddy | `2.10-alpine` | proxy e publicação HTTPS |
| nginx | `1.29-alpine` | entrega do build React |

## Integrações externas e protocolos

| Dependência externa | Protocolo | Dados enviados/recebidos |
| --- | --- | --- |
| Evolution API | HTTP + webhook | instâncias, mensagens, mídias, status e QR |
| OpenAI | Responses API + File Search | contexto de conversa, gerações estruturadas e documentos RAG |
| Mailgun | HTTP API + webhook | e-mails transacionais e eventos de entrega |
| Gmail | SMTP | campanhas manuais de e-mail |
| BrasilAPI | HTTPS | consulta pública por CNPJ |
| Speaches | API compatível OpenAI | áudio para transcrição |
| S3/MinIO | S3 API | mídias, anexos, propostas e documentos |
| MCP | Streamable HTTP | leitura, criação e edição controladas via API |

## Scripts principais

| Comando | Efeito |
| --- | --- |
| `pnpm dev` | prepara pacotes e inicia API, worker, web e MCP |
| `pnpm build` | compila os seis workspaces relevantes |
| `pnpm test` | executa testes recursivamente |
| `pnpm typecheck` | valida tipos de contratos, banco e apps |
| `pnpm db:generate` | gera Prisma Client |
| `pnpm db:migrate` | executa migração de desenvolvimento |
| `pnpm db:seed` | popula dados iniciais |
| `pnpm bootstrap:admin` | cria o primeiro administrador |
| `./rebuild.sh` | atualiza e reconstrói o ambiente Docker do servidor |

## Observações de risco

- 🟢 **CONFIRMADO** — dependências críticas têm versões declaradas e o lockfile está versionado.
- 🟡 **INFERIDO** — `latest-cpu` no Speaches permite variação futura da imagem; a variável `SPEACHES_IMAGE` pode fixá-la na implantação.
- 🔴 **LACUNA** — não há automação CI/CD versionada para repetir build, testes e auditorias em cada alteração.
- 🔴 **LACUNA** — o Scout não executou auditoria de vulnerabilidades nem confirmou as versões efetivamente implantadas no servidor.
