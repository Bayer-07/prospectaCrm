# ADR 001 — Monorepo TypeScript auto-hospedado

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-17
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commit `81d91ff`

## Contexto

O produto precisava combinar interface web, API autenticada, processamento assíncrono, contratos compartilhados, persistência relacional e implantação em VPS/local. A operação inicial é de uma única empresa, com integrações que precisam ficar próximas da rede e dos dados.

## Decisão

Adotar monorepo pnpm totalmente em TypeScript:

- `apps/web`: React/Vite;
- `apps/api`: NestJS;
- `apps/worker`: processadores BullMQ;
- `apps/mcp`: adaptador Model Context Protocol;
- `packages/contracts`: schemas e contratos compartilhados;
- `packages/database`: Prisma/PostgreSQL;
- Docker Compose como unidade operacional auto-hospedada.

## Motivos reconstruídos

- Compartilhar tipos e validações entre frontend, API e worker.
- Separar processos de requisição dos trabalhos demorados.
- Manter controle local de WhatsApp, mídia e dados comerciais.
- Permitir implantação inicial em uma única máquina e separação futura por serviço.

## Consequências

### Positivas

- Uma linguagem, um gerenciador e contratos reutilizados.
- Fronteiras de processo claras sem exigir microserviços independentes.
- Desenvolvimento e implantação reproduzíveis pelo Compose.

### Negativas

- Mudanças compartilhadas podem exigir rebuild coordenado de vários serviços.
- O Compose concentra falhas de recursos em uma mesma máquina.
- A ausência de CI/CD versionado aumenta dependência dos scripts locais e validação manual.

## Alternativas consideradas

- Aplicação monolítica com jobs no processo da API: rejeitada implicitamente por risco de bloquear atendimento.
- SaaS/serviços gerenciados: incompatível com a premissa auto-hospedada e controle da Evolution.
- Repositórios separados: aumentaria deriva de contratos e custo operacional para a equipe pequena.

## Evidências atuais

`pnpm-workspace.yaml`, `apps/*`, `packages/*`, `docker-compose.yml`, `Dockerfile` e scripts de rebuild.
