# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Nx + pnpm monorepo (the `nx-monorepo` workspace skeleton) holding three apps:

- `apps/backend` — .NET 10 API (`Chess.Backend`): FastEndpoints + EF Core/Npgsql, Keycloak PKCE login,
  **server-owned opaque cookie session** (`mp_sid`; tokens never leave the server; logout revokes).
  Built from the `dotnet-webapi` prompt in "private behind an SSR BFF" mode.
- `apps/frontend` — TanStack Start SSR app (`chess-frontend`) that **is the BFF**: proxies `/api/auth/*`
  server-to-server, re-homes cookies, fetches page data via server functions. The browser only ever talks
  to `app.chess.localhost`. Built from the `fe-ssr-tanstack` prompt.
- `apps/proxy` — nginx edge for deployment (`/api/` → backend, `/` → frontend, `/hc` local 200).

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
tools/coverage-report.sh                       # combined coverage (frontend vitest v8 + backend gate)
tools/e2e.sh                                   # stack up → Playwright → down

pnpm exec nx validate proxy                    # build proxy image, run `nginx -t` inside
pnpm exec nx release version --dry-run

# backend (apps/backend)
dotnet build Chess.Backend.csproj              # warning-clean under AnalysisMode=All + TreatWarningsAsErrors
./build_test.sh                                # xUnit + coverage gate (COVERAGE_THRESHOLD, default 75)
dotnet test Chess.Backend.Tests --filter "FullyQualifiedName~SessionStoreTests"   # one class
pnpm exec nx integration-test backend          # Testcontainers round-trip + recovery (needs Docker)
./build_migration.sh "AddSomething"            # EF migration (dotnet-ef 10.x)
dotnet format Chess.Backend.slnx --verify-no-changes   # = nx lint backend

# frontend (apps/frontend)
pnpm generate-routes                           # after adding/renaming route files
pnpm typecheck && pnpm lint && pnpm check      # = nx lint frontend
pnpm test / pnpm test:watch                    # vitest;  `pnpm vitest run src/lib/server/cookies.test.ts` for one file
pnpm build && API_URL=http://127.0.0.1:8080 pnpm start   # prod SSR server on :3000

tools/localdev/verify-auth.sh                  # curl-only login→/me→logout→revocation check vs the live stack
tools/localdev/verify-stack.sh                 # replica streaming + write→read, redpanda health/topics/round-trip, console
tools/localdev/verify-part0.sh [--cluster]     # login→ping→live→list→hub gate; --cluster kills backend-1 and re-checks
docker compose -f tools/localdev/docker-compose.yml --profile cluster up -d --build   # adds backend-2
tools/e2e.sh                                   # Playwright against the live stack
```

Agent sandbox note: MSBuild worker nodes, `dotnet format`'s build host, coverlet's mutex and the Docker
socket all need IPC the Claude Code sandbox blocks. Inside it: build with
`-m:1 -nr:false -p:EnableSourceControlManagerQueries=false`; `build_test.sh` reports 0% coverage (tests still
run); `dotnet format`, `stack.sh` and `verify-auth.sh` must be run by a human (`! <cmd>`).

`Observability__Console=true` switches on OpenTelemetry console tracing (ASP.NET, HttpClient, Npgsql,
and the `chess.actors` source); it is off by default, including in Development.

Local URLs (Traefik on :80, dashboard on 127.0.0.1:8090): `app.chess.localhost`, `api.chess.localhost`,
`keycloak.chess.localhost` (admin/admin), `redisinsight.chess.localhost`, `console.chess.localhost`
(Redpanda). Postgres primary `127.0.0.1:5432`, replica `127.0.0.1:5433` (`chess`/`chess`/`chess`);
Redpanda Kafka API `127.0.0.1:19092`.

## Commit rules (load-bearing)

Conventional commits with a **required scope** from `frontend | backend | repo | deps | proxy | ci |
release`, lower-case subject — enforced by commitlint on `commit-msg`. Nx Release derives version
bumps and per-project changelogs from these (`projectsRelationship: independent`, tags
`{project}@{version}`), so a non-conforming message is rejected, not just discouraged.
`pre-commit` runs `lint-staged --no-stash` (prettier on json/md/yml only; code formatting belongs
to each app's own lint target). Keep `--no-stash`.

## Architecture notes that span files

- **Auth flow (backend)** — `WebApi/Auth/`: `LoginEndpoint` sets a short-lived `mp_pkce` cookie
  (`"<nonce>.<verifier>"`) and 302s to Keycloak; `CallbackEndpoint` → `CallbackValidator` (state nonce must match
  the cookie) → `KeycloakOidcClient.ExchangeCodeAsync` → `ISessionStore.CreateAsync` (stores only the SHA-256
  of the raw token) → `mp_sid` cookie → 302 to `{AppBaseUrl}{returnTo}` (`ReturnToSanitizer`: relative path
  only). `CookieBearerTokenResolver.OnMessageReceivedAsync` turns `mp_sid` into the bearer token for
  JwtBearer, refreshing at the IdP when the access token is within `SessionStore:AccessTokenLeeway` of
  expiry; an `Authorization` header always wins. `LogoutEndpoint` revokes the row first, so the old cookie is
  dead even if the IdP call fails. `UserProvisioningPreProcessor` (global) JIT-creates `users` rows by `sub`
  and fills the scoped `ICurrentUser`; `KeycloakRolesClaimsTransformation` flattens `realm_access.roles`.
- **Redis (backend)** — `ConnectionStrings:Redis` is the single switch: set (compose: `redis:6379`) ⇒ FusionCache
  gets Redis as L2 + backplane, the global rate limiter (300 req/min per client IP) becomes Redis-backed
  (shared across replicas), and `/health` includes Redis; unset ⇒ L1-only cache, in-memory limiter, no Redis
  health check. Unit tests run without Redis.
- **Forwarded headers (backend)** — `X-Forwarded-*` is trusted only from `ForwardedHeaders:KnownNetworks`
  (CIDRs) / `KnownProxies`; default is ASP.NET's loopback-only, `ForwardLimit = 1`. The compose network is
  pinned to `172.30.0.0/24` and passed as `ForwardedHeaders__KnownNetworks__0`. **Every deployment must set
  this to the edge's network**, otherwise the per-client rate limiter keys on the proxy's IP.
- **Backend conventions** — everything `internal sealed` (tests via `InternalsVisibleTo`; Moq via
  `DynamicProxyGenAssembly2`); logging through `Utils/Log.cs` `[LoggerMessage]` methods (CA1873 forbids boxing
  args); config lives in `Config/appsettings*.json` (env vars override, `Keycloak__*` etc.); services named
  `Xxx : BaseService, IXxx` where `IXxx : IService` are auto-registered scoped by `AddConventionServices`.
  Endpoints are thin and `[ExcludeFromCodeCoverage]`; the logic they call is unit-tested.
- **BFF (frontend)** — `lib/server/cookies.ts` is the whole cookie contract: outbound `rehomeSetCookie`
  strips `Domain`, keeps lifetime, forces `Path=/; HttpOnly; SameSite=Lax`, adds `__Host-` + `Secure` when
  `COOKIE_SECURE=true` (never `NODE_ENV`); inbound `forwardCookieHeader` forwards only `mp_sid`/`mp_pkce`,
  mapping `__Host-` names back. `routes/api/auth/$.ts` is the public proxy route (outside `_authenticated`).
  `_authenticated.tsx#beforeLoad` calls `getMe()` and 302s anonymous users to `/api/auth/login?returnTo=`;
  route loaders call server functions (`lib/server/api.ts`) that re-attach the cookie and hit `API_URL`
  server-side. Components are presentational. **No `VITE_API_URL` ever** — the client bundle must not
  mention the API host.

