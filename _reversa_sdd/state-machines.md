# Máquinas de estado — BZS One

> Estados reconstruídos do schema, serviços e testes em 2026-08-21.  
> 🟢 confirmado; 🟡 inferido; 🔴 lacuna.

## 1. Usuário

```mermaid
stateDiagram-v2
  [*] --> INVITED: convite criado
  INVITED --> ACTIVE: senha definida / convite aceito
  ACTIVE --> SUSPENDED: administrador suspende
  INVITED --> SUSPENDED: administrador suspende
  SUSPENDED --> ACTIVE: administrador reativa
  ACTIVE --> [*]: arquivamento lógico
  INVITED --> [*]: arquivamento lógico
  SUSPENDED --> [*]: arquivamento lógico
```

| Origem | Destino | Gatilho / guarda | Efeitos | Confiança |
|---|---|---|---|---|
| inexistente | `INVITED` | criação de usuário sem ativação imediata | token de convite; e-mail transacional pendente | 🟢 |
| `INVITED` | `ACTIVE` | aceite com token válido e senha mínima | invalida convite e permite sessão | 🟢 |
| `ACTIVE`/`INVITED` | `SUSPENDED` | alteração administrativa | sessões deixam de autenticar | 🟢 |
| `SUSPENDED` | `ACTIVE` | reativação administrativa | login volta a ser elegível | 🟢 |
| qualquer | arquivado | exclusão lógica | conversas abertas são devolvidas à fila e tarefas/follow-ups são ajustados | 🟢 |

`InviteEmailStatus` e `TaskDigestStatus` possuem máquinas auxiliares simples `PENDING → SENT | FAILED`, com nova tentativa operada pela fila/provedor. 🟢

## 2. Instância WhatsApp

```mermaid
stateDiagram-v2
  [*] --> DISCONNECTED: cadastro local
  DISCONNECTED --> CONNECTING: solicitar QR/conexão
  ERROR --> CONNECTING: reparar/reconectar
  CONNECTING --> CONNECTED: evento do provedor
  CONNECTING --> ERROR: falha técnica
  CONNECTED --> DISCONNECTED: desconectar ou sessão removida
  CONNECTED --> PAUSED: proteção operacional
  PAUSED --> CONNECTING: retomada/reconexão
  PAUSED --> DISCONNECTED: desconectar
  ERROR --> DISCONNECTED: arquivar conexão
```

- O estado é por instância; eventos de uma conexão não podem atualizar outra apenas por nome ou organização. 🟢
- Exclusão local é lógica e tenta remover a sessão remota; falha remota não impede o arquivamento local. 🟢
- `PAUSED` representa bloqueio operacional, inclusive proteção de campanha; não equivale a desconexão física. 🟢
- 🔴 Não há diagrama formal do provedor que garanta quais sequências intermediárias a Evolution pode emitir; o código normaliza o observado.

## 3. Conversa / atendimento

```mermaid
stateDiagram-v2
  [*] --> WAITING: mensagem nova ou conversa iniciada sem responsável
  WAITING --> OPEN: operador assume
  CLOSED --> OPEN: operador reabre
  OPEN --> OPEN: transferir responsável
  OPEN --> CLOSED: operador finaliza
  CLOSED --> WAITING: cliente envia nova mensagem
  OPEN --> WAITING: responsável removido/suspenso
  OPEN --> WAITING: chatbot ou IA transfere à fila
```

