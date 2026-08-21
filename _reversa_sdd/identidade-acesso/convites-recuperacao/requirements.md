# Convites e recuperação — Requisitos

## Objetivo e regras

Permitir entrada controlada de novos membros e recuperação de senha por links temporários enviados por e-mail, sem revelar a existência de contas. **[CONFIRMADO]**

- Somente quem possui `users:write` pode criar convite ou link administrativo de redefinição. **[CONFIRMADO]**
- Convites manuais vencem após 72 horas; redefinições vencem após 60 minutos. **[CONFIRMADO]**
- O token é de uso único e não deve ser persistido em texto puro. **[CONFIRMADO]**
- A senha definida deve conter pelo menos cinco caracteres. **[CONFIRMADO]**
- `forgot-password` devolve confirmação genérica mesmo quando o endereço não existe. **[CONFIRMADO]**
- A troca de senha invalida sessões anteriores do usuário. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| ACCESS-FR-001 | Criar e enviar convite a um e-mail. **[CONFIRMADO]** | Must | Registro temporário e mensagem transacional são gerados. **[CONFIRMADO]** |
| ACCESS-FR-002 | Aceitar convite válido. **[CONFIRMADO]** | Must | Usuário é ativado e token consumido atomicamente. **[CONFIRMADO]** |
| ACCESS-FR-003 | Solicitar recuperação sem enumerar conta. **[CONFIRMADO]** | Must | A resposta externa é constante e envio ocorre apenas quando aplicável. **[CONFIRMADO]** |
| ACCESS-FR-004 | Redefinir senha com token válido. **[CONFIRMADO]** | Must | Hash é atualizado, token consumido e sessões revogadas. **[CONFIRMADO]** |
| ACCESS-FR-005 | Gerar link de reset por administrador. **[CONFIRMADO]** | Should | O link expira em uma hora e a operação é auditada. **[CONFIRMADO]** |

## Aceitação

```gherkin
Cenário: convite expirado
  Dado que o convite foi emitido há mais de 72 horas
  Quando o destinatário tenta aceitá-lo
  Então a API rejeita o token
  E o usuário não é ativado
```
**[CONFIRMADO]**

```gherkin
Cenário: redefinição bem-sucedida
  Dado que existe um token de redefinição vigente e não consumido
  Quando o usuário envia uma senha válida
  Então a senha é substituída
  E todas as sessões anteriores deixam de autenticar
  E o token não pode ser reutilizado
```
**[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/auth/auth.controller.ts`, `auth.service.ts`, `apps/api/src/users/users.controller.ts`, `users.service.ts`, modelos `Invite` e `PasswordResetToken`. **[CONFIRMADO]**
