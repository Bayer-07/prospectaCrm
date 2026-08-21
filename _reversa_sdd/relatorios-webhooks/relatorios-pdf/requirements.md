# Relatórios e PDF — Requisitos

## Objetivo

Consolidar métricas comerciais e exportar documentos PDF legíveis e escopados. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| RELATORIOS_WEBHOOKS-1-FR-001 | Calcular funil, conversão, receita, perdas, ciclo, produtividade, atendimento e campanha. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-1-FR-002 | Aplicar escopo de dados uniformemente em todas as consultas. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-1-FR-003 | Exportar relatório em PDF, não CSV, pela interface. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-1-FR-004 | Exportar apenas o atendimento atual/mais recente de uma conversa. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| RELATORIOS_WEBHOOKS-1-FR-005 | Transcrever áudios necessários e preservar quebras de linha no PDF. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de relatórios e pdf
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/reports/reports.service.ts`, `apps/api/src/integrations/conversation-pdf.ts`. **[CONFIRMADO]**
