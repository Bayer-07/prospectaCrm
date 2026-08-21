# Convites e recuperação — Design

## Fluxo de convite

```mermaid
sequenceDiagram
  participant A as Administrador
  participant U as UsersService
  participant D as PostgreSQL
  participant E as Mailgun
  participant C as Convidado
  A->>U: POST /users/invite
  U->>D: criar/reativar alvo e Invite com hash
  U->>E: enviar link de 72h
  C->>U: POST /auth/accept-invite
  U->>D: validar hash, expiração e consumo
  U->>D: definir senha, ativar e consumir token
```
**[CONFIRMADO]**

## Fluxo de recuperação

```mermaid
sequenceDiagram
  participant V as Visitante
  participant A as AuthService
  participant D as PostgreSQL
  participant E as Mailgun
  V->>A: POST /auth/forgot-password
  A->>D: localizar usuário elegível
  opt usuário existente
    A->>D: persistir hash com validade de 60m
    A->>E: enviar link
  end
  A-->>V: confirmação genérica
  V->>A: POST /auth/reset-password
  A->>D: trocar hash e revogar sessões em transação
```
**[CONFIRMADO]**

## Segurança

- O URL público usado no e-mail deriva da configuração do ambiente, não de IP fixo no código. **[CONFIRMADO]**
- Tokens enviados ao destinatário são comparados ao material derivado persistido. **[CONFIRMADO]**
- Solicitações de recuperação possuem limitação de tentativas e resposta constante. **[CONFIRMADO]**
- O provedor Mailgun é transacional neste fluxo; campanhas manuais de e-mail usam configuração separada. **[CONFIRMADO]**

## Falhas

- Falha de envio não deve ativar o usuário nem expor o token em logs. **[INFERIDO]**
- Token expirado, consumido ou adulterado encerra o fluxo sem alterar credenciais. **[CONFIRMADO]**
- A recuperação continua indisponível quando o provedor transacional obrigatório não está configurado. **[INFERIDO]**

## Referências

`apps/api/src/auth/auth.service.ts`, `apps/api/src/users/users.service.ts`, integração Mailgun em `apps/api/src/email` e schema Prisma. **[CONFIRMADO]**
