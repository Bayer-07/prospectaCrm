# Relatórios e webhooks — Contratos

## Convenções

- Prefixo `/api/v1`, envelope `{ data, meta? }`, UUIDs e datas ISO-8601 UTC. **[CONFIRMADO]**
- Operações assíncronas retornam identificador e estado consultável, não aguardam o provedor. **[INFERIDO]**
- Credenciais, hashes e conteúdo secreto nunca aparecem na resposta. **[CONFIRMADO]**

## Operações

- `GET /api/v1/reports/*`. **[CONFIRMADO]**
- `GET/POST/PATCH/DELETE /api/v1/outbound-webhooks`. **[CONFIRMADO]**
- `GET /api/v1/conversations/:id/export.pdf`. **[CONFIRMADO]**

## Estados e erros

- Estado persistido distingue pendência, execução, conclusão, cancelamento/interrupção e falha conforme o recurso. **[CONFIRMADO]**
- `400` para entrada/transição; `401/403` para acesso; `404` para recurso invisível; `409` para conflito; `502/503` para dependência. **[INFERIDO]**

## Compatibilidade

- Alterações de enum, payload de job ou semântica de retry exigem migração coordenada de API, worker e web. **[INFERIDO]**
