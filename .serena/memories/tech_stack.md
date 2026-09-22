# Tech stack

- Node >= 24; pnpm pinned via `package.json#packageManager` (12.3.4 + sha512) — bump deliberately, keep hash.
- Nx 23 (`nx`, `@nx/js`), `pnpm-workspace.yaml` packages `apps/*`, `minimumReleaseAge: 10080` (7-day supply-chain guard).
- husky 9 + commitlint 21 (config-conventional) + lint-staged 17 (`--no-stash`, json/md/yml only) + prettier 3.8.
- markdownlint-cli2 for `.md` (config `.markdownlint-cli2.jsonc`; ignores `.claude/skills/**`, `openspec/**`).
- Planned: .NET backend (FastEndpoints/EF Core/Postgres/Keycloak), TanStack Start SSR frontend, nginx proxy.
- Local stack (Docker compose + Traefik v3): Postgres 18 built with pg_cron + pg_partman
  (`postgres.dev.Dockerfile`), Redis 7, RedisInsight, Keycloak 26 (`start-dev --import-realm`, realm `chess`,
  client `chess_api`, admin/admin).
- Proxy image: `nginxinc/nginx-unprivileged:stable-alpine` (non-root, :8080, pid `/tmp/nginx.pid`).
- Registry: Docker Hub `docker.io/aliendreamer/chess-{backend,frontend,proxy}`; creds via env
  `REGISTRY=docker.io REGISTRY_USER REGISTRY_PASS` (name is historical, script is registry-agnostic).
- Serena language servers: typescript, csharp, bash (pre-registered before app code exists).
