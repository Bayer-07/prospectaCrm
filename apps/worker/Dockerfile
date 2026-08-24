FROM node:24-alpine AS build
RUN apk add --no-cache g++ make python3 && corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
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
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @prospecta/worker...
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN pnpm --filter @prospecta/database db:generate \
  && pnpm --filter @prospecta/contracts build \
  && pnpm --filter @prospecta/database build \
  && pnpm --filter @prospecta/worker build

FROM node:24-alpine AS runtime
RUN corepack enable
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/worker ./apps/worker
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
USER node
CMD ["node", "apps/worker/dist/main.js"]
