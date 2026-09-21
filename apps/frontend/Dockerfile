# syntax=docker/dockerfile:1
# Production image for the SSR BFF. Build context = repo root (pnpm workspace).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0
COPY apps/frontend apps/frontend
RUN pnpm --filter chess-frontend build

# Nitro's node-server output is self-contained (its own node_modules under .output/server).
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/frontend/.output ./.output
USER node
EXPOSE 3000
# API_URL (and COOKIE_SECURE=true behind TLS) are RUNTIME env, never build args.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- --server-response http://127.0.0.1:3000/ 2>&1 | grep -qE 'HTTP/1.1 (200|30[0-9])' || exit 1
CMD ["node", ".output/server/index.mjs"]
