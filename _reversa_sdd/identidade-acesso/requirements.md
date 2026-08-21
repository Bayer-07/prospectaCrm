# Identidade e acesso — Requisitos

## Visão geral

O módulo autentica pessoas por e-mail e senha, mantém sessões de navegador, autoriza ações por papéis e escopos, administra usuários e emite chaves de API para integrações externas. **[CONFIRMADO]**

As rotas internas usam o prefixo global `/api/v1`; autenticação humana é transportada por cookies e integrações usam tokens `pk_` no cabeçalho `Authorization: Bearer`. **[CONFIRMADO]**

## Responsabilidades

- Autenticar, encerrar sessão e expor o contexto do usuário atual. **[CONFIRMADO]**
- Validar CSRF nas mutações autenticadas por sessão. **[CONFIRMADO]**
- Convidar, editar, desativar e recuperar o acesso de usuários. **[CONFIRMADO]**
- Administrar papéis, permissões e escopos `ALL`, `TEAM` e `OWN`. **[CONFIRMADO]**
- Criar chaves de API nomeadas, com escopos e expiração opcionais, exibindo o segredo somente na criação. **[CONFIRMADO]**
- Registrar eventos sensíveis na auditoria. **[CONFIRMADO]**

## Regras de negócio

1. E-mails são normalizados antes das consultas e devem ser únicos entre usuários ativos. **[CONFIRMADO]**
2. O login deve devolver a mesma resposta de credencial inválida para usuário inexistente, inativo ou senha incorreta. **[CONFIRMADO]**
3. Cinco falhas de login no intervalo de quinze minutos bloqueiam novas tentativas no mesmo escopo de proteção. **[CONFIRMADO]**
4. A sessão humana expira em sete dias e possui token CSRF associado. **[CONFIRMADO]**
5. Convites expiram em 72 horas; redefinições de senha expiram em 60 minutos. **[CONFIRMADO]**
6. Senhas novas devem ter pelo menos cinco caracteres. **[CONFIRMADO]**
7. Toda autorização de recurso é verificada pela API; a interface não é fronteira de segurança. **[CONFIRMADO]**
8. Uma chave de API só pode acessar o subconjunto público de CRM e MCP aceito pelo guard global. **[CONFIRMADO]**
9. O valor secreto de uma chave de API é armazenado por hash e retornado uma única vez. **[CONFIRMADO]**
10. Excluir um usuário realiza desativação lógica e deve preservar referências históricas. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Critério de aceite | Evidência |
|---|---|---:|---|---|
| IAM-FR-001 | Permitir login com e-mail e senha. **[CONFIRMADO]** | Must | Credenciais válidas criam cookies de sessão e CSRF e retornam a expiração. **[CONFIRMADO]** | `apps/api/src/auth/auth.controller.ts`, `auth.service.ts` **[CONFIRMADO]** |
| IAM-FR-002 | Permitir logout em qualquer aba autenticada. **[CONFIRMADO]** | Must | A sessão é revogada, os cookies são removidos e chamadas posteriores retornam não autorizado. **[CONFIRMADO]** | `apps/api/src/auth/auth.controller.ts` **[CONFIRMADO]** |
| IAM-FR-003 | Consultar o usuário atual e suas permissões. **[CONFIRMADO]** | Must | `GET /auth/me` retorna o `AuthContext` da sessão ou chave aceita. **[CONFIRMADO]** | `apps/api/src/auth/auth.controller.ts` **[CONFIRMADO]** |
| IAM-FR-004 | Convidar usuário por nome, e-mail, papel e equipe opcional. **[CONFIRMADO]** | Must | O convite válido é persistido e enviado pelo provedor transacional configurado. **[CONFIRMADO]** | `apps/api/src/users/users.controller.ts`, `users.service.ts` **[CONFIRMADO]** |
| IAM-FR-005 | Aceitar convite e definir nome e senha. **[CONFIRMADO]** | Must | Um token íntegro e não expirado ativa o usuário e não pode ser reutilizado. **[CONFIRMADO]** | `apps/api/src/auth/auth.controller.ts`, `auth.service.ts` **[CONFIRMADO]** |
| IAM-FR-006 | Solicitar e concluir recuperação de senha. **[CONFIRMADO]** | Must | A solicitação não revela se o e-mail existe; token válido troca a senha e invalida sessões anteriores. **[CONFIRMADO]** | `apps/api/src/auth/auth.controller.ts`, `auth.service.ts` **[CONFIRMADO]** |
| IAM-FR-007 | Listar, editar e desativar usuários conforme permissão. **[CONFIRMADO]** | Must | Sem `users:read/write` a API nega a ação; com permissão o escopo da organização é respeitado. **[CONFIRMADO]** | `apps/api/src/users/users.controller.ts`, `users.service.ts` **[CONFIRMADO]** |
| IAM-FR-008 | Editar o próprio perfil, preferências e foto. **[CONFIRMADO]** | Should | O usuário altera apenas os campos expostos nas rotas `users/me*`; mídia é servida por redirecionamento temporário. **[CONFIRMADO]** | `apps/api/src/users/users.controller.ts` **[CONFIRMADO]** |
| IAM-FR-009 | Configurar permissões de um papel. **[CONFIRMADO]** | Must | A lista substitui as permissões do papel com recurso, ação e escopo válidos. **[CONFIRMADO]** | `apps/api/src/users/users.controller.ts` **[CONFIRMADO]** |
| IAM-FR-010 | Criar chave de API nomeada e escopada. **[CONFIRMADO]** | Must | A resposta de criação contém o token uma vez; autenticação posterior usa somente o hash persistido. **[CONFIRMADO]** | `apps/api/src/users/users.service.ts`, `apps/api/src/auth/auth.guard.ts` **[CONFIRMADO]** |
| IAM-FR-011 | Auditar alterações de acesso. **[CONFIRMADO]** | Must | Convites, usuários, papéis, sessões e chaves relevantes deixam evento com ator e entidade. **[CONFIRMADO]** | `apps/api/src/auth/auth.service.ts`, `apps/api/src/users/users.service.ts` **[CONFIRMADO]** |

