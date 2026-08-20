ARG EVOLUTION_SOURCE_REF=cd800f2976e1e5b682fbf86a01ee4d85ae61f370

FROM node:24-alpine AS builder

ARG EVOLUTION_SOURCE_REF

RUN apk add --no-cache bash git openssl

WORKDIR /evolution

RUN git clone https://github.com/evolution-foundation/evolution-api.git . \
    && git checkout "${EVOLUTION_SOURCE_REF}"

COPY infra/evolution/link-preview.patch /tmp/link-preview.patch
COPY infra/evolution/multi-instance-stability.patch /tmp/multi-instance-stability.patch

RUN git apply --check /tmp/link-preview.patch \
    && git apply /tmp/link-preview.patch \
    && git apply --check /tmp/multi-instance-stability.patch \
    && git apply /tmp/multi-instance-stability.patch \
    && npm ci --ignore-scripts --silent \
    && cp .env.example .env \
    && chmod +x ./Docker/scripts/* \
    && ./Docker/scripts/generate_database.sh \
    && npm run build

FROM evoapicloud/evolution-api:v2.3.7

COPY --chown=node:node --from=builder /evolution/dist /evolution/dist

RUN chown -R node:node /evolution

USER node

LABEL org.opencontainers.image.title="BZS One Evolution API"
LABEL org.opencontainers.image.description="Evolution API 2.3.7 com geração determinística de prévias de links"
