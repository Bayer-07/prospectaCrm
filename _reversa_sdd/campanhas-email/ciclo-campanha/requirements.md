# Ciclo da campanha — Requisitos

## Objetivo

Controlar rascunho, agendamento, execução, pausa, retomada, cancelamento, falha e conclusão sem duplicar envios. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CAMPANHAS_EMAIL-4-FR-001 | Iniciar somente com permissão campaigns.launch e audiência válida. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-4-FR-002 | Agendar e recuperar execução após reinício. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-4-FR-003 | Pausar sem perder posição e retomar sem repetir destinatário concluído. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-4-FR-004 | Considerar ignorado como destinatário concluído para fechar a campanha. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-4-FR-005 | Cancelar jobs restantes e preservar histórico por contato. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de ciclo da campanha
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/campaigns/campaigns.service.ts`, `apps/worker/src/campaign.processor.ts`. **[CONFIRMADO]**
