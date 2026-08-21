# Reconciliação e manutenção — Requisitos

## Objetivo

Recuperar trabalhos ausentes e limpar dados expirados por consultas indexadas em lotes pequenos. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| PLATAFORMA_ASSINCRONA-2-FR-001 | Executar reconciliadores na inicialização e em intervalo delimitado. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-2-FR-002 | Selecionar somente estados/horários elegíveis por índice. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-2-FR-003 | Recriar job sem duplicar o efeito. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-2-FR-004 | Limpar mídia e registros efêmeros conforme retenção. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| PLATAFORMA_ASSINCRONA-2-FR-005 | Registrar erro e continuar o próximo lote sem varrer toda a base. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de reconciliação e manutenção
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/maintenance.processor.ts`, `apps/worker/src/follow-up.processor.ts`, `apps/worker/src/main.ts`. **[CONFIRMADO]**
