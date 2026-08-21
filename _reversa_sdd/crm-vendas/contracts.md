# CRM e vendas — Contratos

## Convenções

- Prefixo `/api/v1`, envelope `{ data, meta? }`, UUIDs e datas ISO-8601 UTC. **[CONFIRMADO]**
- Listagens volumosas usam `limit` e `cursor`, retornando `meta.nextCursor` quando há próxima página. **[CONFIRMADO]**
- Criações externas sensíveis exigem `Idempotency-Key`; telefones são normalizados para E.164 e valores para centavos. **[CONFIRMADO]**

## Recursos

- `GET/POST /api/v1/companies`. **[CONFIRMADO]**
- `GET/PATCH/DELETE /api/v1/companies/:id`. **[CONFIRMADO]**
- `GET/POST /api/v1/contacts`. **[CONFIRMADO]**
- `GET/PATCH/DELETE /api/v1/contacts/:id`. **[CONFIRMADO]**
- `GET/POST /api/v1/opportunities`. **[CONFIRMADO]**
- `GET/PATCH/DELETE /api/v1/opportunities/:id`. **[CONFIRMADO]**
- `GET /api/v1/pipelines`. **[CONFIRMADO]**
- `GET/POST/PATCH/DELETE /api/v1/tasks`. **[CONFIRMADO]**
- `GET/POST /api/v1/tags`. **[CONFIRMADO]**
- `GET/POST /api/v1/custom-fields`. **[CONFIRMADO]**
- `GET/POST /api/v1/segments`. **[CONFIRMADO]**

## Campos centrais

- Empresa: `id`, `externalId?`, `cnpj?`, `name`, `domain?`, `industry?`, `size?`, endereço, `linkedinUrl?`, logo, responsável, equipe, tags e campos personalizados. **[CONFIRMADO]**
- Contato: `id`, `externalId?`, `name`, `jobTitle?`, `email?`, `phone?`, empresa, responsável, origem, `campaignsBlocked` e campos personalizados. **[CONFIRMADO]**
- Oportunidade: `id`, empresa/contatos, funil, etapa, valor em centavos, probabilidade, fechamento previsto, responsáveis, origem, perda e proposta. **[CONFIRMADO]**
- Tarefa: `id`, título, descrição, início/fim, responsável, estado, vínculos CRM e origem de follow-up quando aplicável. **[CONFIRMADO]**

## Erros

- `400` para payload ou transição inválida, `401` para autenticação ausente, `403` para permissão/escopo, `404` para registro invisível e `409` para conflito de deduplicação. **[CONFIRMADO]**

## Compatibilidade

- Alterar normalização de telefone, cursores ou interpretação de valores exige migração e testes contratuais. **[INFERIDO]**
