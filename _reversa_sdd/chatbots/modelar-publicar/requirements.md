# Modelar e publicar chatbot — Requisitos

## Objetivo

Criar um grafo visual versionado com gatilhos, perguntas, mensagens, condições, espera, IA e transferência. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| CHATBOTS-1-FR-001 | Adicionar, mover, conectar, editar e excluir blocos no mapa visual. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-1-FR-002 | Permitir ciclos válidos sem recursão descontrolada. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-1-FR-003 | Configurar mensagem e atraso em segundos no nó de espera. **[CONFIRMADO]** | Must | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-1-FR-004 | Validar grafo e configurações antes de publicar. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |
| CHATBOTS-1-FR-005 | Excluir chatbot somente mediante permissão e confirmação. **[CONFIRMADO]** | Should | A operação válida produz o estado descrito; falha não deixa efeito parcial. **[INFERIDO]** |

## Regras transversais

- A API verifica organização, permissão e estado atual antes de persistir. **[CONFIRMADO]**
- Processamento assíncrono revalida o banco e tolera entrega repetida. **[CONFIRMADO]**
- A interface não recebe credenciais ou segredos do provedor. **[CONFIRMADO]**

## Aceitação

```gherkin
Cenário: fluxo principal de modelar e publicar chatbot
  Dado que o usuário ou evento possui autorização e dados válidos
  Quando o caso de uso é executado
  Então o resultado é persistido uma única vez
  E a interface recebe somente a atualização necessária
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/chatbots/chatbots.service.ts`, `apps/web/src/pages/Chatbots.tsx`. **[CONFIRMADO]**
