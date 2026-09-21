# Local-dev image for the frontend: Vite dev server (HMR) with the source bind-mounted.
# Build context = repo root (the frontend is a pnpm workspace package and needs the root manifests).
# Source is NOT copied — docker-compose bind-mounts apps/frontend and keeps node_modules in anonymous
# volumes. We copy only the manifests to prime `pnpm install` so the first dev start is fast.
FROM node:24-alpine

RUN corepack enable
WORKDIR /app

# Poll for file changes — inotify is unreliable across bind mounts.
ENV CHOKIDAR_USEPOLLING=1 \
    DOCKER_DEV=1

# Manifests only: warm the install layer (override the 7-day cooldown for this pinned, frozen install).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0

EXPOSE 3000
CMD ["pnpm", "--filter", "chess-frontend", "dev"]