| Origem | Destino | Gatilho / guarda | Efeitos | Confiança |
|---|---|---|---|---|
| inexistente | `WAITING` | inbound desconhecido ou novo ticket sem operador | cria/associa contato e conversa | 🟢 |
| `WAITING` | `OPEN` | assumir | `assigneeId = usuário atual`; evento interno | 🟢 |
| `CLOSED` | `OPEN` | reabrir manualmente | responsável passa a ser o usuário atual; `closedAt = null` | 🟢 |
| `OPEN` | `OPEN` | transferir | troca responsável e propaga para follow-up/tarefa elegíveis | 🟢 |
| `OPEN` | `CLOSED` | finalizar | mantém responsável; interrompe chatbot/IA incompatíveis; registra `closedAt` | 🟢 |
| `CLOSED` | `WAITING` | nova mensagem do cliente | limpa responsável e inicia novo atendimento | 🟢 |
| `OPEN` | `WAITING` | responsável é excluído/suspenso | limpa responsável para não deixar ticket invisível | 🟢 |

Regras laterais:

- Fixação não altera o estado e só é permitida em `OPEN`. 🟢
- Selecionar uma conversa na interface não muda o estado; assumir é ação explícita. 🟢
- Exportação PDF delimita o último atendimento pelos eventos de início/reabertura, não todo o histórico da conversa. 🟢

## 4. Mensagem

```mermaid
stateDiagram-v2
  [*] --> PENDING: destinatário/cadência criado
  PENDING --> QUEUED: envio autorizado
  QUEUED --> SENT: provedor aceitou
  QUEUED --> FAILED: falha terminal
  FAILED --> QUEUED: tentar novamente
  SENT --> DELIVERED: confirmação de entrega
  DELIVERED --> READ: confirmação de leitura
  SENT --> REPLIED: resposta correlacionada
  DELIVERED --> REPLIED: resposta correlacionada
  READ --> REPLIED: resposta correlacionada
  PENDING --> SKIPPED: exclusão operacional
  QUEUED --> SKIPPED: fluxo cancelado antes do envio
  PENDING --> OPTED_OUT: descadastro/supressão
  QUEUED --> OPTED_OUT: descadastro antes do envio
```

| Estado | Semântica | Terminal para cadência? | Confiança |
|---|---|---:|---|
| `PENDING` | planejada, ainda sem job efetivo | não | 🟢 |
| `QUEUED` | persistida e elegível ao worker | não | 🟢 |
| `SENT` | aceita pelo provedor | sim para envio; pode evoluir entrega | 🟢 |
| `DELIVERED` | entregue no dispositivo | sim | 🟢 |
| `READ` | lida pelo destinatário | sim | 🟢 |
| `REPLIED` | resposta correlacionada | sim | 🟢 |
| `FAILED` | falha registrada | sim, salvo retry explícito | 🟢 |
| `SKIPPED` | não enviada por regra/cancelamento | sim | 🟢 |
| `OPTED_OUT` | não enviada por descadastro | sim | 🟢 |

- Inbound pode ser persistida diretamente com estado compatível com o evento recebido; a sequência acima descreve principalmente outbound. 🟢
- Edição, reação e exclusão são dimensões paralelas: não substituem o estado de entrega. Mensagem apagada preserva o texto e recebe indicador próprio. 🟢
- Atualizações do provedor são idempotentes por IDs de evento/mensagem; regressão de estado de entrega não deve prevalecer sobre confirmação mais avançada. 🟢

## 5. Oportunidade e tarefa

### Oportunidade

```mermaid
stateDiagram-v2
  [*] --> OPEN
  OPEN --> OPEN: mover para etapa normal
  OPEN --> WON: mover para etapa isWon
  OPEN --> LOST: mover para etapa isLost
  WON --> OPEN: mover para etapa normal
  LOST --> OPEN: mover para etapa normal
  WON --> LOST: mover para etapa isLost
  LOST --> WON: mover para etapa isWon
```

O estado é derivado da etapa selecionada, portanto a movimentação do Kanban é a operação canônica. A probabilidade também pode acompanhar a etapa. 🟢

### Tarefa

```mermaid
stateDiagram-v2
  [*] --> OPEN
  OPEN --> OPEN: reagendar / editar / arrastar
  OPEN --> COMPLETED: concluir
  OPEN --> CANCELLED: cancelar
```

