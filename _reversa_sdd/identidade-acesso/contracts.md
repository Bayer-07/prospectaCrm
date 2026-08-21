# Identidade e acesso — Contratos

## Convenções

- As rotas abaixo recebem o prefixo global `/api/v1`. **[CONFIRMADO]**
- Respostas de sucesso usam o envelope `{ "data": ... }`. **[CONFIRMADO]**
- Sessões humanas usam os cookies definidos em `auth-cookies.ts`; mutações exigem `X-CSRF-Token`. **[CONFIRMADO]**
- Chaves de API usam `Authorization: Bearer pk_...` e não têm acesso a todas as rotas internas. **[CONFIRMADO]**

## Autenticação

### `POST /auth/login`

```json
{
  "email": "usuario@empresa.com.br",
  "password": "senha"
}
```
**[CONFIRMADO]**

```json
{
  "data": {
    "tokenType": "Bearer",
    "expiresAt": "2026-08-28T14:00:00.000Z"
  }
}
```
**[CONFIRMADO]**

O token de sessão não é devolvido no corpo; ele é gravado em cookie `HttpOnly`, enquanto o token CSRF fica em cookie separado para ser reenviado no cabeçalho. **[CONFIRMADO]**

### `POST /auth/logout`

Resposta: `{ "data": { "success": true } }`, seguida da remoção dos cookies. **[CONFIRMADO]**

### `GET /auth/me`

A resposta contém o `AuthContext` com tipo de autenticação, organização, usuário quando aplicável, papel, equipe e permissões calculadas. **[CONFIRMADO]**

### `POST /auth/accept-invite`

```json
{
  "token": "token-de-uso-unico",
  "password": "nova-senha",
  "name": "Nome opcional"
}
```
**[CONFIRMADO]**

### `POST /auth/forgot-password`

Entrada: `{ "email": "usuario@empresa.com.br" }`. A resposta é deliberadamente genérica para e-mails existentes ou inexistentes. **[CONFIRMADO]**

### `POST /auth/reset-password`

Entrada: `{ "token": "token-de-uso-unico", "password": "nova-senha" }`. O token deve estar íntegro, vigente e ainda não consumido. **[CONFIRMADO]**

## Usuários e perfil

### `POST /users/invite`

```json
{
  "name": "Maria Silva",
  "email": "maria@empresa.com.br",
  "roleId": "uuid",
  "teamId": "uuid-opcional"
}
```
**[CONFIRMADO]**

### `PATCH /users/:id`

Aceita `name`, `email`, `roleId` e `teamId`, sendo `teamId` anulável. **[CONFIRMADO]**

### `PATCH /users/me`

Aceita somente `name` e `email`; a rota não permite ao usuário trocar o próprio papel. **[CONFIRMADO]**

### `PATCH /users/me/preferences`

```json
{ "messageSignatureEnabled": true }
```
**[CONFIRMADO]**

### Foto do perfil

- `PATCH /users/me/profile-photo` recebe `{ "mediaAssetId": "uuid" }`. **[CONFIRMADO]**
- `DELETE /users/me/profile-photo` remove a associação. **[CONFIRMADO]**
- `GET /users/:id/profile-photo` responde com redirecionamento `302` para uma URL temporária e cache privado de cinco minutos. **[CONFIRMADO]**

## Papéis e permissões

### `PUT /users/roles/:id/permissions`

```json
{
  "permissions": [
    { "resource": "contacts", "action": "read", "scope": "TEAM" },
    { "resource": "contacts", "action": "write", "scope": "OWN" }
  ]
}
```
**[CONFIRMADO]**

`scope` aceita `ALL`, `TEAM` ou `OWN`; combinações inválidas devem ser rejeitadas antes de persistir a substituição. **[CONFIRMADO]**

## Chaves de API

### `POST /users/api-keys`

```json
{
  "name": "Integração ERP",
  "scopes": ["companies:read", "contacts:write"],
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```
**[CONFIRMADO]**

A resposta de criação inclui o token completo uma única vez; consultas futuras só podem apresentar metadados não secretos. **[CONFIRMADO]**

## Erros

| Situação | HTTP esperado | Observação |
|---|---:|---|
| Credencial, convite ou reset inválido | `401` ou `400` conforme o fluxo | Não revelar material secreto. **[CONFIRMADO]** |
| Sessão ausente/expirada | `401` | A interface deve voltar ao login. **[CONFIRMADO]** |
| CSRF ausente/divergente | `403` | Aplicável às mutações por sessão. **[CONFIRMADO]** |
| Permissão insuficiente | `403` | Verificação feita na API. **[CONFIRMADO]** |
| Conflito de e-mail ativo | `409` | A regra de unicidade é do domínio. **[CONFIRMADO]** |
| Limite de tentativas | `429` | Login e recuperação possuem proteção própria. **[CONFIRMADO]** |

## Compatibilidade

- Datas são serializadas em ISO-8601 UTC. **[CONFIRMADO]**
- Identificadores persistidos são UUIDs. **[CONFIRMADO]**
- Alterar nomes de cookies, formato de token ou recursos de permissão é uma mudança incompatível e exige migração coordenada de API e web. **[INFERIDO]**