- **Journal outbox (backend)** — actors never produce to Kafka. `Akka/Outbox/`: `TopicTagger` tags events
  with their topic (tag table), `JournalPublisher` is a cluster singleton that takes a Postgres advisory lock
  (`PostgresPublisherLeaseProvider`, unpooled connection) and runs `JournalPublisherLoop`: `EventsByTag`
  after `outbox_offsets.LastOrdering` → `JournalEventMappers` → Kafka (acks=all) → save offset through the
  lock connection. Any failure releases the lease and resumes from the saved offset (at-least-once).
  Consumers dedupe via `IdempotencyGuard` on `(aggregateId, seq)` and stall on a gap
  (`ProjectionGapException`). A new event type needs a `TopicTagger.BoundTypes` entry AND a mapper.

- **Nx caching across languages** — `nx.json#namedInputs.dotnet` lists only `.cs`/`.csproj`/
  `.slnx`/`Directory.*.props`/runsettings so JS edits don't bust the backend cache and vice versa.
  The backend's `project.json` must reference this input.
- **.NET versioning in Nx Release** — the backend has no `package.json`; its version is the MSBuild
  `<Version>` in `apps/backend/Directory.Build.props`. `tools/nx-release/dotnet-version-actions.cjs`
  teaches Nx Release to read/write it (wired via `release.groups.backend.version.versionActions`).
- **Data plane (ROADMAP §2)** — `postgres` (primary, writes) streams to `postgres-replica` (hot standby,
  reads; seeded by `postgres/replica-entrypoint.sh` via `pg_basebackup -R`, replication role from
  `postgres/primary-init-replication.sh` — both only run on a FRESH data dir, so changes need `down -v`).
  `redpanda` (Kafka API, dev-container mode) + `redpanda-init` (creates `game.events`, `matchmaking.events`,
  `analysis.requests`, `analysis.results`) + `redpanda-console`. Backend env already carries
  `ConnectionStrings__PostgresReplica` and `Kafka__BootstrapServers` for Part 0 code.
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
  (`docker.io/aliendreamer/chess-*`), creds via `REGISTRY`/`REGISTRY_USER`/`REGISTRY_PASS` env vars.
  Deploy target is Docker (compose/swarm) and is **not implemented** — each app's `deploy` target is
  a placeholder. `nx run-many -t build` does not publish; use `-t push`.

## Repo-local skills

`.claude/skills/` holds store-installed skills (`setup-flow`, `llm-setup-audit`,
`web-security-audit`, `md-files-audit`, `audit-package-version`, `context-hooks`,
`conventional-commits`, `monorepo-hygiene`). They are excluded from the markdown/prettier gates.
`.claude/commands/nx-monorepo.md` is the prompt this workspace was scaffolded from.
