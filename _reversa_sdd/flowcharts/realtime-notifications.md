# Fluxos — Tempo real e notificações

Escala: 🟢 confirmado pelo código | 🟡 inferido | 🔴 lacuna.

## Autenticação e salas Socket.IO

```mermaid
flowchart TD
    A[Navegador conecta em /realtime com cookie] --> B{Cookie de sessão existe?}
    B -- Não --> C[Desconecta]
    B -- Sim --> D[Verifica token assinado]
    D --> E[Busca sessão pelo hash]
    E --> F{IDs coincidem, não expirou e usuário está ativo?}
    F -- Não --> C
    F -- Sim --> G[Entra na sala da organização]
    G --> H[Entra na sala do usuário]
```

## Propagação e atualização seletiva

```mermaid
flowchart TD
    A[API ou worker conclui mudança] --> B{Origem}
    B -- API --> C[Gateway emite diretamente]
    B -- Worker --> D[Publica envelope no Redis]
    D --> E[Subscriber da API interpreta JSON]
    E --> C
    C --> F[Socket envia à sala organizacional/individual]
    F --> G[Navegador agrupa invalidações por 100 ms]
    G --> H{Evento de Inbox com conversa?}
    H -- Sim --> I[Busca somente as 30 mensagens recentes]
    I --> J[Deduplica por ID e preserva paginação antiga]
    H -- Não --> K[Invalida apenas as chaves do domínio]
```

## Notificação persistente e aviso sonoro

```mermaid
flowchart TD
    A[Domínio cria Notification para um usuário] --> B[Popover busca até 100 não lidas]
    B --> C{Socket conectado?}
    C -- Sim --> D[Atualiza por eventos de domínio]
    C -- Não --> E[Polling a cada 30 s]
    D --> F[Exibe contador e até 8 itens]
    E --> F
    F --> G{Usuário clica?}
    G -- Item --> H[Marca uma como lida e navega]
    G -- Marcar todas --> I[Atualiza todas as não lidas]
    A --> J{Nova mensagem de entrada deve soar?}
    J -- Não --> K[Silencia]
    J -- Sim --> L[Deduplica ID e toca sequência Web Audio]
```