- Não foi encontrado fluxo de reabertura de tarefa concluída/cancelada. 🟢
- Quando vinculada a follow-up, conclusão/cancelamento manual também cancela o agendamento ainda não executado. 🟢
- Tarefa de follow-up pode permanecer `OPEN` e vencida quando o disparo falha após a tolerância. 🟢

## 6. Campanha e destinatário

### Campanha

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SCHEDULED: agendar no futuro
  DRAFT --> RUNNING: iniciar agora
  SCHEDULED --> RUNNING: horário alcançado
  SCHEDULED --> PAUSED: pausar
  RUNNING --> PAUSED: operador ou conexão indisponível
  PAUSED --> RUNNING: retomar
  RUNNING --> COMPLETED: todos destinatários terminais
  DRAFT --> CANCELLED: cancelar/excluir
  SCHEDULED --> CANCELLED: cancelar/excluir
  RUNNING --> CANCELLED: cancelar/excluir
  PAUSED --> CANCELLED: cancelar/excluir
  RUNNING --> FAILED: falha estrutural terminal
```

| Transição | Guarda / observação | Confiança |
|---|---|---|
| `DRAFT → SCHEDULED/RUNNING` | exige `campaigns:launch`, configuração e pré-validação | 🟢 |
| `SCHEDULED → RUNNING` | job atrasado revalida estado antes de consumir | 🟢 |
| `RUNNING → PAUSED` | ação manual ou conexão WhatsApp desconectada | 🟢 |
| `PAUSED → RUNNING` | recria/retoma jobs pendentes | 🟢 |
| `RUNNING → COMPLETED` | nenhuma entrega `PENDING`/`QUEUED` restante; ignorados contam como terminais | 🟢 |
| ativo → `CANCELLED` | destinatários ainda pendentes/enfileirados viram `SKIPPED` | 🟢 |
| `RUNNING → FAILED` | configuração/conteúdo inválido ou falha terminal de campanha | 🟢 |

### Destinatário

O destinatário reutiliza `MessageStatus`. O percurso típico é `PENDING → QUEUED → SENT → DELIVERED/READ/REPLIED`; exclusões resultam em `SKIPPED` ou `OPTED_OUT`, e falhas em `FAILED`. 🟢

## 7. Workflow e inscrição

### Definição

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> PUBLISHED: publicar versão
  PUBLISHED --> PAUSED: pausar
  PAUSED --> PUBLISHED: ativar
  DRAFT --> ARCHIVED: excluir/arquivar
  PUBLISHED --> ARCHIVED: arquivar
  PAUSED --> ARCHIVED: arquivar
```

Publicar marca a versão corrente como imutável e atualiza `publishedVersion`. Para modificar, salva-se nova versão. 🟢

### Inscrição

```mermaid
stateDiagram-v2
  [*] --> ACTIVE
  ACTIVE --> WAITING: nó de espera
  WAITING --> ACTIVE: wakeAt / evento esperado
  ACTIVE --> ACTIVE: executar próximo nó
  ACTIVE --> COMPLETED: nó final
  WAITING --> COMPLETED: término válido
  ACTIVE --> STOPPED: resposta, descadastro ou interrupção
  WAITING --> STOPPED: resposta, descadastro, pausa/arquivo
  ACTIVE --> FAILED: erro terminal
  WAITING --> FAILED: retomada inválida
```

- `wakeAt` é persistido; um job perdido é recriado pelo reconciliador. 🟢
- Inscrição manual é vinculada ao contato; iniciar novamente cria nova execução em vez de bloquear por versão. 🟢
- Descadastro/perda de consentimento interrompe ações futuras. 🟢

## 8. Chatbot e sessão

### Definição

O chatbot segue `DRAFT → PUBLISHED ↔ PAUSED → ARCHIVED`, com a mesma regra de versão imutável do workflow. Publicar exige versão ainda não publicada; pausar/arquivar encerra sessões elegíveis. 🟢

### Sessão

