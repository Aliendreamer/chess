# syntax=docker/dockerfile:1
# Production image for the SSR BFF. Build context = repo root (pnpm workspace).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/frontend/otel/package.json apps/frontend/otel/package.json
RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0
COPY apps/frontend apps/frontend
RUN pnpm --filter chess-frontend build
# The OpenTelemetry SDK is loaded before the server (`--import`), so it cannot live in the bundle: its own package
# (apps/frontend/otel) is deployed with exactly its production dependencies from the lockfile (observability D7).
RUN pnpm --filter chess-frontend-otel deploy --prod --legacy /otel

# Nitro's node-server output is self-contained (its own node_modules under .output/server).
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/frontend/.output ./.output
# Telemetry (observability D7): off unless the deployment sets OTEL_ENABLED=true (and OTEL_EXPORTER_OTLP_ENDPOINT,
# PYROSCOPE_SERVER_ADDRESS for profiles); off, instrument.mjs loads nothing.
COPY --from=build /otel ./otel
ENV OTEL_ENABLED=false
USER node
EXPOSE 3000
# API_URL (and COOKIE_SECURE=true behind TLS) are RUNTIME env, never build args.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- --server-response http://127.0.0.1:3000/ 2>&1 | grep -qE 'HTTP/1.1 (200|30[0-9])' || exit 1
CMD ["node", "--import", "./otel/instrument.mjs", ".output/server/index.mjs"]
