# Core

Nx + pnpm monorepo scaffolded from the `nx-monorepo` workspace skeleton (`.claude/commands/nx-monorepo.md`).
Three apps: `apps/backend` (.NET API, see `mem:backend/core`), `apps/frontend` (TanStack Start SSR BFF, see
`mem:frontend/core`), `apps/proxy` (nginx edge). Prompts that built them: `.claude/commands/{dotnet-webapi,fe-ssr-tanstack}.md`.

## Product architecture — read `ROADMAP.md` first

Baseline agreed 2026-09-22 (commit 6148887): Postgres is the source of truth; writes → primary, reads →
replica; Akka.NET actors are the live-game sync plane; Kafka (Redpanda locally) is the event backbone with
Akka.Persistence-first / Kafka-replay-second recovery; browser has one origin (`app.`) incl. realtime.
Parts: 0 spine (PingActor proves persist→publish→project→replicate→read) → 1 live vs people → 2 vs engine
→ 3 correspondence → 4 study/analysis. `ROADMAP.md` §3 tags each decision decided/default/open; the
user said "basics are good, many implementation details we will need to go over" — every part gets its
own design conversation before code, and defaults in §3/§4 are not settled until then.

**Part 0 status (2026-09-22): all 11 tasks implemented, committed AND verified against the live
stack** — `verify-part0.sh` (single-node and `--cluster`), `verify-stack.sh`, `nx integration-test
backend`, the full Playwright suite (8) and `nx validate proxy` all pass. Getting there took fixing
three faults that had left the spine dead in the stack (Akka.Streams.Kafka HOCON missing from the
ActorSystem, the `akka` schema never created, PingProjection unresolvable by concrete type) plus two
wrong verification scripts; see the Part 0 experiment note (removed 2026-09-25 with `docs/`; in git history, commit d24c251). Coverage gates are 75% both sides (user, 2026-09-22: "90 is too much... 75+ should be enough"):
backend 81.7%, frontend 98.5% on the measured surface. The spine runs end to end:
PingActor (sharded, persistent) → Kafka → `rm_pings` projection → replica reads → DistributedPubSub →
SignalR → SSR WebSocket relay → browser page `/pings/$id`. Two notes hold the conclusions:
the realtime-spike note (relay option A adopted, with the evidence) and
`part0-experiment.md` (what Akka/Kafka bought and cost, what to change before Part 1 — dual-write gap
first). Measured: write→replica ~250 ms, ping→replica row 250–500 ms, failover to backend-2 ~2 s.

Release: the first release is cut (2026-09-22) — `frontend@0.1.1`, `backend@0.1.1`, per-project
`CHANGELOG.md` written from the whole history, commit `chore(release): publish`. Use `pnpm release`
/ `pnpm release:dry`, which pass `--skip-publish`: bare `nx release` does all the work and then
errors with "no nx-release-publish target ... frontend", the publish phase objecting to
`"private": true`. We never publish packages; images are the artifact. **Releases and pushes are the
user's to run** — do not run `nx release` or `nx push` for them.

## Specs and plans — OpenSpec (from 2026-09-22)

The user installed OpenSpec (CLI 1.2.0) to write specs and plans down "so we have history": scaffold
in `openspec/` (`config.yaml` carries the project context and per-artifact rules shown to the agent),
slash commands in `.claude/commands/opsx/`, skills `openspec-{propose,apply,archive,explore,sync-specs}`.
Part 1 onward gets its design and plan through OpenSpec rather than ad-hoc files. Part 0's history
was in `docs/superpowers/`, removed on 2026-09-25 (user: "we dont want to use docs only openspec"); it survives in git history. **Docs live only in `openspec/`** (architecture in `openspec/architecture.md`). `openspec validate --strict`
wants network (edge.openspec.dev) and fails inside the agent sandbox.

## Source map

- `nx.json` — targetDefaults (build/test/lint cached), `namedInputs.dotnet`, `release` groups (frontend, backend).
- `apps/backend/project.json` — build/test/lint(format --verify)/format/migration/push/validate/deploy; inputs `dotnet`.
- `apps/frontend/project.json` — generate-routes/build/test/lint(typecheck+eslint+prettier)/e2e/push/validate/deploy.
- `apps/proxy/` — Dockerfile + `files/nginx.conf` + `project.json` (build = local image, no push; push; validate; deploy placeholder).
- `tools/localdev/` — compose stack (`docker-compose.yml`, project name `chess`, subnet 172.30.0.0/24),
  `stack.sh`, dev/coverage Dockerfiles, `keycloak/chess-realm.json` (realm import), `traefik/dynamic.yml`
  (file-provider routes — docker provider is inert on Docker 29), `postgres/` (primary replication init +
  replica entrypoint), `verify-auth.sh` (curl-only login→/me→logout→revocation), `verify-stack.sh`
  (replica streaming/write→read/read-only, Redpanda health/topics/round-trip, console).
  Data plane since commit 71910b0: `postgres` primary → `postgres-replica` hot standby (:5433);
  `redpanda` v26.2.3 (+ `redpanda-init` topics game.events/matchmaking.events/analysis.requests/
  analysis.results, + `redpanda-console` at console.chess.localhost). Replica/replication init only
  run on a FRESH data dir ⇒ `stack.sh down -v` after touching them. Backend env already has
  `ConnectionStrings__PostgresReplica` and `Kafka__BootstrapServers` (unused until Part 0 code).
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