```mermaid
stateDiagram-v2
  [*] --> ACTIVE: mensagem elegível inicia/reinicia sessão
  ACTIVE --> WAITING: pergunta, IA ou delay aguarda entrada/tempo
  WAITING --> ACTIVE: mensagem ou wakeAt retoma
  ACTIVE --> COMPLETED: nó final/encerrar
  WAITING --> COMPLETED: encerramento configurado
  ACTIVE --> HANDED_OFF: transferir ao humano
  WAITING --> HANDED_OFF: IA/fluxo transfere
  ACTIVE --> STOPPED: operador assume ou bot é pausado/arquivado
  WAITING --> STOPPED: operador assume ou interrupção
  ACTIVE --> FAILED: erro terminal
  WAITING --> FAILED: retomada inválida
```

- O grafo permite ciclos; a sessão controla nó atual, contexto e última mensagem para evitar repetição indevida. 🟢
- Mensagem mais recente pode cancelar geração de IA anterior e substituir a entrada ainda pendente. 🟢
- Handoff coloca a conversa em `WAITING` e limpa o responsável; atribuição humana produz `STOPPED`, não `HANDED_OFF`. 🟢

## 9. Follow-up e etapas

### Follow-up

```mermaid
stateDiagram-v2
  [*] --> SCHEDULED
  SCHEDULED --> SCHEDULED: editar/reagendar e incrementar revisão
  SCHEDULED --> RUNNING: horário válido alcançado
  SCHEDULED --> CANCELLED: operador/tarefa cancela
  SCHEDULED --> CANCELLED: cliente responde antes
  RUNNING --> COMPLETED: sequência ou inscrição criada
  RUNNING --> INTERRUPTED: cliente responde durante sequência
  RUNNING --> CANCELLED: cancelar restante
  RUNNING --> FAILED: falha terminal ou tolerância excedida
```

### Etapa de mensagem

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> QUEUED: chegou o horário da etapa
  QUEUED --> SENT: mensagem aceita pelo provedor
  PENDING --> CANCELLED: follow-up interrompido/cancelado
  QUEUED --> CANCELLED: cancelado antes do envio efetivo
  PENDING --> FAILED: erro terminal
  QUEUED --> FAILED: envio terminal falhou
```

| Regra | Resultado | Confiança |
|---|---|---|
| job com revisão antiga | sai sem enviar | 🟢 |
| servidor retorna dentro de 30 min | reconciliador executa | 🟢 |
| atraso maior que tolerância | `FAILED`, sem envio inesperado | 🟢 |
| conexão temporariamente indisponível | retry de um minuto até limite | 🟢 |
| etapa enviada | agenda a seguinte a partir do sucesso | 🟢 |
| modo workflow | conclui ao criar a inscrição na versão fixada | 🟢 |

## 10. Geração de IA e proposta

### Geração

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> WAITING_INPUT: áudio requer transcrição
  WAITING_INPUT --> PENDING: entrada ficou disponível
  PENDING --> RUNNING: worker adquiriu geração
  RUNNING --> COMPLETED: JSON validado e persistido
  RUNNING --> FAILED: provedor/schema/timeout falhou
  RUNNING --> STALE: contexto mudou
  PENDING --> CANCELLED: operador assumiu/nova mensagem substituiu
  WAITING_INPUT --> CANCELLED: operador assumiu/interrupção
  RUNNING --> CANCELLED: tomada humana detectada
  FAILED --> PENDING: nova tentativa manual
  RUNNING --> PENDING: reconciliador recupera execução abandonada
```

- Chave de deduplicação evita gerações duplicadas por duplo clique/retry. 🟢
- `STALE` preserva o resultado histórico, mas o impede de ser tratado como resumo/sugestão atual. 🟢
- `CHATBOT_REPLY` tem prioridade sobre sugestão, resumo e teste administrativo. 🟢

