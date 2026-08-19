# BZS One

Plataforma interna integrada da BZS Tecnologia. A estrutura atual reúne CRM, atendimento, automações e campanhas de WhatsApp, com base preparada para novos módulos de gestão.

## Endereços no desenvolvimento

| Serviço | Endereço |
| --- | --- |
| Aplicação web | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| Saúde da API | http://localhost:3000/health |
| OpenAPI | http://localhost:3000/docs |
| Servidor MCP | http://localhost:3100/mcp |
| Saúde do MCP | http://localhost:3100/health |
| Evolution API | http://localhost:8082 |
| MinIO | http://localhost:9001 |

## Configuração local padrão

Durante o desenvolvimento, todos os links gerados pelo sistema usam
`localhost`. Mantenha estas variáveis no `.env`:

```dotenv
APP_URL=http://localhost:5173
APP_ADDRESS=http://localhost
API_URL=http://localhost:5173/api/v1
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost
S3_PUBLIC_ENDPOINT=http://localhost:9000
VITE_API_URL=/api/v1
VITE_SOCKET_URL=/
VITE_MCP_URL=http://localhost:3100/mcp
```

Assim, convites, recuperação de senha, e-mails de tarefas, mídias, Swagger,
API e Socket.IO não dependem do IP atual do computador.

## Quando publicar em produção

Na implantação, substitua `APP_URL`, `APP_ADDRESS`, `API_URL`,
`CORS_ORIGINS` e `S3_PUBLIC_ENDPOINT` pelo domínio HTTPS definitivo. O
frontend continuará usando `/api/v1` e `/socket.io` como endereços relativos,
portanto não será necessário alterar o código da aplicação.

### Atualizar o servidor Ubuntu

Depois da primeira instalação, execute na raiz do projeto:

```bash
chmod +x rebuild.sh
./rebuild.sh
```

O script atualiza o repositório com `git pull --ff-only`, reconstrói API,
worker, frontend e MCP, aplica as migrações e publica os novos containers sem
remover os volumes do PostgreSQL, Redis ou MinIO. Se existir um arquivo
`docker-compose.tailscale.yml`, ele será aplicado automaticamente e o Caddy
local não será iniciado.

Para reconstruir o código que já está no servidor sem executar `git pull`:

```bash
./rebuild.sh --no-pull
```

Quando também houver alterações na imagem customizada da Evolution API:

```bash
./rebuild.sh --with-evolution
```

## Pré-requisitos

- Node.js 22 ou mais recente;
- pnpm 11;
- Docker Desktop com Docker Compose;
- portas `3000`, `5173`, `5434`, `6380`, `8082`, `9000` e `9001` livres.

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
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio evolution-postgres evolution-redis evolution-minio evolution transcription
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

7. Inicie frontend, API, worker e servidor MCP:

   ```powershell
   pnpm dev
   ```

Deixe esse terminal aberto enquanto estiver usando o sistema. Acesse http://localhost:5173 e entre com o administrador criado no passo anterior.

## Como rodar no dia a dia

Depois da primeira instalação, são necessários somente dois comandos:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio evolution-postgres evolution-redis evolution-minio evolution transcription
pnpm dev
```

O primeiro comando inicia a infraestrutura em segundo plano. O segundo mantém a aplicação, a API, o worker e o servidor MCP em execução no terminal. API, worker e MCP rodam no modo estável, sem reiniciar por alterações no banco ou em dependências compartilhadas; o frontend continua com atualização automática do Vite. Depois de alterar o código do backend, encerre o comando com `Ctrl+C` e execute `pnpm dev` novamente.

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

Teste também a saúde do servidor MCP:

```powershell
Invoke-RestMethod http://localhost:3100/health
```

## Servidor MCP para LLMs

O BZS One disponibiliza um servidor MCP remoto por **Streamable HTTP**. Ele
permite que clientes de IA leiam, criem e editem empresas, contatos,
oportunidades, tarefas, tags, campos personalizados e segmentos. Não existem
ferramentas MCP para excluir, arquivar ou cancelar registros.

1. Entre como administrador e abra **Integrações → Servidor MCP**.
2. Clique em **Gerar chave MCP** e copie a chave exibida uma única vez.
3. Configure o cliente MCP com:

   - URL local: `http://localhost:3100/mcp`;
   - URL em produção: `https://SEU_DOMINIO/mcp`;
   - cabeçalho: `Authorization: Bearer SUA_CHAVE_MCP`.

Exemplo genérico — o formato externo pode variar conforme o cliente:

```json
{
  "mcpServers": {
    "bzs-one": {
      "type": "http",
      "url": "http://localhost:3100/mcp",
      "headers": {
        "Authorization": "Bearer SUA_CHAVE_MCP"
      }
    }
  }
}
```

