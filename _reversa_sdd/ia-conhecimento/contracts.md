# IA e conhecimento — Contratos

## Convenções

- Prefixo `/api/v1`, envelope `{ data, meta? }`, UUIDs e datas ISO-8601 UTC. **[CONFIRMADO]**
- Operações assíncronas retornam identificador e estado consultável, não aguardam o provedor. **[INFERIDO]**
- Credenciais, hashes e conteúdo secreto nunca aparecem na resposta. **[CONFIRMADO]**

## Operações

- `GET/PATCH /api/v1/settings/ai`. **[CONFIRMADO]**
- `POST /api/v1/settings/ai/test`. **[CONFIRMADO]**
- `POST /api/v1/conversations/:id/ai/generations`. **[CONFIRMADO]**
- `GET /api/v1/conversations/:id/ai/generations/:generationId`. **[CONFIRMADO]**
- `GET /api/v1/conversations/:id/ai/summaries/latest`. **[CONFIRMADO]**
- `GET/PATCH /api/v1/ai/knowledge-documents`. **[CONFIRMADO]**

## Estados e erros

- Estado persistido distingue pendência, execução, conclusão, cancelamento/interrupção e falha conforme o recurso. **[CONFIRMADO]**
- `400` para entrada/transição; `401/403` para acesso; `404` para recurso invisível; `409` para conflito; `502/503` para dependência. **[INFERIDO]**

## Compatibilidade

- Alterações de enum, payload de job ou semântica de retry exigem migração coordenada de API, worker e web. **[INFERIDO]**
