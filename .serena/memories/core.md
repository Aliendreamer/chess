# Core

Nx + pnpm monorepo scaffolded from the `nx-monorepo` workspace skeleton (`.claude/commands/nx-monorepo.md`).
Intended apps: `apps/backend` (.NET API, `dotnet-webapi` prompt), `apps/frontend` (TanStack Start SSR BFF,
`fe-ssr-tanstack` prompt), `apps/proxy` (nginx edge). **Only `apps/proxy` exists so far**; stack, release and
deploy tooling are pre-wired for all three.

## Source map

- `nx.json` — targetDefaults (build/test/lint cached), `namedInputs.dotnet`, `release` groups (frontend, backend).
- `apps/proxy/` — Dockerfile + `files/nginx.conf` + `project.json` (build=push, validate, deploy placeholder).
- `tools/localdev/` — compose stack (`docker-compose.yml`, project name `chess`), `stack.sh`, dev/coverage
  Dockerfiles, `keycloak/` (realm import dir, empty), `traefik/` (dynamic config dir, empty).
- `tools/deploy/build.sh` — image build/push, tag `YYYYMMDD.<short-sha>`.
- `tools/nx-release/dotnet-version-actions.cjs` — Nx Release reads/writes MSBuild `<Version>` for backend.
- `tools/{test-all,coverage-report,e2e,e2e-coverage}.sh` — cross-language test/coverage runners.
- `.claude/` — settings.json (sandbox, serena MCP, hooks), `claude-hooks/` (prefer-serena once-per-session
  hook), `skills/` (store-installed, not authored here), `commands/nx-monorepo.md`.

## Invariants

- Conventional commits with required scope are load-bearing: Nx Release derives bumps from them (`mem:conventions`).
- JS and .NET caches are isolated via `namedInputs.dotnet`; backend `project.json` must use that input.
- Compose project is explicitly `name: chess` — do not remove; without it volumes collide with other repos'
  `localdev_*` volumes on this machine.
- Keycloak issuer URL must resolve identically in-container and in-browser (`extra_hosts` on backend).
- Proxy upstreams are Docker service names (`chess-backend:8080`, `chess-frontend:3000`) resolved per-request
  via `resolver 127.0.0.11` + variables — not k8s FQDNs. Deploy target is Docker compose/swarm (not implemented).
- No CI pipeline and no deploy script ship by design; do not invent them.

See `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`,
`mem:agent_workflow` (what the user does NOT want agents to do in this repo).
