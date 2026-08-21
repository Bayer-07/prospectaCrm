# Respostas rápidas — Contratos

## Convenções

- Prefixo `/api/v1`, envelope `{ data, meta? }`, UUIDs e datas ISO-8601 UTC. **[CONFIRMADO]**
- Operações assíncronas retornam identificador e estado consultável, não aguardam o provedor. **[INFERIDO]**
- Credenciais, hashes e conteúdo secreto nunca aparecem na resposta. **[CONFIRMADO]**

## Operações

- `GET/POST /api/v1/quick-replies`. **[CONFIRMADO]**
- `GET/PATCH/DELETE /api/v1/quick-replies/:id`. **[CONFIRMADO]**

## Estados e erros

- Estado persistido distingue pendência, execução, conclusão, cancelamento/interrupção e falha conforme o recurso. **[CONFIRMADO]**
- `400` para entrada/transição; `401/403` para acesso; `404` para recurso invisível; `409` para conflito; `502/503` para dependência. **[INFERIDO]**

## Compatibilidade

- Alterações de enum, payload de job ou semântica de retry exigem migração coordenada de API, worker e web. **[INFERIDO]**