Variáveis locais:

```dotenv
MCP_HOST=127.0.0.1
MCP_PORT=3100
MCP_API_URL=http://localhost:3000/api/v1
MCP_API_TIMEOUT_MS=15000
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1]
MCP_ALLOWED_ORIGINS=localhost,127.0.0.1,[::1]
VITE_MCP_URL=http://localhost:3100/mcp
```

O serviço MCP não acessa o PostgreSQL diretamente: toda ferramenta chama a
API REST autenticada, preservando escopos, validações, idempotência e
auditoria. Em produção ele fica isolado na rede interna do Docker e somente o
Caddy publica `/mcp`.

Se o WhatsApp não conectar, confirme primeiro se `prospecta-evolution-1`, `prospecta-evolution-postgres-1`, `prospecta-evolution-redis-1` e `prospecta-evolution-minio-1` aparecem como ativos no comando `docker compose ... ps`.

## Transcrição de áudios

Áudios recebidos pelo WhatsApp e áudios gravados dentro do BZS One exibem o botão **Transcrever áudio**. A solicitação é processada pelo worker, sem travar o Inbox, e o texto fica salvo na própria mensagem para não processar o mesmo arquivo novamente.

Por padrão, a transcrição é totalmente local e gratuita. O container `transcription` executa o [Speaches](https://github.com/speaches-ai/speaches), baseado em `faster-whisper`, com CPU, quantização INT8 e o modelo multilíngue `small`:

```dotenv
TRANSCRIPTION_API_URL=http://localhost:8000/v1/audio/transcriptions
TRANSCRIPTION_API_KEY=
TRANSCRIPTION_MODEL=Systran/faster-whisper-small
TRANSCRIPTION_LANGUAGE=pt
TRANSCRIPTION_TIMEOUT_MS=120000
TRANSCRIPTION_MODEL_DOWNLOAD_TIMEOUT_MS=600000
TRANSCRIPTION_MAX_BYTES=26214400
TRANSCRIPTION_CONCURRENCY=1
TRANSCRIPTION_BIND_PORT=8000
TRANSCRIPTION_CPU_THREADS=4
SPEACHES_IMAGE=ghcr.io/speaches-ai/speaches:latest-cpu
```

Na primeira transcrição, o worker verifica se o modelo existe, baixa-o automaticamente e o mantém no volume `transcription_models`; isso pode levar alguns minutos, mas acontece somente uma vez. A porta `8000` fica vinculada ao `localhost` e não é exposta para outros computadores da rede. Se necessário, ajuste `TRANSCRIPTION_CPU_THREADS` à quantidade de núcleos que deseja reservar para as transcrições.

## IA com OpenAI API

O BZS One usa a Responses API da OpenAI para gerar resumos persistentes, sugerir respostas editáveis e executar blocos de pré-atendimento nos chatbots. As gerações continuam assíncronas na fila do worker e não bloqueiam a navegação. O modelo padrão é `gpt-5.6-luna`, configurável por ambiente.

O recurso nasce desligado. O CRM, WhatsApp, campanhas e demais workers continuam funcionando normalmente sem uma chave. Ao ativá-lo, o conteúdo necessário da conversa é enviado à OpenAI para processamento. As requisições usam `store: false`; ainda assim, revise as políticas internas de privacidade antes da homologação.

### Configuração no Ubuntu

Crie uma chave de API na plataforma da OpenAI e configure na raiz do repositório:

```bash
sed -i '/^AI_ASSISTANT_ENABLED=/d;/^OPENAI_/d;/^OLLAMA_/d' .env
cat >> .env <<'EOF'
AI_ASSISTANT_ENABLED=true
OPENAI_API_KEY=COLE_SUA_CHAVE_AQUI
OPENAI_API_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REASONING_EFFORT=none
OPENAI_INTERACTIVE_TIMEOUT_MS=90000
OPENAI_SUMMARY_TIMEOUT_MS=180000
EOF

./rebuild.sh --no-pull
docker compose ps api worker
docker compose logs --tail=100 worker
```

Depois, um administrador deve abrir **Integrações → Inteligência artificial**, revisar as instruções gerais, habilitar a organização e executar **Testar geração**. A chave da API nunca deve ser colocada no navegador nem versionada no Git.

### Atualizações futuras

```bash
git pull --ff-only
./rebuild.sh --no-pull
```

O Ollama deixou de fazer parte da aplicação. Após validar a OpenAI em produção, o container e o volume antigos podem ser removidos sem afetar PostgreSQL, Redis ou MinIO:

```bash
docker rm -f prospecta-ollama-1 2>/dev/null || true
docker volume rm prospecta_ollama_models 2>/dev/null || true
```

A API da OpenAI é cobrada separadamente de uma assinatura do ChatGPT. Consulte a documentação oficial da [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) e do [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

## CSV de campanhas

Na criação de uma campanha, o CSV deve ter as colunas `telefone` e `mensagem`. Para enviar várias mensagens ao mesmo contato, adicione `mensagem_2`, `mensagem_3` e assim por diante. As colunas `nome` e `email` são opcionais.

Exemplo:

```csv
nome;telefone;mensagem;mensagem_2
Maria;(45) 99922-5389;Olá Maria, tudo bem?;Posso te apresentar nossa solução?
```

Ao carregar o arquivo, o sistema consulta a Evolution API e mostra separadamente os números com e sem WhatsApp. Antes do envio, a pré-validação repete essa consulta e ignora números sem WhatsApp, contatos duplicados, bloqueados ou descadastrados.

## Configurar campanhas de e-mail com Gmail

As campanhas de e-mail criadas manualmente no BZS One usam uma conta Gmail separada via SMTP. Convites de usuários, recuperação de senha e resumos de tarefas continuam sendo enviados pelo Mailgun.

Na conta Google que será usada nas campanhas:

1. ative a verificação em duas etapas;
2. abra [Senhas de app](https://myaccount.google.com/apppasswords);
3. crie uma senha para o BZS One e copie o código de 16 caracteres;
4. preencha o `.env` da raiz:

```dotenv
CAMPAIGN_GMAIL_USER=seu-email@gmail.com
CAMPAIGN_GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
CAMPAIGN_GMAIL_FROM_NAME=BZS Tecnologia
```

O sistema remove automaticamente os espaços exibidos pelo Google. A conta autenticada será sempre o remetente, pois o Gmail reescreve o campo `From` para o endereço conectado.

Valide a autenticação sem enviar uma mensagem real:

```powershell
corepack pnpm gmail:verify
```

Depois de alterar o `.env`, reinicie a API e o worker. O SMTP do Gmail confirma a aceitação da mensagem, mas não fornece ao BZS One eventos de abertura, clique ou entrega. O Gmail também possui limites de envio e não é indicado para disparos de alto volume.

Referências: [senhas de app do Google](https://support.google.com/accounts/answer/185833) e [configuração oficial do SMTP do Gmail](https://support.google.com/a/answer/176600).

## Configurar envios internos com Mailgun

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

O Mailgun permanece responsável pelos e-mails internos do sistema: convites de usuários, recuperação de senha e resumos diários de tarefas. As campanhas manuais não usam essas credenciais.

Referências oficiais: [envio pela HTTP API](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http), [autenticação](https://documentation.mailgun.com/docs/mailgun/api-reference/mg-auth), [webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks) e [assinatura dos webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks).

### Resumo diário de tarefas

O Mailgun envia, todos os dias às **08:00**, um resumo individual para o e-mail de cada usuário responsável por tarefas abertas naquele dia. O horário usa o fuso `America/Sao_Paulo`.

- tarefas sem responsável não geram e-mail;
- cada responsável recebe um único e-mail com todas as tarefas do dia, ordenadas por horário;
- o worker registra o envio por usuário e data para não duplicar resumos após reinícios;
- se o Mailgun falhar temporariamente, a fila faz novas tentativas sem reenviar os resumos já confirmados;
- mantenha `APP_URL` com o endereço público do BZS One, pois ele é usado no botão **Abrir minha agenda** do e-mail.

Na interface, abra **Tarefas** para alternar entre as visualizações de mês e semana. Clique em qualquer dia ou horário vazio para criar uma tarefa já com aquela data selecionada.

### Webhooks de saída

Em **Integrações → Webhooks**, podem ser cadastrados vários endpoints. Cada webhook possui uma única ação associada e é criado desativado. Depois de ativado, a ocorrência da ação selecionada envia uma requisição HTTP `GET` para o endpoint, preservando parâmetros que já existam na URL e adicionando:

- `event`: identificador da ação, como `contact.created`;
- `event_id`: identificador único da entrega;
- `created_at`: data do evento em UTC;
- `entity_type` e `entity_id`: tipo e identificador do registro afetado.

A chamada também inclui os cabeçalhos `X-BZS-One-Event`, `X-BZS-One-Event-Id`, `X-BZS-One-Timestamp` e `X-BZS-One-Signature`. Falhas recebem novas tentativas exponenciais pela fila do worker.

## Comandos úteis

```powershell
pnpm dev         # inicia API, worker, web e MCP no modo estável
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
