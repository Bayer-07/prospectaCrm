FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/mcp/package.json apps/mcp/package.json
RUN set -eu; \
  for attempt in 1 2 3 4 5; do \
    if corepack install; then \
      break; \
    fi; \
    if [ "$attempt" -eq 5 ]; then \
      echo "Falha ao baixar o pnpm após 5 tentativas." >&2; \
      exit 1; \
    fi; \
    sleep $((attempt * 5)); \
  done
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @prospecta/mcp...
COPY apps/mcp apps/mcp
RUN pnpm --filter @prospecta/mcp build

FROM node:24-alpine AS runtime
RUN corepack enable
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/mcp ./apps/mcp
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
USER node
CMD ["node", "apps/mcp/dist/main.js"]
