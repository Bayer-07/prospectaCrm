FROM node:24-alpine AS build
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile --filter @prospecta/worker...
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN pnpm --filter @prospecta/database db:generate && pnpm --filter @prospecta/contracts build && pnpm --filter @prospecta/database build && pnpm --filter @prospecta/worker build

FROM node:24-alpine AS runtime
RUN corepack enable
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/worker ./apps/worker
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
CMD ["node", "apps/worker/dist/main.js"]
