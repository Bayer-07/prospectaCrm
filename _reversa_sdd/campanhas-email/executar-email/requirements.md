# Executar campanha de e-mail — Requisitos

## Objetivo

Enviar campanhas manuais pelo Gmail SMTP com conteúdo e audiência selecionados. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CAMPANHAS_EMAIL-3-FR-001 | Exigir configuração SMTP Gmail válida para envio manual. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-3-FR-002 | Permitir selecionar contatos pesquisados por e-mail. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-3-FR-003 | Registrar destinatário, tentativa, envio, falha e resposta quando detectável. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-3-FR-004 | Excluir contatos com campanhas bloqueadas ou e-mail inválido. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-3-FR-005 | Nunca usar Gmail para convites, resets e resumos de tarefas. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de executar campanha de e-mail
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/worker/src/email-campaign.processor.ts`, `apps/api/src/email`, `apps/web/src/pages/EmailCampaigns.tsx`. **[CONFIRMADO]**
