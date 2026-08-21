# Fluxos — Relatórios e webhooks externos

Escala: 🟢 confirmado pelo código | 🟡 inferido | 🔴 lacuna.

## Resumo gerencial e PDF

```mermaid
flowchart TD
    A[Usuário informa período] --> B{Datas presentes?}
    B -- Não --> C[Últimos 30 dias]
    B -- Sim --> D[Converte from/to]
    C --> E[11 consultas em paralelo]
    D --> E
    E --> F[Agrega funil, vendas, Inbox, campanhas, atividades e tarefas]
    F --> G[Calcula conversão e primeira resposta]
    G --> H{Saída}
    H -- JSON --> I[Dashboard]
    H -- PDF --> J[Renderiza PDF paginado em pt-BR/BRL]
```

## Cadastro e disparo de webhook

```mermaid
flowchart TD
    A[Administrador informa nome, ação e endpoint] --> B[Valida limites e ação]
    B --> C[Resolve DNS e bloqueia destinos internos]
    C --> D[Gera segredo aleatório]
    D --> E[Persiste segredo cifrado e webhook desativado]
    E --> F[Usuário copia segredo e ativa webhook]
    F --> G[Mutação comercial gera AuditLog]
    G --> H{Webhook ativo aceita a ação?}
    H -- Não --> I[Ignora]
    H -- Sim --> J[Cria WebhookDelivery]
    J --> K[Agenda job determinístico]
```

## Entrega segura e retentativas

```mermaid
flowchart TD
    A[Worker carrega delivery] --> B{Já entregue ou webhook inativo?}
    B -- Sim --> C[Encerra sem chamada]
    B -- Não --> D[Decifra segredo]
    D --> E[Revalida URL e DNS público]
    E --> F[Assina metadados com HMAC-SHA256]
    F --> G[GET com lookup fixado e timeout 15 s]
    G --> H{Redirect?}
    H -- Sim, até 3 --> E
    H -- Não --> I{HTTP 2xx?}
    I -- Sim --> J[Marca delivered]
    I -- Não --> K[Registra erro e incrementa tentativas]
    K --> L{Oitava tentativa?}
    L -- Não --> M[retrying + backoff exponencial]
    L -- Sim --> N[dead_letter]
```
