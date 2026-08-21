# API externa e MCP — Contratos

## Fronteiras

- Entradas externas atravessam proxy e autenticação antes do domínio. **[CONFIRMADO]**
- Serviços internos usam DNS da rede Docker e não publicam portas sem necessidade operacional. **[CONFIRMADO]**
- Configurações obrigatórias ausentes interrompem o serviço ou recurso de forma explícita. **[CONFIRMADO]**

## Interfaces

- `GET/POST/PATCH /api/v1/companies`. **[CONFIRMADO]**
- `GET/POST/PATCH /api/v1/contacts`. **[CONFIRMADO]**
- `GET/POST/PATCH /api/v1/opportunities`. **[CONFIRMADO]**
- `GET/POST/PATCH /api/v1/tasks`. **[CONFIRMADO]**
- `GET/POST/PATCH /api/v1/tags`. **[CONFIRMADO]**
- `GET/POST/PATCH /api/v1/custom-fields`. **[CONFIRMADO]**
- `GET/POST/PATCH /api/v1/segments`. **[CONFIRMADO]**
- `GET/POST /api/v1/mcp/*`. **[CONFIRMADO]**
- `POST /mcp`. **[CONFIRMADO]**

## Compatibilidade

- Mudanças de rota, porta, variável, volume, payload ou ferramenta anunciada exigem atualização coordenada de consumidores e documentação. **[INFERIDO]**
- Segredos são valores de implantação, nunca defaults funcionais do contrato. **[CONFIRMADO]**
