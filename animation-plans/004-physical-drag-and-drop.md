# 004 — Dar física ao drag and drop

- **Status**: DONE
- **Commit**: 5d3d2e2
- **Severity**: HIGH
- **Category**: Física, easing e duração
- **Estimated scope**: 3 arquivos, cerca de 30 linhas

## Problem

O Kanban e o calendário acompanham o ponteiro corretamente, mas a soltura usa o easing genérico do navegador.

```tsx
// apps/web/src/pages/Pipeline.tsx:171 — current
<DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>

// apps/web/src/pages/Tasks.tsx:207 — current
<DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
```

## Target

Usar a curva iOS já adotada pelo sistema e preservar o movimento 1:1 durante o gesto:

```tsx
<DragOverlay dropAnimation={{
  duration: 240,
  easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
}}>
```

Card levantado usa `scale(1.015)` e rotação de `.7deg`; origem central; ao pressionar, o card fonte reduz para `.985`. A linha de destino aparece via opacidade/transform em `140ms var(--ease-out)`.

## Repo conventions to follow

- `--ease-drawer` contém exatamente `cubic-bezier(.32, .72, 0, 1)`.
- O overlay existente em `apps/web/src/apple-ui.css:414-415` já define elevação visual.

## Steps

1. Trocar os dois easings e durations do `DragOverlay` para 240ms e a curva exata.
2. Refinar overlay e preview somente com transform/opacity.
3. Animar a indicação de destino sem alterar geometria.
4. Manter `touch-action: none` e o tracking fornecido pelo dnd-kit.

## Boundaries

- Não alterar regras de movimentação, sensores, collision detection ou mutações.
- Não adicionar Motion/Framer Motion.
- Não adicionar bounce sem velocidade real disponível.

## Verification

- **Mechanical**: testes de Tasks, typecheck e build.
- **Feel check**: arrastar cards lentamente e soltar perto/longe; não deve haver salto entre ponteiro e overlay. Testar também por toque real.
- **Done when**: a soltura assenta em 240ms e mantém clareza do destino.