## Requisitos não funcionais

| ID | Requisito | Meta | Confiança |
|---|---|---|---|
| IAM-NFR-001 | Senhas devem usar hash resistente a força bruta. | Argon2id conforme serviço atual. | **[CONFIRMADO]** |
| IAM-NFR-002 | Cookies de autenticação não devem ser acessíveis ao JavaScript. | Sessão `HttpOnly`; CSRF legível pelo cliente e validado no servidor. | **[CONFIRMADO]** |
| IAM-NFR-003 | Consultas repetidas de sessão e chave não devem consultar o banco em toda requisição. | Cache em memória com TTL e capacidade limitada. | **[CONFIRMADO]** |
| IAM-NFR-004 | Segredos não devem aparecer em logs, auditoria ou respostas posteriores. | Somente hash/últimos caracteres quando necessário. | **[CONFIRMADO]** |
| IAM-NFR-005 | Mudanças de sessão devem ser percebidas por abas diferentes. | Qualquer resposta `401` força retorno ao login; sincronização proativa entre abas depende da interface. | **[CONFIRMADO]** |

## Cenários de aceitação

```gherkin
Funcionalidade: autenticar usuário ativo
  Cenário: login válido
    Dado que existe um usuário ativo com senha cadastrada
    Quando ele envia e-mail e senha válidos para /api/v1/auth/login
    Então a API cria uma sessão com expiração
    E grava os cookies de sessão e CSRF
    E /api/v1/auth/me retorna o contexto autenticado
```
**[CONFIRMADO]**

```gherkin
Funcionalidade: proteger recurso por permissão
  Cenário: usuário sem permissão tenta editar outro usuário
    Dado que a sessão não possui users:write no escopo necessário
    Quando ela envia PATCH para /api/v1/users/{id}
    Então a API responde acesso negado
    E nenhuma alteração é persistida
```
**[CONFIRMADO]**

```gherkin
Funcionalidade: recuperar acesso sem enumerar contas
  Cenário: e-mail inexistente
    Dado que o e-mail informado não pertence a um usuário ativo
    Quando a recuperação de senha é solicitada
    Então a API devolve a mesma confirmação genérica usada para e-mail existente
    E nenhum token utilizável é emitido
```
**[CONFIRMADO]**

## Priorização MoSCoW

- **Must:** login, logout, sessão, CSRF, RBAC, escopo de dados, convite, recuperação, auditoria e chaves de API. **[CONFIRMADO]**
- **Should:** foto, assinatura de mensagens e metadados de equipes/papéis no perfil. **[CONFIRMADO]**
- **Could:** autenticação multifator e encerramento remoto seletivo de sessões. **[A VALIDAR]**
- **Won't nesta versão reconstruída:** login social, SSO corporativo e auto cadastro público. **[INFERIDO]**

## Rastreabilidade

- API: `apps/api/src/auth/**`, `apps/api/src/users/**`, com CSRF validado em `apps/api/src/auth/auth.guard.ts`, e `apps/api/src/common/idempotency.interceptor.ts`. **[CONFIRMADO]**
- Contratos e permissões: `packages/contracts/src/index.ts`. **[CONFIRMADO]**
- Persistência: modelos `User`, `Role`, `Permission`, `RolePermission`, `Session`, `Invite`, `PasswordResetToken`, `ApiKey` e `AuditLog` em `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
- Interface: `apps/web/src/pages/Auth.tsx`, `apps/web/src/App.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/pages/Users.tsx` e páginas de perfil/configuração relacionadas. **[CONFIRMADO]**
- Testes: arquivos `*.test.ts` em `apps/api/src/auth` e `apps/api/src/users`, além dos testes da interface de autenticação. **[CONFIRMADO]**
