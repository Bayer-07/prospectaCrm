# 002 — Orquestrar o primeiro carregamento

- **Status**: DONE
- **Commit**: 5d3d2e2
- **Severity**: MEDIUM
- **Category**: Coesão e oportunidade perdida
- **Estimated scope**: 1 arquivo, cerca de 80 linhas

## Problem

O shell, a hierarquia da página, os cards de métricas e as colunas do Kanban aparecem todos no mesmo frame. Não há explicação visual de hierarquia no primeiro carregamento, apesar de esses elementos serem montados em grupos.

```css
/* apps/web/src/apple-ui.css — current */
.metric-grid { gap: 14px; }
.kanban-board { gap: 16px; }
```

## Target

Adicionar movimento predeterminado e não bloqueante, usando apenas `transform` e `opacity`:

```css
@keyframes apple-content-arrive {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- Shell desktop: sidebar `240ms var(--ease-drawer)` a partir de `translateX(-12px)`; topbar `200ms var(--ease-out)` a partir de `translateY(-8px)`.
- Cabeçalho/conteúdo: `180ms`/`220ms var(--ease-out)` com deslocamento máximo de `6px`.
- Métricas e colunas Kanban: `220ms var(--ease-out)`, stagger de `35ms` limitado aos seis primeiros elementos.
- Painéis e calendários: `200ms var(--ease-out)`, sem stagger longo.

## Repo conventions to follow

- Tokens de easing já vivem em `apps/web/src/apple-ui.css`.
- A aplicação é um dashboard profissional: sem bounce, parallax ou animação em loop.

## Steps

1. Criar keyframes exclusivos para montagem predeterminada.
2. Aplicar a animação ao shell somente em desktop e somente na montagem.
3. Aplicar stagger curto em métricas e colunas, com delays de 35ms.
4. Excluir `.inbox-shell` da entrada de conteúdo para não animar a troca frequente de conversas.
5. Em reduced motion, trocar os keyframes por crossfade de 150ms sem transform.

## Boundaries

- Não animar listas de contatos, empresas ou conversas linha a linha.
- Não atrasar interação durante o stagger.
- Não adicionar estado React.

## Verification

- **Mechanical**: build e typecheck web.
- **Feel check**: recarregar Dashboard e Pipeline; a hierarquia deve chegar em menos de 300ms e continuar clicável desde o primeiro frame.
- **Done when**: a entrada é visível mas não chama mais atenção que o conteúdo.
