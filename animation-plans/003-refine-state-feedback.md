# 003 — Refinar feedback de estados

- **Status**: DONE
- **Commit**: 5d3d2e2
- **Severity**: HIGH
- **Category**: Performance e feedback
- **Estimated scope**: 1 arquivo, cerca de 70 linhas

## Problem

Alguns estados ainda animam propriedades de layout. O switch de webhook move `left` e o indicador ativo do Inbox aparece instantaneamente.

```css
/* apps/web/src/styles.css:1426 — current */
.webhook-switch span { left: 3px; transition: left .15s, background .15s; }
.webhook-switch.active span { left: 19px; }
```

## Target

```css
.webhook-switch span {
  left: 3px;
  transform: translateX(0);
  transition: transform 200ms var(--ease-in-out), background-color 150ms ease;
}
.webhook-switch.active span { left: 3px; transform: translateX(16px); }
```

O sub-menu lateral entra em `180ms var(--ease-out)` de `translateY(-4px) scale(.98)` com origem superior. Indicadores de tabs usam `scaleX(0 → 1)` em `180ms var(--ease-in-out)`. Badges novos usam `160ms var(--ease-out)` a partir de `scale(.8)`.

## Repo conventions to follow

- Pressáveis já usam `scale(.97)` em `apps/web/src/apple-ui.css:645-647`.
- Hover com movimento fica dentro de `@media (hover: hover) and (pointer: fine)`.

## Steps

1. Sobrescrever o switch para mover o knob via transform.
2. Animar a montagem do submenu sem animar altura.
3. Criar estado base e ativo do underline do Inbox com `scaleX`.
4. Materializar badges de notificação e contagem com escala mínima `.8`.
5. Garantir feedback `:active` em switches e cards clicáveis.

## Boundaries

- Não animar comandos de teclado ou a abertura do Ctrl+K.
- Não usar `transition: all`.
- Não animar `left`, `width`, `height`, padding ou margin.

## Verification

- **Mechanical**: typecheck, testes e build web.
- **Feel check**: alternar webhook rapidamente; o knob deve reverter do ponto atual. Trocar tabs do Inbox e conferir indicador sem salto.
- **Done when**: os estados dão resposta imediata e só usam transform/opacidade/cores.
