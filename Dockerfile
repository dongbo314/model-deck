ARG NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

FROM ${NODE_IMAGE} AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY app ./app
COPY bin ./bin
COPY controller ./controller
COPY resources ./resources
COPY scripts/run-next.mjs ./scripts/run-next.mjs
COPY next.config.ts next-env.d.ts tsconfig.json ./
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime

LABEL org.opencontainers.image.source="https://github.com/dongbo314/model-deck" \
  org.opencontainers.image.title="Model Deck Core" \
  org.opencontainers.image.description="Source-built Model Deck Core container preview" \
  org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  MODELDECK_CONTAINER_MODE=1 \
  MODELDECK_HOME=/var/lib/modeldeck \
  MODELDECK_HOST=0.0.0.0 \
  MODELDECK_PORT=8080 \
  MODELDECK_DASHBOARD_HOST=0.0.0.0 \
  MODELDECK_DASHBOARD_PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/bin ./bin
COPY --from=build --chown=node:node /app/controller ./controller
COPY --from=build --chown=node:node /app/resources ./resources
COPY --from=build --chown=node:node /app/scripts/run-next.mjs ./scripts/run-next.mjs
COPY --chown=node:node scripts/container-healthcheck.mjs ./scripts/container-healthcheck.mjs
COPY --from=build --chown=node:node /app/next.config.ts /app/next-env.d.ts /app/tsconfig.json ./

RUN mkdir -p /var/lib/modeldeck /app/.next/cache \
  && chown -R node:node /var/lib/modeldeck /app/.next/cache

USER node
EXPOSE 3000 8080
VOLUME ["/var/lib/modeldeck"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 CMD ["node", "scripts/container-healthcheck.mjs"]
CMD ["node", "bin/modeldeck.mjs", "start"]
