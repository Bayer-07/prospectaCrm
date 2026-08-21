# Usuários e papéis — Requisitos

## Objetivo e regras

Administradores autorizados devem listar, convidar, editar e desativar membros da organização, enquanto cada usuário pode manter seu perfil e preferências sem elevar o próprio acesso. **[CONFIRMADO]**

- Usuários pertencem a uma organização, um papel e opcionalmente uma equipe. **[CONFIRMADO]**
- Permissões são combinações de recurso, ação e escopo `ALL`, `TEAM` ou `OWN`. **[CONFIRMADO]**
- Rotas administrativas exigem `users:read` ou `users:write`; criar chave exige `api_keys:write`. **[CONFIRMADO]**
- Desativação é lógica e um e-mail de usuário removido pode voltar a ser usado conforme a regra já implementada. **[CONFIRMADO]**
- Alterar o próprio perfil não permite alterar papel ou equipe. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| USERS-FR-001 | Listar membros e metadados de acesso. **[CONFIRMADO]** | Must | A resposta respeita organização e permissão de leitura. **[CONFIRMADO]** |
| USERS-FR-002 | Editar nome, e-mail, papel e equipe de outro usuário. **[CONFIRMADO]** | Must | A mudança é validada, persistida e auditada. **[CONFIRMADO]** |
| USERS-FR-003 | Desativar um membro sem apagar histórico. **[CONFIRMADO]** | Must | Login deixa de funcionar e referências permanecem. **[CONFIRMADO]** |
| USERS-FR-004 | Substituir permissões de um papel. **[CONFIRMADO]** | Must | Todas as entradas válidas passam a definir o acesso efetivo. **[CONFIRMADO]** |
| USERS-FR-005 | Editar o próprio perfil e assinatura. **[CONFIRMADO]** | Should | Apenas campos permitidos mudam. **[CONFIRMADO]** |
| USERS-FR-006 | Adicionar, visualizar e remover foto pessoal. **[CONFIRMADO]** | Should | O ativo de mídia válido é associado e servido por URL temporária. **[CONFIRMADO]** |

## Aceitação

```gherkin
Cenário: SDR tenta editar papel sem permissão
  Dado que o usuário não possui users:write
  Quando ele envia PATCH /api/v1/users/{id}
  Então a API responde 403
  E o papel permanece inalterado
```
**[CONFIRMADO]**

```gherkin
Cenário: administrador desativa usuário
  Dado que o administrador possui users:write
  Quando ele exclui logicamente um membro ativo
  Então o membro não consegue mais autenticar
  E atividades históricas continuam relacionadas ao seu identificador
```
**[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/users/users.controller.ts`, `users.service.ts`, `apps/api/src/auth/permission.guard.ts`, `packages/database/prisma/schema.prisma` e telas de usuários/perfil em `apps/web/src`. **[CONFIRMADO]**
