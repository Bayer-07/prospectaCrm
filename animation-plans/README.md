# Planos de animação do BZS One

| Plano | Título | Severidade | Status |
| --- | --- | --- | --- |
| 001 | Materializar superfícies flutuantes | HIGH | DONE |
| 002 | Orquestrar o primeiro carregamento | MEDIUM | DONE |
| 003 | Refinar feedback de estados | HIGH | DONE |
| 004 | Dar física ao drag and drop | HIGH | DONE |
| 005 | Animar feedback vivo do Inbox | MEDIUM | DONE |

## Ordem recomendada

1. `001`: estabelece as entradas e origens usadas pelas superfícies.
2. `003`: consolida feedback e propriedades performáticas.
3. `004`: melhora o gesto mais físico do produto.
4. `005`: aplica feedback assíncrono específico do Inbox.
5. `002`: adiciona a coreografia final de primeiro carregamento.

Todos dependem dos tokens `--ease-out`, `--ease-in-out` e `--ease-drawer` já existentes em `apps/web/src/apple-ui.css`. Nenhum plano adiciona dependências ou modifica regras de negócio.
