# Executar campanha WhatsApp — Requisitos

## Objetivo

Enviar sequências por uma conexão escolhida com controle de ritmo, aquecimento, pausa e conclusão idempotente. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CAMPANHAS_EMAIL-2-FR-001 | Validar presença no WhatsApp antes do disparo. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-2-FR-002 | Executar duas ou mais campanhas simultâneas sem misturar destinatários. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-2-FR-003 | Aplicar atrasos entre mensagens, contatos e lotes. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-2-FR-004 | Contar enviados, respondidos, falhos, ignorados e faltantes de forma consistente. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-2-FR-005 | Permitir baixar CSV de números ignorados por não terem WhatsApp. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de executar campanha whatsapp
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/campaigns/campaigns.service.ts`, `apps/worker/src/campaign.processor.ts`. **[CONFIRMADO]**
