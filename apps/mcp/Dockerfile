FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/mcp/package.json apps/mcp/package.json
RUN pnpm install --frozen-lockfile --filter @prospecta/mcp...
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
