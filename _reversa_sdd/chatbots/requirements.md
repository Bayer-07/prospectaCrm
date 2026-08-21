# Chatbots — Requisitos

## Visão geral

Modelar e publicar fluxos conversacionais por regras ou OpenAI, executados automaticamente antes do atendimento humano. **[CONFIRMADO]**

## Regras de negócio

1. Rascunhos são editáveis e versões publicadas são imutáveis. **[CONFIRMADO]**
2. Ciclos são aceitos pelo motor quando permanecem controlados pelo estado da sessão. **[CONFIRMADO]**
3. Chatbots por regras e OpenAI compartilham o contrato de handoff, sem alterar chatbots existentes. **[CONFIRMADO]**
4. Assumir a conversa por humano interrompe geração automática pendente. **[CONFIRMADO]**
5. Falha, baixa confiança ou limite de interações encaminha o atendimento. **[CONFIRMADO]**
6. Nós de espera são persistentes e expressos em segundos. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CHATBOTS-FR-001 | Criar um grafo visual versionado com gatilhos, perguntas, mensagens, condições, espera, IA e transferência. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CHATBOTS-FR-002 | Consumir mensagens recebidas, avançar a sessão determinística e enviar a resposta configurada uma única vez. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CHATBOTS-FR-003 | Executar pré-atendimento com atrasos e OpenAI, transferindo de forma segura quando a automação não deve continuar. **[CONFIRMADO]** | Must | O caso autorizado conclui sem duplicar efeitos e preserva o histórico. **[INFERIDO]** |
| CHATBOTS-FR-099 | Aplicar autenticação, permissão, escopo e idempotência em toda operação sensível. **[CONFIRMADO]** | Must | Acesso indevido ou repetição não produz efeito comercial extra. **[CONFIRMADO]** |

## Requisitos não funcionais

- Trabalho externo ou demorado é executado por fila; a API e a interface não aguardam processamento pesado. **[CONFIRMADO]**
- Estado persistido no PostgreSQL é a fonte de verdade e Redis coordena jobs efêmeros. **[CONFIRMADO]**
- Eventos Socket.IO atualizam somente entidades afetadas. **[INFERIDO]**
- Falhas guardam motivo operacional sem expor segredo de provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: executar chatbots sem duplicidade
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

`apps/api/src/chatbots/chatbots.controller.ts`, `apps/api/src/chatbots/chatbots.service.ts`, `apps/worker/src/chatbot.processor.ts`, `apps/web/src/pages/Chatbots.tsx`, `apps/web/src/pages/ChatbotBuilder.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
