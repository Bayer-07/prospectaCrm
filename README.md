# BZS One

Plataforma interna integrada da BZS Tecnologia. A estrutura atual reúne CRM, atendimento, automações e campanhas de WhatsApp, com base preparada para novos módulos de gestão.

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

## CSV de campanhas

Na criação de uma campanha, o CSV deve ter as colunas `telefone` e `mensagem`. Para enviar várias mensagens ao mesmo contato, adicione `mensagem_2`, `mensagem_3` e assim por diante. As colunas `nome` e `email` são opcionais.

Exemplo:

```csv
nome;telefone;mensagem;mensagem_2
Maria;(45) 99922-5389;Olá Maria, tudo bem?;Posso te apresentar nossa solução?
```

Ao carregar o arquivo, o sistema consulta a Evolution API e mostra separadamente os números com e sem WhatsApp. Antes do envio, a pré-validação repete essa consulta e ignora números sem WhatsApp, contatos duplicados, bloqueados ou descadastrados.

## Configurar campanhas de e-mail com Mailgun

O provedor é configurado no arquivo `.env` da raiz do projeto. No painel do Mailgun, valide primeiro um domínio de envio e crie preferencialmente uma **Domain Sending Key**, que fica limitada ao envio daquele domínio.

Preencha estas variáveis:

```dotenv
MAILGUN_API_KEY=cole-a-domain-sending-key-aqui
MAILGUN_DOMAIN=mg.seudominio.com.br
MAILGUN_FROM_EMAIL=contato@mg.seudominio.com.br
MAILGUN_FROM_NAME=BZS Tecnologia
MAILGUN_REGION=US
MAILGUN_WEBHOOK_SIGNING_KEY=xxxxxxxxxxxxxxxx
MAILGUN_WEBHOOK_TOLERANCE_SECONDS=3600
```

- `MAILGUN_REGION`: use `US` para domínios hospedados nos Estados Unidos ou `EU` para domínios europeus;
- `MAILGUN_API_KEY`: use a chave privada de envio; não use a Public Validation Key;
- `MAILGUN_WEBHOOK_SIGNING_KEY`: fica em **Settings → API Security → Webhook signing key** no painel do Mailgun;
- depois de alterar o `.env`, reinicie a API e o worker.

Valide credencial, domínio e região sem entregar um e-mail real:

```powershell
corepack pnpm mailgun:verify
```

O comando usa o modo de teste do Mailgun. O retorno deve conter `"ok":true`. Um retorno `401` indica chave inválida ou ausente; `403` indica que a chave existe, mas não tem permissão sobre o domínio informado.

No Mailgun, cadastre o webhook público:

```text
https://SEU_DOMINIO/webhooks/mailgun
```

Habilite os eventos `accepted`, `delivered`, `opened`, `clicked`, `temporary_fail`, `permanent_fail`, `unsubscribed` e `complained`. Em desenvolvimento, `localhost` não é acessível pelo Mailgun; para testar webhooks, exponha temporariamente a API com um túnel HTTPS e use a URL pública terminada em `/webhooks/mailgun`.

Depois da configuração, abra **E-mail** no menu do BZS One. O aviso superior mostrará “Envio por Mailgun ativado”. Crie um modelo, abra a aba **Campanhas**, selecione os contatos com e-mail e inicie o envio.

Referências oficiais: [envio pela HTTP API](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http), [autenticação](https://documentation.mailgun.com/docs/mailgun/api-reference/mg-auth), [webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks) e [assinatura dos webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks).

### Resumo diário de tarefas

O mesmo provedor Mailgun envia, todos os dias às **08:00**, um resumo individual para o e-mail de cada usuário responsável por tarefas abertas naquele dia. O horário usa o fuso `America/Sao_Paulo`.

- tarefas sem responsável não geram e-mail;
- cada responsável recebe um único e-mail com todas as tarefas do dia, ordenadas por horário;
- o worker registra o envio por usuário e data para não duplicar resumos após reinícios;
- se o Mailgun falhar temporariamente, a fila faz novas tentativas sem reenviar os resumos já confirmados;
- mantenha `APP_URL` com o endereço público do BZS One, pois ele é usado no botão **Abrir minha agenda** do e-mail.

Na interface, abra **Tarefas** para alternar entre as visualizações de mês e semana. Clique em qualquer dia ou horário vazio para criar uma tarefa já com aquela data selecionada.

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
