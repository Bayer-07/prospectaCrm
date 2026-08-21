# Criar audiência — Requisitos

## Objetivo

Selecionar contatos por busca ou importar CSV, validar destinatários e congelar a audiência da campanha. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CAMPANHAS_EMAIL-1-FR-001 | Selecionar todos os resultados da pesquisa, não apenas a página visível. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-1-FR-002 | Importar CSV por seletor ou arrastar e soltar sem limite artificial no navegador. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-1-FR-003 | Exibir contatos válidos, inválidos, duplicados e bloqueados antes do início. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-1-FR-004 | Baixar modelo padrão de CSV. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CAMPANHAS_EMAIL-1-FR-005 | Manter mensagem individual importada ou sequência editável para contatos da agenda. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de criar audiência
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/campaigns/campaigns.service.ts`, `apps/web/src/pages/Campaigns.tsx`. **[CONFIRMADO]**