### Proposta de IA

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> PARTIALLY_APPLIED: aplicar seleção parcial
  PENDING --> APPLIED: aplicar tudo aprovado
  PARTIALLY_APPLIED --> APPLIED: aplicar restante
  PENDING --> DISMISSED: descartar
  PARTIALLY_APPLIED --> DISMISSED: descartar restante
```

Cada aplicação usa os serviços normais do CRM e registra o usuário decisor; a IA não executa a mutação sozinha. 🟢

## 11. Documento RAG

```mermaid
stateDiagram-v2
  [*] --> INDEXING: upload aceito
  INDEXING --> READY: extração, fragmentação e embeddings concluídos
  INDEXING --> FAILED: extração/embedding falhou ou expirou
  FAILED --> INDEXING: tentar novamente
  READY --> DELETING: solicitar exclusão
  FAILED --> DELETING: solicitar exclusão
  DELETING --> [*]: fragmentos e ativo removidos
  DELETING --> DELETING: falha registrada para nova recuperação
```

- Apenas `READY` participa da recuperação de contexto. 🟢
- Indexações abandonadas recebem falha após cinco minutos e podem ser reenfileiradas. 🟢
- 🔴 O estado `DELETING` não possui outro estado terminal persistido; sucesso remove o registro, e falha permanece para reconciliação.

## 12. Regras de consistência entre máquinas

1. `Conversation.CLOSED + inbound → Conversation.WAITING`, e não `OPEN`. 🟢
2. `Conversation` assumida por humano → `ChatbotSession.STOPPED` e `CHATBOT_REPLY.CANCELLED`. 🟢
3. Opt-out do contato → destinatários pendentes `OPTED_OUT` e inscrições `STOPPED`. 🟢
4. Resposta antes de follow-up → follow-up/tarefa `CANCELLED`; durante execução → follow-up `INTERRUPTED` e tarefa `COMPLETED`. 🟢
5. Etapa de follow-up `SENT` → próxima etapa `PENDING` recebe `scheduledAt`; última etapa → follow-up/tarefa `COMPLETED`. 🟢
6. Arquivar workflow/chatbot → execuções `ACTIVE/WAITING` tornam-se `STOPPED`. 🟢
7. Nova mensagem ou envio manual relevante → resumos `COMPLETED` tornam-se `STALE`. 🟢
8. Remover responsável ativo → conversa `WAITING`; follow-up preserva último responsável até nova atribuição. 🟢

## 13. Lacunas

- 🔴 Não há máquina formal para estado de mídia, transcrição, webhook externo e notificação; usam timestamps/campos de erro ou estado auxiliar local.
- 🟡 Alguns estados aceitos pelo schema são alcançados por webhooks do provedor e não por transições centralizadas; a ordem real depende da Evolution/Mailgun.
- 🔴 Não há enforcement genérico de transições legais no banco; os serviços e cláusulas condicionais de atualização são a defesa principal.
- 🟡 Não foi encontrada reabertura explícita de tarefas concluídas/canceladas; uma futura funcionalidade deve decidir se cria nova tarefa ou altera a atual.

## 14. Evidências principais

- `packages/database/prisma/schema.prisma`
- `apps/api/src/integrations/evolution.service.ts`
- `apps/api/src/campaigns/campaigns.service.ts`
- `apps/api/src/workflows/workflows.service.ts`
- `apps/api/src/chatbots/chatbots.service.ts`
- `apps/api/src/follow-ups/follow-ups.service.ts`
- `apps/api/src/ai/ai.service.ts`
- `apps/worker/src/inbound.processor.ts`
- `apps/worker/src/outbound.processor.ts`
- `apps/worker/src/campaign.processor.ts`
- `apps/worker/src/workflow.processor.ts`
- `apps/worker/src/chatbot.processor.ts`
- `apps/worker/src/follow-up.processor.ts`
- `apps/worker/src/ai.processor.ts`
- `apps/worker/src/ai-knowledge.processor.ts`
