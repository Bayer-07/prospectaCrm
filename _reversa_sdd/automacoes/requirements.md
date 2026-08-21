# Automações — Requisitos

## Visão geral

Modelar, publicar e executar workflows versionados para contatos, com gatilhos, condições, esperas e ações de CRM ou WhatsApp. **[CONFIRMADO]**

## Regras de negócio

1. O construtor representa um grafo acíclico para automações, diferente dos ciclos deliberados de chatbot. **[CONFIRMADO]**
2. Versões publicadas são imutáveis e execuções em curso permanecem na versão original. **[CONFIRMADO]**
3. Iniciar manualmente pelo chat com @ cria nova execução para o contato a cada solicitação. **[CONFIRMADO]**
4. Ações de WhatsApp usam mensagem configurada, variáveis e assinatura do usuário quando habilitada. **[CONFIRMADO]**
5. Esperas persistem em segundos e retomam após reinício. **[CONFIRMADO]**
6. Opt-out, perda de consentimento e resposta interrompem próximos envios aplicáveis. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| AUTOMACOES-FR-001 | Criar um grafo versionado de gatilhos, condições e ações sem ciclos. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| AUTOMACOES-FR-002 | Criar execução vinculada a um contato por gatilho ou comando manual, respeitando a política de reentrada. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| AUTOMACOES-FR-003 | Executar nós pequenos e idempotentes, persistindo espera, ramificação e efeitos antes de avançar. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| AUTOMACOES-FR-099 | Aplicar autenticação, permissão, escopo e idempotência em toda operação sensível. **[CONFIRMADO]** | Must | Acesso indevido ou repetição não produz efeito comercial extra. **[CONFIRMADO]** |

## Requisitos não funcionais

- Trabalho externo ou demorado é executado por fila; a API e a interface não aguardam processamento pesado. **[CONFIRMADO]**
- Estado persistido no PostgreSQL é a fonte de verdade e Redis coordena jobs efêmeros. **[CONFIRMADO]**
- Eventos Socket.IO atualizam somente entidades afetadas. **[INFERIDO]**
- Falhas guardam motivo operacional sem expor segredo de provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: executar automações sem duplicidade
  Dado que a operação está autorizada e possui identificador idempotente
  Quando o mesmo evento é entregue novamente
  Então o estado persistido permanece consistente
  E nenhum efeito externo é repetido indevidamente
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, casos de uso, autorização, persistência, idempotência e histórico descritos neste módulo. **[CONFIRMADO]**
- **Should:** atualizações em tempo real e diagnósticos acionáveis. **[INFERIDO]**
- **Could:** métricas operacionais adicionais por provedor. **[A VALIDAR]**
- **Won’t:** permitir que credenciais externas cheguem ao navegador. **[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/workflows/workflows.controller.ts`, `apps/api/src/workflows/workflows.service.ts`, `apps/worker/src/workflow.processor.ts`, `apps/web/src/pages/Workflows.tsx`, `apps/web/src/pages/WorkflowBuilder.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
