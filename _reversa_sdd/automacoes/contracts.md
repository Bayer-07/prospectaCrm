# Automações — Contratos

## Convenções

- Prefixo interno `/api/v1`, envelope `{ data, meta? }`, UUID e datas ISO-8601 UTC. **[CONFIRMADO]**
- Mutações humanas exigem sessão e CSRF; integrações públicas usam chave escopada quando expostas. **[CONFIRMADO]**
- Estados, IDs de provedor e motivos de falha são persistidos para idempotência e suporte. **[CONFIRMADO]**

## Operações

- `GET/POST /api/v1/workflows`. **[CONFIRMADO]**
- `GET/PATCH/DELETE /api/v1/workflows/:id`. **[CONFIRMADO]**
- `POST /api/v1/workflows/:id/publish`. **[CONFIRMADO]**
- `POST /api/v1/workflows/:id/start`. **[CONFIRMADO]**
- `POST /api/v1/workflows/:id/pause`. **[CONFIRMADO]**
- `POST /api/v1/workflows/:id/archive`. **[CONFIRMADO]**

## Eventos

- Eventos de domínio carregam identificador, tipo, horário e referência à entidade; o consumidor busca detalhes quando necessário. **[INFERIDO]**
- Eventos externos repetidos devem resultar no mesmo estado interno. **[CONFIRMADO]**

## Erros

- `400` entrada/transição inválida; `401` autenticação; `403` permissão; `404` entidade invisível; `409` conflito; `502/503` falha ou indisponibilidade de provedor. **[INFERIDO]**

## Compatibilidade

- Alterar enum, identificador de provedor ou semântica de estado exige migração coordenada de banco, API, worker e web. **[INFERIDO]**
