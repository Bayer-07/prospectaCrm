# Retenção de mídia — Requisitos

## Objetivo

Remover ativos expirados conforme política sem apagar consentimento, auditoria ou métricas essenciais. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| MIDIA_TRANSCRICAO-4-FR-001 | Calcular expiração pela política configurada e tipo de ativo. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-4-FR-002 | Excluir objeto e atualizar estado persistido de forma reconciliável. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-4-FR-003 | Não apagar mídia ainda vinculada a retenção legal ou processo ativo. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-4-FR-004 | Executar limpeza em lote pequeno e indexado. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| MIDIA_TRANSCRICAO-4-FR-005 | Registrar falhas e retomar sem varrer toda a tabela em memória. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de retenção de mídia
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/maintenance.processor.ts`, `apps/worker/src/storage.ts`. **[CONFIRMADO]**
