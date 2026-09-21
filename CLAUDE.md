# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Nx + pnpm monorepo (the `nx-monorepo` workspace skeleton) intended to hold three apps:
`apps/backend` (.NET API — built with the `dotnet-webapi` prompt), `apps/frontend` (TanStack Start
SSR BFF — `fe-ssr-tanstack` prompt) and `apps/proxy` (nginx edge). Only `apps/proxy` exists so far;
the local stack, release config and deploy tooling are already wired for all three.

Node ≥ 24, pnpm pinned in `package.json#packageManager` (bump deliberately). Docker is required for
the local stack and for proxy validation.

## Commands

```bash
pnpm install                                   # also installs husky hooks
pnpm exec nx run-many -t lint test build       # cached; PR gate
pnpm exec nx affected -t lint test build
pnpm lint:md / pnpm lint:md:fix                # markdownlint-cli2 (excludes .claude/skills)
pnpm exec prettier --check "**/*.{json,md,yml,yaml}"

tools/localdev/stack.sh up [svc...]            # full stack; pass service names for a subset
tools/localdev/stack.sh down -v                # drop volumes (fresh DB + Keycloak)
tools/localdev/stack.sh logs [svc]

tools/test-all.sh                              # every test, both languages
tools/coverage-report.sh                       # combined coverage
tools/e2e.sh                                   # stack up → Playwright → down

pnpm exec nx validate proxy                    # build proxy image, run `nginx -t` inside
pnpm exec nx release version --dry-run         # errors until frontend+backend projects exist
```

Local URLs (Traefik on :80, dashboard on :8080): `app.chess.localhost`, `api.chess.localhost`,
`keycloak.chess.localhost` (admin/admin), `redisinsight.chess.localhost`. Postgres is on
`127.0.0.1:5432` as `chess`/`chess`/`chess`.

## Commit rules (load-bearing)

Conventional commits with a **required scope** from `frontend | backend | repo | deps | proxy | ci |
release`, lower-case subject — enforced by commitlint on `commit-msg`. Nx Release derives version
bumps and per-project changelogs from these (`projectsRelationship: independent`, tags
`{project}@{version}`), so a non-conforming message is rejected, not just discouraged.
`pre-commit` runs `lint-staged --no-stash` (prettier on json/md/yml only; code formatting belongs
to each app's own lint target). Keep `--no-stash`.

## Architecture notes that span files

- **Nx caching across languages** — `nx.json#namedInputs.dotnet` lists only `.cs`/`.csproj`/
  `.slnx`/`Directory.*.props`/runsettings so JS edits don't bust the backend cache and vice versa.
  The backend's `project.json` must reference this input.
- **.NET versioning in Nx Release** — the backend has no `package.json`; its version is the MSBuild
  `<Version>` in `apps/backend/Directory.Build.props`. `tools/nx-release/dotnet-version-actions.cjs`
  teaches Nx Release to read/write it (wired via `release.groups.backend.version.versionActions`).
- **Local stack** — `tools/localdev/docker-compose.yml`, project name `chess` (explicit, so volumes
  are `chess_*` and don't collide with other repos' `localdev_*`). Traefik routes by Host labels;
  Keycloak's issuer must resolve identically inside containers and in the browser (`extra_hosts`
  on the backend). Postgres is built (`postgres.dev.Dockerfile`) to include `pg_cron` +
  `pg_partman`. `tools/localdev/keycloak/` expects a realm export named `chess` with client
  `chess_api`; `keycloak-init` grants that client's service account realm-management roles.
- **Proxy** — `apps/proxy/files/nginx.conf` on `nginxinc/nginx-unprivileged` (port 8080, pid in
  `/tmp`). Upstreams are Docker service names `chess-backend:8080` / `chess-frontend:3000`, set as
  variables with `resolver 127.0.0.11` so resolution is per request and `nginx -t` passes outside
  the network. `/hc` returns 200 locally. No CSP here — the SSR layer owns it.
- **Images and deploy** — `tools/deploy/build.sh <app> [push|local|validate]` tags
  `YYYYMMDD.<short-sha>`; that tag is the rollback unit. Registry is Docker Hub
  (`docker.io/aliendreamer/chess-*`), creds via `ACR_REGISTRY`/`ACR_USER`/`ACR_PASS` env vars.
  Deploy target is Docker (compose/swarm) and is **not implemented** — each app's `deploy` target is
  a placeholder. `nx run-many -t build` does not publish; use `-t push`.

## Repo-local skills

`.claude/skills/` holds store-installed skills (`setup-flow`, `llm-setup-audit`,
`web-security-audit`, `md-files-audit`, `audit-package-version`, `context-hooks`,
`conventional-commits`, `monorepo-hygiene`). They are excluded from the markdown/prettier gates.
`.claude/commands/nx-monorepo.md` is the prompt this workspace was scaffolded from.
