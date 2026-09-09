# Operação, segurança, limites e glossário

> Público: operadores, suporte, administradores e agentes de IA.
> Fontes: `README.md`, `docs/OPERACAO.md`, `docker-compose.yml`, `rebuild.sh`, `scripts/backup.sh` e `_reversa_sdd/permissions.md`.

## Arquitetura resumida

| Componente | Responsabilidade |
|---|---|
| Web React/Vite | Interface, rotas protegidas e interações. |
| API NestJS | Autorização, regras de negócio e REST. |
| Worker BullMQ | Mensagens, campanhas, follow-ups, IA, transcrição e reconciliação. |
| PostgreSQL | Fonte persistente de verdade. |
| Redis | Filas, Pub/Sub e jobs efêmeros. |
| MinIO/S3 | Objetos privados e mídias. |
| Evolution API | Conexões WhatsApp. |
| Caddy/Nginx | Proxy e publicação. |

## Operação local

Endereços padrão:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Saúde da API: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs`
- MCP: `http://localhost:3100/mcp`
- Saúde do MCP: `http://localhost:3100/health`
- Evolution: `http://localhost:8082`

Pré-requisitos: Node.js 22+, pnpm 11 e Docker Compose. A infraestrutura de desenvolvimento deve ser iniciada antes de `pnpm dev`. Não use `docker compose down -v`, porque isso remove volumes do PostgreSQL, Redis e MinIO. **[CONFIRMADO]**

## Implantação e backup

Em produção:

1. configure `.env` com domínio HTTPS e segredos reais;
2. mantenha bancos e credenciais na rede interna;
3. execute `rebuild.sh` para atualizar sem remover volumes;
4. faça backup antes de atualizar CRM, PostgreSQL ou Evolution;
5. teste login, permissões, QR, texto, mídia, recibos e opt-out em número de homologação.

O backup deve incluir PostgreSQL e MinIO. A operação documentada recomenda cópias diárias, semanais e ensaio trimestral de restauração. **[CONFIRMADO]**

## Resposta a incidentes

- Desconexões/erros de WhatsApp: pause campanhas e verifique Evolution antes de aumentar aquecimento.
- Chave exposta: revogue imediatamente, gere outra e revise os logs.
- Mensagens paradas: diferencie fila, falha de provedor e bloqueio de follow-up.
- Documento RAG falho: reindexe depois de confirmar arquivo e armazenamento.
- Dados divergentes: PostgreSQL é a fonte de verdade; Redis não deve ser editado manualmente como correção comercial.

## Segurança mínima

- Não compartilhe credenciais em tickets, commits, logs ou respostas de IA.
- Use uma chave MCP/API por integração e escopo mínimo.
- Não torne mídia privada pública apenas para resolver um erro de visualização.
- Valide endpoints externos e mantenha proteção contra SSRF.
- Trate eventos e jobs como possíveis redeliveries; operações devem ser idempotentes.

## Glossário

| Termo | Definição |
|---|---|
| Atendimento | Conversa de WhatsApp operada por uma equipe/usuário. |
| Assumir | Atribuir a conversa a si e colocá-la em `OPEN`. |
| Resolver/fechar | Encerrar a conversa com status `CLOSED`. |
| Follow-up | Retorno automático agendado para uma conversa. |
| Cadência | Sequência de mensagens com intervalos. |
| Job | Trabalho enfileirado para execução pelo worker. |
| Reconciliador | Processo que procura estados pendentes e recupera jobs ausentes. |
| Opt-out | Pedido do contato para não receber comunicações. |
| Supressão | Bloqueio técnico de um canal ou tipo de campanha. |
| RAG | Recuperação de trechos indexados de documentos para dar contexto à IA. |
| Scope/escopo | Limite de registros acessíveis: próprios, equipe ou todos. |
| Idempotência | Repetir a mesma solicitação sem criar efeitos duplicados. |
| `QUEUED` | Aguardando processamento; ainda não confirma envio. |
| `SENT` | Provedor aceitou o envio. |
| `FAILED` | Processamento terminou com falha. |

## Lacunas conhecidas

O agente deve pedir confirmação sobre SLOs, política de MFA/SSO, escala horizontal, reatribuição de dados após desativação, enriquecimento externo e novas automações. Esses pontos não estão definidos de forma normativa no código atual. **[LACUNA]**
