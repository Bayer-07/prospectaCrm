# Chaves de API — Requisitos

## Objetivo e regras

Permitir que integrações externas acessem somente operações públicas autorizadas do CRM e MCP por uma chave revogável, nomeada e auditável. **[CONFIRMADO]**

- Apenas usuários com `api_keys:write` podem criar chaves. **[CONFIRMADO]**
- O token usa prefixo `pk_`; a autenticação persiste e consulta somente seu hash. **[CONFIRMADO]**
- A chave possui nome, escopos, expiração opcional e registro de último uso. **[CONFIRMADO]**
- O segredo completo é mostrado somente no retorno da criação. **[CONFIRMADO]**
- O guard limita chaves às rotas de empresas, contatos, oportunidades, pipelines, tarefas, tags, campos personalizados, segmentos e MCP. **[CONFIRMADO]**
- Criações externas sensíveis podem exigir `Idempotency-Key`. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| KEY-FR-001 | Criar chave com nome e escopos. **[CONFIRMADO]** | Must | Token único é devolvido uma vez e hash é persistido. **[CONFIRMADO]** |
| KEY-FR-002 | Rejeitar chave inexistente, revogada ou expirada. **[CONFIRMADO]** | Must | A requisição retorna `401` sem executar o controller. **[CONFIRMADO]** |
| KEY-FR-003 | Restringir operações aos escopos da chave. **[CONFIRMADO]** | Must | Recurso/ação não concedido retorna `403`. **[CONFIRMADO]** |
| KEY-FR-004 | Restringir a superfície de rotas externas. **[CONFIRMADO]** | Must | Uma chave válida não acessa usuários, campanhas, conexões ou mensagens diretas. **[CONFIRMADO]** |
| KEY-FR-005 | Registrar último uso sem escrever a cada chamada. **[CONFIRMADO]** | Should | Atualização é limitada por janela de cinco minutos e cache. **[CONFIRMADO]** |

## Aceitação

```gherkin
Cenário: integração cria contato de forma idempotente
  Dado que a chave possui contacts:write
  E a requisição possui Idempotency-Key ainda não usado
  Quando ela cria um contato pela API pública
  Então uma única resposta é persistida
  E repetir a mesma requisição devolve o resultado compatível sem duplicar o contato
```
**[CONFIRMADO]**

```gherkin
Cenário: chave tenta iniciar campanha
  Dado que a chave é válida
  Quando ela acessa uma rota de campanhas
  Então o guard rejeita a rota externa
  E nenhum disparo é criado
```
**[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/users/users.service.ts`, `apps/api/src/auth/auth.guard.ts`, `apps/api/src/common/idempotency.interceptor.ts`, `apps/api/src/swagger/public-api-document.ts`, modelo `ApiKey`. **[CONFIRMADO]**
