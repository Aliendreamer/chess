# Core

Nx + pnpm monorepo scaffolded from the `nx-monorepo` workspace skeleton (`.claude/commands/nx-monorepo.md`).
Three apps: `apps/backend` (.NET API, see `mem:backend/core`), `apps/frontend` (TanStack Start SSR BFF, see
`mem:frontend/core`), `apps/proxy` (nginx edge). Prompts that built them: `.claude/commands/{dotnet-webapi,fe-ssr-tanstack}.md`.

## Source map

- `nx.json` — targetDefaults (build/test/lint cached), `namedInputs.dotnet`, `release` groups (frontend, backend).
- `apps/backend/project.json` — build/test/lint(format --verify)/format/migration/push/validate/deploy; inputs `dotnet`.
- `apps/frontend/project.json` — generate-routes/build/test/lint(typecheck+eslint+prettier)/e2e/push/validate/deploy.
- `apps/proxy/` — Dockerfile + `files/nginx.conf` + `project.json` (build=push, validate, deploy placeholder).
- `tools/localdev/` — compose stack (`docker-compose.yml`, project name `chess`), `stack.sh`, dev/coverage
  Dockerfiles, `keycloak/chess-realm.json` (realm import), `traefik/` (dynamic config dir, empty),
  `verify-auth.sh` (curl-only login→/me→logout→revocation smoke test).
- `tools/deploy/build.sh` — image build/push, tag `YYYYMMDD.<short-sha>`.
- `tools/nx-release/dotnet-version-actions.cjs` — Nx Release reads/writes MSBuild `<Version>` for backend
  (wired via `apps/backend/project.json#release.version.versionActions`; do NOT set `currentVersionResolver`
  there — Nx rejects it with conventional commits; workspace `fallbackCurrentVersionResolver: disk` covers it).
- `tools/{test-all,coverage-report,e2e,e2e-coverage}.sh` — cross-language test/coverage runners.
- `.claude/` — settings.json (sandbox, serena MCP, hooks), `claude-hooks/`, `skills/` (store-installed),
  `commands/` (the three build prompts).

## Invariants

- Conventional commits with required scope are load-bearing: Nx Release derives bumps from them (`mem:conventions`).
- JS and .NET caches are isolated via `namedInputs.dotnet` (verified: touching a `.cs` leaves frontend cached).
- Compose project is explicitly `name: chess` — do not remove; without it volumes collide with other repos'
  `localdev_*` volumes on this machine.
- Keycloak issuer URL must resolve identically in-container and in-browser (`extra_hosts` on backend).
- Proxy upstreams are Docker service names (`chess-backend:8080`, `chess-frontend:3000`) resolved per-request
  via `resolver 127.0.0.11` + variables — not k8s FQDNs. Deploy target is Docker compose/swarm (not implemented).
- No CI pipeline and no deploy script ship by design; do not invent them.
- Local hosts: `app.` (browser origin, frontend), `api.` (backend, dev-only Traefik route), `keycloak.`,
  `redisinsight.` — all `*.chess.localhost` on Traefik :80.

See `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`,
`mem:agent_workflow` (what the user does NOT want agents to do; sandbox limits and workarounds).
