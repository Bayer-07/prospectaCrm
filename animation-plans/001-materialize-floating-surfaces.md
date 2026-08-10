# 001 — Materializar superfícies flutuantes

- **Status**: DONE
- **Commit**: 5d3d2e2
- **Severity**: HIGH
- **Category**: Interruptibilidade e origem física
- **Estimated scope**: 1 arquivo, cerca de 90 linhas

## Problem

Menus, modais, drawers e toasts usam keyframes de entrada em `apps/web/src/apple-ui.css:444-526`. Keyframes reiniciam quando superfícies dinâmicas são acionadas rapidamente e os valores não deixam clara a origem espacial.

```css
/* apps/web/src/apple-ui.css:444 — current */
animation: apple-popover-in 180ms var(--ease-out) both;

/* apps/web/src/apple-ui.css:474 — current */
animation: apple-modal-in 220ms var(--ease-out) both;
```

## Target

Usar transições e `@starting-style`, mantendo modais centrados e ancorando menus ao gatilho:

```css
.popover {
  opacity: 1;
  transform: translateY(0) scale(1);
  transform-origin: top right;
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
}
@starting-style {
  .popover { opacity: 0; transform: translateY(-4px) scale(.96); }
}
```

Modal: `240ms var(--ease-out)`, início em `translateY(8px) scale(.96)`. Drawer: `280ms var(--ease-drawer)`, início em `translateX(100%)`. Toast: `220ms ease`, início em `translateY(-35%) scale(.97)`. Scrims usam apenas opacidade em `180ms`.

## Repo conventions to follow

- Tokens existentes em `apps/web/src/apple-ui.css:51-53`: `--ease-out`, `--ease-in-out`, `--ease-drawer`.
- Modais continuam com `transform-origin: center`; popovers usam origem correspondente à posição do gatilho.

## Steps

1. Remover os keyframes `apple-popover-in`, `apple-modal-in`, `apple-drawer-in` e `apple-toast-in`.
2. Declarar estados finais com transições de `transform` e `opacity`.
3. Criar um bloco `@starting-style` agrupado com os estados iniciais exatos.
4. Preservar o spinner e o progresso linear dos toasts.
5. No bloco de redução de movimento, manter somente `opacity 150ms` e remover transformações.

## Boundaries

- Não alterar markup ou lógica de abertura.
- Não adicionar dependências.
- Não animar dimensões, offsets ou blur.

## Verification

- **Mechanical**: `pnpm --filter @prospecta/web typecheck` e `pnpm --filter @prospecta/web build`.
- **Feel check**: abrir repetidamente busca, menus, modal e drawer; eles devem nascer do gatilho, sem bounce. Em 10% de velocidade, confirmar continuidade e ausência de `scale(0)`.
- **Done when**: superfícies entram com transform/opacity, modal permanece central e reduced motion elimina deslocamentos.
