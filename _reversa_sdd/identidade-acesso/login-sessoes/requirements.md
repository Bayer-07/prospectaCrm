# Login e sessões — Requisitos

## Objetivo

Permitir que usuários ativos acessem o BZS One por e-mail e senha, compartilhem a autenticação entre abas e percam o acesso imediatamente quando a sessão expirar ou for encerrada. **[CONFIRMADO]**

## Regras

- O e-mail é normalizado antes da busca e a senha é comparada por Argon2. **[CONFIRMADO]**
- Usuário ausente, inativo ou com senha inválida recebe uma resposta equivalente. **[CONFIRMADO]**
- Após cinco falhas em quinze minutos, novas tentativas são temporariamente limitadas. **[CONFIRMADO]**
- A sessão expira em sete dias e possui um token CSRF próprio. **[CONFIRMADO]**
- Logout revoga o registro de sessão e limpa os cookies. **[CONFIRMADO]**
- Uma resposta `401` em carregamento protegido deve invalidar a sessão visual em qualquer aba afetada. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| LOGIN-FR-001 | Autenticar credenciais válidas. **[CONFIRMADO]** | Must | Sessão persistida, cookies gravados e expiração retornada. **[CONFIRMADO]** |
| LOGIN-FR-002 | Rejeitar credenciais inválidas sem enumerar contas. **[CONFIRMADO]** | Must | Mensagem e status não distinguem a causa sensível. **[CONFIRMADO]** |
| LOGIN-FR-003 | Limitar tentativas abusivas. **[CONFIRMADO]** | Must | A sexta tentativa dentro da janela é bloqueada. **[CONFIRMADO]** |
| LOGIN-FR-004 | Autorizar mutações somente com CSRF compatível. **[CONFIRMADO]** | Must | Token ausente ou divergente impede a operação. **[CONFIRMADO]** |
| LOGIN-FR-005 | Encerrar a sessão atual. **[CONFIRMADO]** | Must | O token deixa de autenticar e os cookies expiram. **[CONFIRMADO]** |
| LOGIN-FR-006 | Restaurar o contexto após recarregar a página. **[CONFIRMADO]** | Must | `GET /auth/me` recompõe usuário, equipe, papel e permissões. **[CONFIRMADO]** |

## Não funcionais

- O token de sessão deve ficar em cookie `HttpOnly`; o navegador não deve guardá-lo em `localStorage`. **[CONFIRMADO]**
- Consultas repetidas podem usar cache local limitado, sem estender a expiração persistida. **[CONFIRMADO]**
- O fluxo deve funcionar em HTTPS em produção e aceitar o proxy interno configurado. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: duas abas usam a mesma sessão
  Dado que o usuário fez login na primeira aba
  Quando ele abre uma segunda aba na mesma origem
  Então a segunda aba recupera o contexto em /auth/me
  E não solicita novo login enquanto a sessão estiver válida
```
**[CONFIRMADO]**

```gherkin
Cenário: sessão expirada
  Dado que o cookie referencia uma sessão expirada
  Quando qualquer aba solicita um recurso protegido
  Então a API responde 401
  E a interface remove os dados protegidos e mostra o login
```
**[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/auth/auth.controller.ts`, `auth.service.ts`, `auth.guard.ts`, `auth-cookies.ts`, `auth-cache.service.ts`; `apps/web/src/auth/**` e `apps/web/src/pages/Login.tsx`. **[CONFIRMADO]**
