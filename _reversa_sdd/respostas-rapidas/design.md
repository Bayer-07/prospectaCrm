# Respostas rápidas — Design

## Componentes

- A API autentica, valida e persiste a intenção de trabalho. **[CONFIRMADO]**
- O worker executa integrações, geração, conversão ou retentativas fora do ciclo HTTP. **[CONFIRMADO]**
- PostgreSQL guarda estado comercial; Redis/BullMQ coordena execução. **[CONFIRMADO]**
- Socket.IO ou consulta específica entrega o resultado à interface. **[CONFIRMADO]**

## Interfaces

- `GET/POST /api/v1/quick-replies`. **[CONFIRMADO]**
- `GET/PATCH/DELETE /api/v1/quick-replies/:id`. **[CONFIRMADO]**

## Fluxo

```mermaid
flowchart LR
  U[Usuário ou evento] --> A[API]
  A --> D[(PostgreSQL)]
  A --> Q[(BullMQ)]
  Q --> W[Worker]
  W --> P[Provedor/Processador]
  W --> D
  D --> S[Socket.IO ou GET]
  S --> U
```
**[INFERIDO]**

## Consistência e observabilidade

- O worker relê status e revisão antes do efeito externo. **[CONFIRMADO]**
- Estados terminais impedem jobs antigos de reativar o fluxo. **[INFERIDO]**
- Erros persistem código/motivo sanitizado e contagem de tentativa quando aplicável. **[CONFIRMADO]**
- Logs técnicos correlacionam organização, entidade e job sem conteúdo secreto. **[INFERIDO]**

## Riscos

- Dependência externa lenta pode acumular fila; concorrência e timeout devem permanecer delimitados. **[INFERIDO]**
- Dados volumosos devem ser paginados ou processados em chunks. **[INFERIDO]**
- Mudança de estado concorrente exige validação otimista ou transação. **[INFERIDO]**

## Referências

`apps/api/src/quick-replies/quick-replies.controller.ts`, `apps/api/src/quick-replies/quick-replies.service.ts`, `apps/web/src/pages/QuickReplies.tsx`, `apps/web/src/pages/Inbox.tsx`. **[CONFIRMADO]**
