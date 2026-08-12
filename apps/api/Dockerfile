FROM node:24-alpine AS build
RUN apk add --no-cache g++ make python3 && corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @prospecta/api...
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN pnpm --filter @prospecta/database db:generate \
  && pnpm --filter @prospecta/contracts build \
  && pnpm --filter @prospecta/database build \
  && pnpm --filter @prospecta/api build

FROM node:24-alpine AS runtime
RUN apk add --no-cache wget openssl && corepack enable
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
USER node
CMD ["sh", "-c", "pnpm --filter @prospecta/database db:deploy && node apps/api/dist/main.js"]
