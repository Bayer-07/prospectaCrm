# C4 — Contexto do sistema

> Nível 1 reconstruído em 2026-08-21. 🟢 Relações confirmadas no código/infraestrutura; 🟡 relações operacionais inferidas.

```mermaid
C4Context
  title BZS One — contexto do sistema

  Person(admin, "Administrador", "Configura organização, usuários, integrações, IA e acompanha toda a operação")
  Person(manager, "Gestor", "Acompanha equipes, CRM, campanhas, tarefas, relatórios e atendimentos permitidos")
  Person(operator, "SDR / Vendedor", "Opera carteira, pipeline, agenda e conversas atribuídas")
  Person(customer, "Contato / cliente", "Interage por WhatsApp ou recebe campanha por e-mail")
  Person(llmClient, "Cliente LLM/MCP", "Lê, cria e edita dados comerciais conforme chave escopada")

  System(bzs, "BZS One", "Plataforma interna de CRM, atendimento, campanhas, automação e IA")

  System_Ext(evolution, "Evolution API", "Sessões WhatsApp multi-instância via QR/Baileys")
  System_Ext(whatsapp, "WhatsApp", "Rede de mensagens do contato")
  System_Ext(openai, "OpenAI", "Responses API, modelos e File Search/Vector Store")
  System_Ext(mailgun, "Mailgun", "E-mails transacionais e eventos de entrega")
  System_Ext(gmail, "Gmail SMTP", "Envio de campanhas manuais de e-mail")
  System_Ext(brasilapi, "BrasilAPI", "Consulta pública de CNPJ")
  System_Ext(transcription, "Speaches / Whisper", "Transcrição local compatível com API OpenAI")
  System_Ext(s3, "S3 / MinIO", "Armazenamento privado de mídias e documentos")
  System_Ext(externalWebhook, "Sistemas por webhook", "Recebem eventos comerciais GET assinados")

  Rel(admin, bzs, "Administra e consulta", "HTTPS / Socket.IO")
  Rel(manager, bzs, "Opera e acompanha", "HTTPS / Socket.IO")
  Rel(operator, bzs, "Atende e atualiza CRM", "HTTPS / Socket.IO")
  Rel(llmClient, bzs, "Usa ferramentas não destrutivas", "MCP Streamable HTTP + Bearer pk_")
  Rel(customer, whatsapp, "Envia e recebe mensagens", "WhatsApp")
  Rel(customer, gmail, "Recebe campanha", "E-mail")
  Rel(customer, mailgun, "Recebe convite, alerta ou resumo", "E-mail")

  Rel(bzs, evolution, "Gerencia instâncias e envia/consulta mensagens", "HTTP interno")
  Rel(evolution, bzs, "Publica conexão e mensagens", "Webhook HTTP")
  Rel(evolution, whatsapp, "Sincroniza mensagens", "Baileys")
  Rel(bzs, openai, "Gera respostas/resumos e indexa conhecimento", "HTTPS JSON/multipart")
  Rel(bzs, mailgun, "Envia e-mails transacionais", "HTTPS")
  Rel(mailgun, bzs, "Publica eventos de entrega", "Webhook HMAC")
  Rel(bzs, gmail, "Envia campanhas manuais", "SMTP TLS 465")
  Rel(bzs, brasilapi, "Consulta CNPJ", "HTTPS JSON")
  Rel(bzs, transcription, "Transcreve áudios", "HTTP multipart")
  Rel(bzs, s3, "Grava e assina arquivos", "S3 API")
  Rel(bzs, externalWebhook, "Notifica alterações comerciais", "HTTPS GET + HMAC")
```

## Fronteira e responsabilidades

- O **BZS One** é responsável pelos dados comerciais, estados de atendimento, autorização, agendamento, filas, auditoria e experiência web. 🟢
- A **Evolution API** mantém a sessão WhatsApp, mas o estado operacional do Inbox e o histórico comercial canônico ficam no BZS One. 🟢
- **OpenAI** recebe somente o contexto selecionado pelo worker; resultados e propostas retornam ao banco do BZS One. 🟢
- **S3/MinIO** guarda bytes; o PostgreSQL guarda propriedade e metadados. 🟢
- Clientes MCP não são confiáveis implicitamente: usam a mesma API escopada e não recebem operações destrutivas. 🟢
- 🔴 O repositório não define SLOs contratuais para os sistemas externos.

## Protocolos expostos

| Superfície | Consumidor | Autenticação | Formato |
|---|---|---|---|
| SPA `/` | usuários internos | cookie/JWT + CSRF | HTML/JS/CSS |
| REST `/api/v1` | SPA e integrações | sessão ou `pk_` conforme rota | JSON, PDF, CSV auxiliar |
| Socket `/realtime` | SPA | cookie de sessão validado | Socket.IO |
| Swagger `/docs` | usuários autorizados/rede publicada | borda + API | OpenAPI/HTML |
| MCP `/mcp` | clientes LLM | Bearer `pk_` | Streamable HTTP |
| `/webhooks/evolution` | Evolution | segredo do webhook | JSON |
| `/webhooks/mailgun` | Mailgun | assinatura HMAC | form/JSON do provedor |
