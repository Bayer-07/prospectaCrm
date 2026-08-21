# Shutdown e operação — Requisitos

## Objetivo

Encerrar API e worker sem abandonar job em estado enganoso ou corromper conexões. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| PLATAFORMA_ASSINCRONA-3-FR-001 | Responder a sinais de encerramento e parar novos consumos. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-3-FR-002 | Fechar workers, queues, Redis e clientes externos na ordem segura. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-3-FR-003 | Permitir que job não concluído volte a ser processável. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-3-FR-004 | Expor healthchecks independentes para serviços críticos. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-3-FR-005 | Manter CRM operável quando um processor opcional estiver desabilitado. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de shutdown e operação
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/main.ts`, `apps/api/src/main.ts`, `docker-compose.yml`. **[CONFIRMADO]**
