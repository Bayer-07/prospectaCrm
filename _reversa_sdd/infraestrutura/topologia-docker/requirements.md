# Topologia Docker — Requisitos

## Objetivo

Subir serviços com dependências, healthchecks, redes e volumes coerentes. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INFRAESTRUTURA-1-FR-001 | Construir web, API, worker e MCP a partir do monorepo. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-1-FR-002 | Subir PostgreSQL, Redis, MinIO, Evolution e Speaches isolados. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-1-FR-003 | Aguardar healthchecks/dependências antes de iniciar consumidores. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-1-FR-004 | Executar init de ownership antes da Evolution não-root. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-1-FR-005 | Persistir dados em volumes nomeados sem removê-los no rebuild. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de topologia docker
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`docker-compose.yml`, `infra/evolution/Dockerfile`. **[CONFIRMADO]**
