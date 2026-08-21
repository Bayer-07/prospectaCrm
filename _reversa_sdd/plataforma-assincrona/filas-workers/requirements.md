# Filas e workers — Requisitos

## Objetivo

Distribuir jobs pequenos por domínio com concorrência, retry e identificadores previsíveis. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| PLATAFORMA_ASSINCRONA-1-FR-001 | Separar filas por finalidade e prioridade. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-1-FR-002 | Usar jobId determinístico ou dedupe persistente. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-1-FR-003 | Configurar retry/backoff por tipo de falha. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-1-FR-004 | Remover jobs antigos sem apagar histórico do banco. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-1-FR-005 | Evitar carregar módulos e clientes externos antes do primeiro uso quando desnecessário. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de filas e workers
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/main.ts`, `apps/api/src/queue/queue.module.ts`. **[CONFIRMADO]**
