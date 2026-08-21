# Fluxos — API externa e servidor MCP

Escala: 🟢 confirmado pelo código | 🟡 inferido | 🔴 lacuna.

## Autenticação por chave e autorização

```mermaid
flowchart TD
    A[Cliente envia Bearer pk_] --> B[Calcula SHA-256]
    B --> C[Busca ApiKey pelo hash]
    C --> D{Existe, não expirou e não foi revogada?}
    D -- Não --> E[401]
    D -- Sim --> F{Rota pertence à API pública?}
    F -- Não --> G[403]
    F -- Sim --> H[Converte escopos em permissões]
    H --> I[Executa serviço com organizationId da chave]
    I --> J[Atualiza lastUsedAt no máximo a cada 5 min]
```

## Criação externa idempotente

```mermaid
flowchart TD
    A[POST comercial por API key] --> B{Idempotency-Key válida?}
    B -- Não --> C[400]
    B -- Sim --> D[Hash do corpo e busca organização/chave/rota]
    D --> E{Registro existe?}
    E -- Sim, mesmo hash --> F[Reproduz código e corpo armazenados]
    E -- Sim, hash diferente --> G[409 conflito]
    E -- Não --> H[Executa criação ou upsert por externalId]
    H --> I[Persiste resposta por 24 h]
```

## Sessão MCP e registro de ferramentas

```mermaid
flowchart TD
    A[Cliente conecta em /mcp] --> B[Valida Host e Origin]
    B --> C[Exige Bearer pk_]
    C --> D[API valida /mcp/context]
    D --> E[Cria servidor Streamable HTTP stateless]
    E --> F[Registra somente ferramentas cobertas pelos escopos]
    F --> G[LLM chama ferramenta]
    G --> H[Zod valida entrada]
    H --> I[Cliente MCP chama /api/v1]
    I --> J[Retorna texto JSON e structuredContent]
```

