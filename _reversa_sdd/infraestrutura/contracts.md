# Infraestrutura e implantação — Contratos

## Fronteiras

- Entradas externas atravessam proxy e autenticação antes do domínio. **[CONFIRMADO]**
- Serviços internos usam DNS da rede Docker e não publicam portas sem necessidade operacional. **[CONFIRMADO]**
- Configurações obrigatórias ausentes interrompem o serviço ou recurso de forma explícita. **[CONFIRMADO]**

## Interfaces

- `HTTP/HTTPS web e /api via Caddy/Nginx`. **[CONFIRMADO]**
- `MCP interno :3100`. **[CONFIRMADO]**
- `Evolution interno :8080`. **[CONFIRMADO]**
- `PostgreSQL :5432 interno`. **[CONFIRMADO]**
- `Redis :6379 interno`. **[CONFIRMADO]**
- `MinIO :9000 interno/loopback configurável`. **[CONFIRMADO]**
- `Speaches interno :8000`. **[CONFIRMADO]**

## Compatibilidade

- Mudanças de rota, porta, variável, volume, payload ou ferramenta anunciada exigem atualização coordenada de consumidores e documentação. **[INFERIDO]**
- Segredos são valores de implantação, nunca defaults funcionais do contrato. **[CONFIRMADO]**
