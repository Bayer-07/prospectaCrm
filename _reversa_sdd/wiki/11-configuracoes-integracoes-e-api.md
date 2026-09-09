# Configurações, integrações, API e MCP

> Rotas: `/configuracoes`, `/conexoes`, `/integracoes/api`, `/integracoes/mcp`, `/integracoes/webhooks`, `/integracoes/swagger` e `/integracoes/ai`.
> Fonte de implementação: `apps/web/src/pages/Settings.tsx`, `apps/api/src/auth`, `apps/api/src/mcp`, `apps/mcp/src` e `apps/api/src/swagger`.

## Intenções atendidas

- Gerenciar usuários, equipes e papéis.
- Cadastrar conexão WhatsApp.
- Criar chave de API.
- Conectar um cliente de IA por MCP.
- Configurar webhook de saída.
- Consultar e testar API pelo Swagger.

## Chaves de API

Em **Integrações → API**:

1. gere uma chave nomeada;
2. copie o segredo imediatamente;
3. armazene-o em um cofre seguro;
4. use `Authorization: Bearer SUA_CHAVE` nas chamadas permitidas.

O segredo é exibido uma única vez e armazenado por hash. Revogue e gere outra chave se houver exposição. Chaves têm escopo, expiração opcional e limite de acesso. **[CONFIRMADO]**

A API pública usa JSON, UUID, ISO-8601 UTC, telefone E.164, valores em centavos e paginação por cursor. Criações externas sensíveis exigem `Idempotency-Key` para evitar duplicidade. **[CONFIRMADO]**

## Servidor MCP

Em **Integrações → Servidor MCP**:

1. gere uma chave exclusiva para cada cliente de IA;
2. copie o endpoint Streamable HTTP;
3. configure o cliente com Bearer token;
4. teste uma leitura de CRM antes de liberar criação/edição.

Exemplo local:

```json
{
  "mcpServers": {
    "bzs-one": {
      "type": "http",
      "url": "http://localhost:3100/mcp",
      "headers": { "Authorization": "Bearer SUA_CHAVE_MCP" }
    }
  }
}
```

O MCP é um adaptador da API REST e não acessa o PostgreSQL diretamente. Ele pode ler, criar e editar o subconjunto autorizado de CRM; não expõe exclusão, arquivamento ou cancelamento. **[CONFIRMADO]**

## Webhooks

Em **Integrações → Webhooks**:

1. crie um nome;
2. escolha a ação que disparará a chamada;
3. informe endpoint `http://` ou `https://` válido;
4. salve e copie o segredo quando exibido;
5. ative ou desative o webhook conforme necessário.

O sistema valida destinos contra SSRF no cadastro e novamente no worker. O payload é enviado de forma assíncrona e deve ser tratado como evento repetível; implemente idempotência no consumidor. **[CONFIRMADO]**

## Swagger

Em **Integrações → Swagger**, abra a documentação da API em `/docs`. Ela mostra o subconjunto público com schemas, segurança e erros. Rotas internas não devem ser expostas a integrações externas só porque aparecem no código. **[CONFIRMADO]**

## Conexões e provedores

| Provedor | Finalidade |
|---|---|
| Evolution API | WhatsApp multi-instância, QR, mensagens e webhooks. |
| OpenAI | IA, respostas, resumos e busca de conhecimento. |
| MinIO/S3 | Arquivos, mídias, propostas e documentos. |
| Mailgun | E-mails transacionais e eventos de entrega. |
| Gmail SMTP | Campanhas manuais de e-mail. |
| Speaches/faster-whisper | Transcrição de áudio. |
| BrasilAPI | Consulta de dados de CNPJ. |

Credenciais ficam no backend/worker e não devem chegar ao navegador. **[CONFIRMADO]**

