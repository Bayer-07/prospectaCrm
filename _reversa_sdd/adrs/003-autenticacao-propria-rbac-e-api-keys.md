# ADR 003 — Autenticação própria, RBAC com escopo e chaves de API

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-17, reforçado em 2026-08
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commits `81d91ff`, `2b97583`, `88ee2b4`, `d05ba01`

## Contexto

O sistema interno precisa funcionar em várias abas, limitar funcionalidades e dados por papel/equipe/proprietário e permitir integrações sem compartilhar credenciais humanas.

## Decisão

- Login próprio por e-mail/senha com Argon2id.
- JWT associado a uma sessão persistida e revogável.
- Cookies seguros com CSRF para mutações e bearer opcional.
- RBAC `resource:action:scope` com wildcards e escopos `ALL`, `TEAM`, `OWN`.
- Chaves `pk_` nomeadas, armazenadas por hash, expiradas/revogáveis e restritas a rotas públicas.
- Autorização sempre na API; interface apenas espelha capacidade.

## Consequências

### Positivas

- Logout/suspensão/expiração podem invalidar acesso em qualquer aba.
- Integrações recebem privilégio mínimo sem sessão de usuário.
- Papéis podem ser customizados sem alterar código de cada tela.

### Negativas

- A equipe mantém segurança de senha, sessão, CSRF e rotação de segredos.
- Recurso/ação é string livre e o filtro de escopo depende do serviço.
- Conversas exigiram política especializada que não cabe em `ownerId/teamId`.

## Alternativas consideradas

- Sessão opaca somente no banco: possível, mas o JWT reduz consultas com cache e preserva revogação.
- Provedor externo de identidade: custo/complexidade não justificados para a implantação interna.
- ACL por registro: granularidade maior, porém manutenção excessiva para o modelo de equipe/carteira.

## Restrições

- Configuração global de IA continua exclusiva do `admin`.
- API keys não acessam Inbox, campanhas, integrações ou administração.
- MCP herda os escopos da chave e não expõe ferramentas destrutivas.

## Evidências atuais

`apps/api/src/auth/*`, `packages/database/prisma/seed.ts`, `apps/api/src/integrations/conversation-visibility.ts`, `apps/mcp/src/tools.ts`.
