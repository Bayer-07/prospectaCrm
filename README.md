# Prospecta CRM

Plataforma interna de prospecção, CRM, atendimento, automações e campanhas de WhatsApp.

## Endereços no desenvolvimento

| Serviço | Endereço |
| --- | --- |
| Aplicação web | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| Saúde da API | http://localhost:3000/health |
| OpenAPI | http://localhost:3000/docs |
| Evolution API | http://localhost:8082 |
| MinIO | http://localhost:9001 |

## Pré-requisitos

- Node.js 22 ou mais recente;
- pnpm 11;
- Docker Desktop com Docker Compose;
- portas `3000`, `5173`, `5433`, `6380`, `8082`, `9000` e `9001` livres.

Os comandos abaixo devem ser executados no PowerShell, na raiz deste repositório.

## Primeira instalação

1. Instale as dependências:

   ```powershell
   pnpm install
   ```

2. Crie o arquivo local de configuração:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Abra o `.env` e substitua todos os valores iniciados por `troque-`. Mantenha, no desenvolvimento local, os endereços e portas já definidos no exemplo.

4. Suba os bancos, filas, armazenamento e Evolution API:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio evolution-postgres evolution-redis evolution-minio evolution
   ```

5. Prepare o banco do CRM:

   ```powershell
   pnpm db:generate
   pnpm --filter @prospecta/database db:deploy
   pnpm db:seed
   ```

6. Crie o primeiro administrador. As variáveis abaixo valem apenas para esta janela do PowerShell:

   ```powershell
   $env:ADMIN_EMAIL = "admin@empresa.com.br"
   $env:ADMIN_NAME = "Administrador"
   $env:ADMIN_PASSWORD = "defina-uma-senha-forte"
   pnpm bootstrap:admin
   Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
   ```

7. Inicie frontend, API e worker:

   ```powershell
   pnpm dev
   ```

Deixe esse terminal aberto enquanto estiver usando o sistema. Acesse http://localhost:5173 e entre com o administrador criado no passo anterior.

## Como rodar no dia a dia

Depois da primeira instalação, são necessários somente dois comandos:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio evolution-postgres evolution-redis evolution-minio evolution
pnpm dev
```

O primeiro comando inicia a infraestrutura em segundo plano. O segundo mantém a aplicação, a API e o worker em execução no terminal e atualiza o código automaticamente durante o desenvolvimento.

Não use `docker compose up` sem a lista de serviços durante o desenvolvimento: isso também iniciaria as imagens de produção da API e do frontend.

## Como parar

1. No terminal em que `pnpm dev` está rodando, pressione `Ctrl+C`.
2. Se também quiser parar a infraestrutura:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.dev.yml stop
   ```

Esse comando não apaga os dados. Não use `docker compose down -v`, pois a opção `-v` remove os volumes dos bancos e dos arquivos.

## Verificação rápida

Confira o estado dos contêineres:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

Teste a API:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

A resposta esperada contém `"status": "ok"`. No terminal do `pnpm dev`, também devem aparecer as mensagens de que a API iniciou e de que o worker está ativo.

Se o WhatsApp não conectar, confirme primeiro se `prospecta-evolution-1`, `prospecta-evolution-postgres-1`, `prospecta-evolution-redis-1` e `prospecta-evolution-minio-1` aparecem como ativos no comando `docker compose ... ps`.

## Comandos úteis

```powershell
pnpm build       # gera a compilação de produção
pnpm typecheck   # valida os tipos TypeScript
pnpm test        # executa os testes
pnpm db:generate # atualiza o Prisma Client
pnpm db:seed     # cria os dados iniciais configuráveis
```

## Estrutura do projeto

- `apps/web`: frontend React/Vite, CRM, Kanban, inbox, campanhas, relatórios e automações;
- `apps/api`: API NestJS, autenticação, permissões, OpenAPI, webhooks e tempo real;
- `apps/worker`: filas de mensagens, campanhas, automações e manutenção;
- `packages/contracts`: contratos e schemas compartilhados;
- `packages/database`: Prisma, migrações e modelo relacional;
- `infra`: proxy e arquivos de infraestrutura;
- `docs`: documentação operacional complementar.

Para implantação, backups e homologação, consulte [docs/OPERACAO.md](docs/OPERACAO.md).
