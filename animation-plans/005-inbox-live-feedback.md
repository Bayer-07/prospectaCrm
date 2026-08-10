# 005 — Animar feedback vivo do Inbox

- **Status**: DONE
- **Commit**: 5d3d2e2
- **Severity**: MEDIUM
- **Category**: State indication e oportunidade perdida
- **Estimated scope**: 1 arquivo, cerca de 55 linhas

## Problem

Conteúdo assíncrono do Inbox — nova mensagem, botão de voltar ao fim e área de drop — aparece sem transição coerente. A troca frequente de tickets, por outro lado, não deve receber uma animação longa.

```css
/* apps/web/src/styles.css:422 — current */
.scroll-to-latest { animation: action-menu-in .14s ease-out; }

/* apps/web/src/styles.css:407 — current */
.conversation-file-drop { animation: action-menu-in .14s ease-out; }
```

## Target

- Última mensagem nova: `180ms var(--ease-out)` a partir de `translateY(5px) scale(.985)` e opacidade 0.
- Botão “mensagem mais atual”: `180ms var(--ease-out)` a partir de `translateY(8px) scale(.92)`.
- Drop zone: `180ms var(--ease-out)` a partir de `scale(.985)`.
- Quick reaction e menu de mensagem permanecem em 120–180ms.
- Troca/seleção de conversa continua instantânea.

## Repo conventions to follow

- Usar `@starting-style` e os tokens em `apple-ui.css`.
- Os controles de mensagem já usam hover gated e press feedback.

## Steps

1. Substituir `action-menu-in` nas superfícies do Inbox por transições + `@starting-style`.
2. Animar apenas a última mensagem montada, não o histórico inteiro.
3. Manter menus e seleção de conversa instantâneos quando acionados por teclado.
4. Adicionar variante reduced motion com opacity de 150ms e sem deslocamento.

## Boundaries

- Não animar scroll programático, áudio, waveform ou altura do composer.
- Não alterar lógica de paginação, leitura ou envio.
- Não animar todas as mensagens históricas.

## Verification

- **Mechanical**: testes do Inbox, typecheck e build.
- **Feel check**: receber uma mensagem com a conversa aberta, subir o histórico e observar o botão de retorno, arrastar um arquivo sobre o chat.
- **Done when**: o conteúdo novo é perceptível e a navegação diária permanece instantânea.
