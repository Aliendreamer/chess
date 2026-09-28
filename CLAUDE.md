# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Nx + pnpm monorepo (the `nx-monorepo` workspace skeleton) holding four apps:

- `apps/backend` — .NET 10 API (`Chess.Backend`): FastEndpoints + EF Core/Npgsql, Keycloak PKCE login,
  **server-owned opaque cookie session** (`mp_sid`; tokens never leave the server; logout revokes).
  Built from the `dotnet-webapi` prompt in "private behind an SSR BFF" mode.
- `apps/frontend` — TanStack Start SSR app (`chess-frontend`) that **is the BFF**: proxies `/api/auth/*`
  server-to-server, re-homes cookies, fetches page data via server functions. The browser only ever talks
  to `app.chess.localhost`. Built from the `fe-ssr-tanstack` prompt.
- `apps/engine` — .NET 10 worker (`Chess.Engine`): Stockfish 19 behind Kafka for games against the computer,
  outside the Akka cluster. Its image bakes in the Stockfish archive from `apps/engine/stockfish/` (git-ignored, GPLv3).
- `apps/proxy` — nginx edge for deployment (`/api/` → backend, `/` → frontend, `/hc` local 200).

Node ≥ 24, pnpm pinned in `package.json#packageManager` (bump deliberately). Docker is required for
the local stack and for the proxy target (its `build` makes a local `:local` image and never pushes;
`push` does that).

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

# engine (apps/engine)
dotnet build Chess.Engine.csproj && dotnet test Chess.Engine.Tests   # UCI client + worker against a fake engine
dotnet format Chess.Engine.slnx --verify-no-changes                   # = nx lint engine

# frontend (apps/frontend)
pnpm generate-routes                           # after adding/renaming route files
pnpm typecheck && pnpm lint && pnpm check      # = nx lint frontend
pnpm test / pnpm test:watch                    # vitest;  `pnpm vitest run src/lib/server/cookies.test.ts` for one file
pnpm build && API_URL=http://127.0.0.1:8080 pnpm start   # prod SSR server on :3000

tools/localdev/verify-auth.sh                  # curl-only login→/me→logout→revocation check vs the live stack
tools/localdev/verify-stack.sh                 # replica streaming + write→read, redpanda health/topics/round-trip, console
tools/localdev/verify-part0.sh [--cluster]     # login→ping→live→list→hub gate; --cluster kills backend-1 and re-checks
tools/localdev/verify-part1.sh [--cluster]     # two logins → queue pairing → invite → fool's mate → ended 0-1 + PGN;
                                               # --cluster: 6 games, SIGTERM backend-1, all answer from the survivor
tools/localdev/verify-part2.sh [--quick]       # vs Stockfish: 10 moves at 1320/2000/max, engine restart mid-think, a full game
tools/localdev/verify-part3.sh                 # correspondence: 7d invite, deadline, your-turn list, mails in Mailpit
tools/localdev/verify-part4a.sh                # studies: import, variation saved, 409 on stale save, share, PGN, from a game
tools/localdev/verify-part4b.sh                # engine analysis: a random position evaluated, then served from the shared cache
tools/localdev/stack.sh up --cluster            # adds backend-2 (down/ps/logs always include it)
tools/e2e.sh                                   # Playwright against the live stack
```

Agent sandbox note: MSBuild worker nodes, `dotnet format`'s build host, coverlet's mutex and the Docker
socket all need IPC the Claude Code sandbox blocks. Inside it: build with
`-m:1 -nr:false -p:EnableSourceControlManagerQueries=false`; `build_test.sh` reports 0% coverage (tests still
run); `dotnet format`, `stack.sh` and `verify-auth.sh` must be run by a human (`! <cmd>`).

Startup logging: `Program.cs` creates a Serilog bootstrap logger before anything else and runs each startup step
through `StartupSteps` (`Extensions/StartupLogging.cs`): every step is logged with its duration, one `StartupSummary`
event shows the node's settings (never secrets: connection strings shrink to host:port/db, Redis to on/off), and any
failure is a Fatal `Startup failed at {Step}` with exit code 1 — read `docker logs chess-backend-1` first when a node
won't start. Configuration: every operational value (timeouts, cache lifetimes, health limits, retry delays, page
sizes, sweep/passivation intervals) lives in an `ISettings` options class registered with `services.AddSettings<T>()`
(bind + validate at startup, registered as `T` and `IOptions<T>`) and listed in `Config/appsettings.json` with its
default; `SettingsTests` fails if the file and the class defaults drift. Game rules (D8/D15/D16/D17 timings) stay in
code on purpose. Array options must not default to a non-empty array (the binder appends): see `AkkaOptions.Roles`.

`Observability__Console=true` switches on OpenTelemetry console tracing (ASP.NET, HttpClient, Npgsql,
and the `chess.actors` source); it is off by default, including in Development.

Local URLs (Traefik on :80, dashboard on 127.0.0.1:8090): `app.chess.localhost`, `api.chess.localhost`,
`keycloak.chess.localhost` (admin/admin), `redisinsight.chess.localhost`, `mail.chess.localhost` (Mailpit), `console.chess.localhost`
(Redpanda). Postgres primary `127.0.0.1:5432`, replica `127.0.0.1:5433` (`chess`/`chess`/`chess`);
Redpanda Kafka API `127.0.0.1:19092`.

## Commit rules (load-bearing)

Conventional commits with a **required scope** from `frontend | backend | engine | repo | deps | proxy | ci |
release`, lower-case subject — enforced by commitlint on `commit-msg`. Nx Release derives version
bumps and per-project changelogs from these (`projectsRelationship: independent`, tags
`{project}@{version}`), so a non-conforming message is rejected, not just discouraged.
`pre-commit` runs `lint-staged --no-stash` (prettier on json/md/yml only; code formatting belongs
to each app's own lint target). Keep `--no-stash`.

## Architecture notes that span files

- **Auth flow (backend)** — endpoints in `WebApi/Auth/`, everything else in `Authentication/` (`Session.cs`, `Oidc.cs`,
  `CurrentUser.cs`): `LoginEndpoint` sets a short-lived `mp_pkce` cookie
  (`"<nonce>.<verifier>"`) and 302s to Keycloak; `CallbackEndpoint` → `CallbackValidator` (state nonce must match
  the cookie) → `KeycloakOidcClient.ExchangeCodeAsync` → `ISessionStore.CreateAsync` (stores only the SHA-256
  of the raw token) → `mp_sid` cookie → 302 to `{AppBaseUrl}{returnTo}` (`ReturnToSanitizer`: relative path
  only). `CookieBearerTokenResolver.OnMessageReceivedAsync` turns `mp_sid` into the bearer token for
  JwtBearer, refreshing at the IdP when the access token is within `SessionStore:AccessTokenLeeway` of
  expiry; an `Authorization` header always wins. `LogoutEndpoint` revokes the row first, so the old cookie is
  dead even if the IdP call fails. `UserProvisioningPreProcessor` (global) JIT-creates `users` rows by `sub`
  and fills the scoped `ICurrentUser`; `KeycloakRolesClaimsTransformation` flattens `realm_access.roles`.
  JwtBearer validates issuer AND audience `chess_api` (`Keycloak:Audience`, set in compose/Development/
  Production; empty only under the IntegrationTest env). Both `chess_api` and `chess_bff` carry an audience
  mapper in the realm export — a new client that calls the API needs one too, or every call is a 401.
- **Redis (backend)** — `ConnectionStrings:Redis` is the single switch: set (compose: `redis:6379`) ⇒ FusionCache
  gets Redis as L2 + backplane, the global rate limiter (300 req/min per client IP) becomes Redis-backed
  (shared across replicas), and `/health` includes Redis; unset ⇒ L1-only cache, in-memory limiter, no Redis
  health check. Unit tests run without Redis.
- **Forwarded headers (backend)** — `X-Forwarded-*` is trusted only from `ForwardedHeaders:KnownNetworks`
  (CIDRs) / `KnownProxies`; default is ASP.NET's loopback-only, `ForwardLimit = 1`. The compose network is
  pinned to `172.30.0.0/24` and passed as `ForwardedHeaders__KnownNetworks__0`. **Every deployment must set
  this to the edge's network**, otherwise the per-client rate limiter keys on the proxy's IP.
- **Backend layout** — two rules: no tiny files (interfaces with their implementations, options with the code that
  reads them, small related types in one file) and code grouped by functionality (no one-file folders). Exception: domain models
  (`Data/Models`, `Data/ReadModels`) and their EF configurations (`Data/ModelConfigurations`) are one class per file.
  `WebApi/{Area}/{Name}/` holds one endpoint per folder: `{Name}Endpoint`, `{Name}Request` (+ its `Validator<>`),
  `{Name}Response`, `{Name}Summary` (`Summary<TEndpoint>`); an area's shared base/mapper sits in the area root, and
  endpoint folders use the area's namespace (folder names like `Resign` would clash with the actor commands). Every
  endpoint declares its auth (`Policies(Constants.Policies.SignedIn)`, `Roles(Admin)`, or the anonymous auth group),
  validates input with a validator (malformed input = 400 before any actor is asked), sets `no-store` on live/command
  answers and `private, max-age=86400, immutable` on a finished game's reads, and takes timeouts/page size from
  `ApiOptions` (section `Api`). A POST whose request is route/query only must call `ClearDefaultAccepts()`, or a
  body-less call is a 415. Non-endpoint code: `Authentication/`, `Messaging/` (Kafka + `LiveRelay`), `Extensions/`
  (all startup wiring: builder, application, one `DatabaseExtensions`, one `AkkaExtensions`), `Akka/{Feature}/`,
  `Games/`, `Events/`, `Data/`, `Projections/`, `Utils/`. `Events/` and `Data/Models`/`Data/ReadModels` keep their
  namespaces: the journal stores `Chess.Backend.Events.X` type names and the EF snapshot names the entities.
- **Backend conventions** — everything `internal sealed` (tests via `InternalsVisibleTo`; Moq via
  `DynamicProxyGenAssembly2`); logging through `Utils/Log.cs` `[LoggerMessage]` methods (CA1873 forbids boxing
  args); config lives in `Config/appsettings*.json` (env vars override, `Keycloak__*` etc.); services named
  `Xxx : BaseService, IXxx` where `IXxx : IService` are auto-registered scoped by `AddConventionServices`.
  Endpoints are thin and `[ExcludeFromCodeCoverage]`; the logic they call is unit-tested.
  Lists use keyset (cursor) paging, never Skip/Take: `Utils/Keyset.NewestFirst` + `Keyset.ToPage` →
  `CursorPage<T>(Items, NextCursor, Limit)`, opaque `KeysetCursor`, and a composite `(at, id)` index per table.
- **BFF (frontend)** — `lib/server/cookies.ts` is the whole cookie contract: outbound `rehomeSetCookie`
  strips `Domain`, keeps lifetime, forces `Path=/; HttpOnly; SameSite=Lax`, adds `__Host-` + `Secure` when
  `COOKIE_SECURE=true` (never `NODE_ENV`); inbound `forwardCookieHeader` forwards only `mp_sid`/`mp_pkce`,
  mapping `__Host-` names back. `routes/api/auth/$.ts` is the public proxy route (outside `_authenticated`).
  `_authenticated.tsx#beforeLoad` calls `getMe()` and 302s anonymous users to `/api/auth/login?returnTo=`;
  route loaders call server functions (`lib/server/api.ts`) that re-attach the cookie and hit `API_URL`
  server-side. Components are presentational. **No `VITE_API_URL` ever** — the client bundle must not
  mention the API host. Layout (`frontend-layout` spec): files by feature, no tiny files, no one-file folders —
  `components/{ui,layout,games,pings}.tsx`; client-safe types and helpers in `lib/{auth,live,games,play,pings,moveInput}.ts`;
  `lib/server/` = `api.ts` (server functions + input checks), `cookies.ts`, `upstream.ts` (env, `LOGIN_REDIRECT`,
  `isGuid`, `readJson`, `postCommand` — defined once, never copied), and one file per feature (`auth`, `games`, `play`,
  `pings`, `live-relay`, `live-hub`). Client code never imports `lib/server/` except `api.ts`; imports use `#/` only. Pages run commands through
  `useCommand()` + `<ErrorText>` (`components/ui.tsx`), name the connection with `liveStatusText()`, give `useLiveTopic`
  `initial: { seq, payload }`, and keep markup in `components/` (route files = state and wiring).
- **Live relay (frontend + backend)** — browsers open `/api/ws/live/{kind}/{id}` on `app.`; `lib/server/live-relay.ts`
  checks the kind allow-list, validates the session with `GET /api/me` (4400/4401 otherwise, re-checked every
  `RELAY_REVALIDATE_MS`) and subscribes through `lib/server/live-hub.ts`: ONE SignalR connection per SSR process to
  `/hub/live`, authenticated as the `chess_bff` service account (service token in the same file, client credentials,
  `KEYCLOAK_TOKEN_URL` must be the PUBLIC issuer). `Messaging/LiveRelay.cs`: `LiveHub` admits only role `Relay`; `Subscribe(topic)` joins
  the group, then returns the kind's snapshot (`ILiveTopicSource`). Actors publish `LiveFrame(topic, seq,
payload)` to DistributedPubSub `live`; `HubFanOutActor` pushes it to the topic's group. The browser applies a
  frame only if its seq is newer (`lib/live.ts#applyFrame`). A new live kind = one `ILiveTopicSource` + one
  entry in the BFF's `KINDS`. Both relay hosts (Nitro route, `devLiveRelay` in `live-relay.ts`) only adapt sockets.
  Pages use `useLiveTopic` from `lib/live.ts` (initial = the loader's state as a frame; it is the baseline at subscribe only).
- **UI (frontend)** — the Club design (`Design/`, untracked, never committed) as TS: tokens are CSS variables in
  `styles.css`'s `@theme` (use `bg-surface-*`, `text-fg-*`, `border-line-*`, `font-display`, `rounded-card`; no zinc,
  dark only), fonts via `@fontsource` (no third-party requests). Screens: `/` (quick pairing, invite, recent
  games), `/invites/$id`, `/games/$id`, `/games`, and the `/pgn/$id` download route. **chess.js is feedback only**
  (`lib/moveInput.ts`): the server's answer/frame always wins. Commands return `CommandOutcome` (4xx is shown, 401
  redirects, 5xx throws); server functions validate path inputs. e2e signs each user in once (`e2e/auth.setup.ts` →
  gitignored `e2e/.auth/*.json`) and reuses the session: Keycloak's quick-login check locks a user logged in twice
  within a second, so specs never log in again except the signed-out ones in `auth.spec.ts`.

- **Journal outbox (backend)** — actors never produce to Kafka. `Akka/Outbox/`: `TopicTagger` tags events
  with their topic (tag table), `JournalPublisher` is a cluster singleton that takes a Postgres advisory lock
  (`PostgresPublisherLeaseProvider`, unpooled connection) and runs `JournalPublisherLoop`: `EventsByTag`
  after `outbox_offsets.LastOrdering` → `JournalEventMappers` → Kafka (acks=all) → save offset through the
  lock connection. Any failure releases the lease and resumes from the saved offset (at-least-once).
  Consumers dedupe via `IdempotencyGuard` on `(aggregateId, seq)` and stall on a gap
  (`ProjectionGapException`). A new event type needs a `TopicTagger.BoundTypes` entry AND a mapper.
  Every record goes through `Projections/ProjectionRunner`: `LastSeq` is a concurrency token (a lost race
  re-runs and skips), and any other exception is retried 5× then parked in `projection_dead_letters`,
  quarantining that `(group, aggregate)` until an Admin replays it (`WebApi/Admin/`). Gaps never park.

- **Games (backend)** — `Akka/Games/GameActor` (sharded `games`, persistence id `game-{id:N}`, Guid v7 ids) owns
  board and clocks; rules only via `Games/ChessRules` (Gera.Chess shares our root namespace `Chess`, so it is used
  through a `Gera` alias there and nowhere else; its auto-draw rules are OFF by default — the adapter turns on
  `All`). Clocks run from Black's first reply (−elapsed +increment); flag fall is an actor timer, a late move after
  the flag ends the game; recovery restores the side to move's clock as of the last event (D14). The `games`
  region has idle passivation OFF (Akka default 120 s would kill clocks); `PassivationPolicy` passivates 1 min
  after the end. Games start only through `IGameStarter`: from matchmaking (`Akka/Matchmaking/MatchmakingActor`, a cluster singleton;
  `POST|DELETE /api/matchmaking/{tc}`; `?heartbeat=true` every ~25 s keeps your place, 60 s silence drops you) or an invite
  (`Akka/Matchmaking/InviteActor`, sharded `invites`, 24 h; `POST /api/invites`, `GET /api/invites/{id}`, `…/accept`,
  `…/cancel`). Live kinds `queue:{tc}` and `invite:{id}`.
  Commands: `POST /api/games/{id}/moves|resign|draw/offer|draw/accept|draw/decline|abort|claim`, `GET …/live`.
  Presence: the BFF multiplexer reports `Present`/`Absent` for `game:` topics (per-process instance id, 30 s refresh);
  the actor's 75 s lease and 60 s abandonment are `Akka:PresenceLeaseSeconds` / `Akka:AbandonAfterSeconds`
  (integration tests shorten them). Every event a game persists must be tagged for `game.events`: consumers stall
  on a seq gap.
  Read side: `GameProjection` fills `rm_games` / `rm_game_players` / `rm_moves` (names = Keycloak
  `preferred_username` snapshotted per game, D23; PGN built at the end, D22); `GET /api/games?status=`,
  `/api/me/games`, `/api/games/{id}`, `…/moves`, `…/pgn` read the replica; a finished game's live snapshot comes from
  `rm_games` (`IEndedGameReader`) so its actor is not woken.

- **Games against the computer (engine-play)** — engine players are seeded `users` (ids -1…-5 = levels 1320,
  1600, 2000, 2400, max, shown as Stockfish (Casual/Club/Expert/Master/Maximum) because `UCI_Elo` is an engine
  scale; `Games/EngineLevel`), and `GameCreated`/`CreateGame` carry an optional `EnginePlayer(side,
level)`. Engine games are `untimed` (`TimeControl.Untimed`: no clock, flag or increment; never a preset, so not in the
  queue or invites; the first-move abort only while a person is to move; idle passivation after
  `Akka:UntimedIdleMinutes`), ignore presence (no abandonment) and refuse draw offers. `Engine/`:
  `EngineRequestConsumer` (on `game.events`, watermark on its `engine_games` row, kept after the end) produces to
  `engine.moves.requests` whenever the engine is to move, with a think time from `Engine:MinThinkMs`–`MaxThinkMs`
  (5–10 s); the worker (`apps/engine`, one Stockfish process + consumer per `Engine:Processes`, commit after produce)
  answers on `engine.moves.results`; `EngineMoveConsumer` sends `MakeMove(…, AtPly)` as the level's user, so stale or
  duplicate answers are refused. A game whose engine is silent for `Engine:StallSeconds` asks again through
  `IEngineRequests` — the one actor-side producer, owned by that service. Endpoints: `POST /api/engine-games`,
  `GET /api/engine-levels`.

- **Correspondence games (correspondence-games)** — `7d` (`TimeControl.Correspondence7`, invites only, never the
  queue): the player to move has `Correspondence:MoveDeadline` (7 days) from the previous move, reset every move; no
  clock, presence ignored, the game passivates when idle. The deadline is derived in the actor, never stored there;
  `DeadlineProjection` keeps `game_deadlines` from `game.events` and the `DeadlineSweeper` cluster singleton sends
  `CheckDeadline` every `Correspondence:SweepSeconds` to games past due — the actor judges (an abort before both first
  moves, else a loss on time; a late move ends it too). `NotificationConsumer` (row per game in `notification_games`)
  mails the player to move and both at the end through `IMailer`: MailKit when `Smtp:Host` is set (Mailpit in the
  stack), otherwise only logged. `GET /api/me/games?turn=mine` (+ `yourTurn`, `deadlineAt`, derived from `rm_games`:
  White moves on even plies) feeds "Your turn" on home. Playwright runs 2 workers: every spec drives two browsers
  against one dev server.

- **Studies (studies)** — plain rows on the primary (`studies`, tree as jsonb; no actor, no events), owned, shareable
  by link (random v4 id; a private study is 404 for others), `Version` as the concurrency token (a stale save is 409).
  `Studies/StudyTree` replays every line with `ChessRules.ForStudy` (any FEN, no automatic endings) and stores the
  server's SAN/FEN — the browser sends UCI only; `StudyPgn` exports with variations; `StudyService` holds the logic
  behind `WebApi/Studies/*` and `POST /api/games/{id}/study`. Frontend: `lib/studies.ts` (tree ops, PGN import with
  `@mliebelt/pgn-parser` — chess.js drops variations — per game, so a broken game is reported), `/studies`,
  `/studies/$id`, `/pgn/study/$id`. A controlled input must adopt text typed before hydration (see the import form).

- **Engine analysis (engine-analysis)** — `POST /api/analysis {positions, think}` (quick/normal/deep =
  `Analysis:QuickMs`/`NormalMs`/`DeepMs`, at most `Analysis:MaxPositions` = 10; "Analyse line" = the next 10) answers each position from the shared cache
  `position_evaluations` (PK `(PositionKey, ThinkMs)`; `Analysis/PositionAnalysis.cs`) — a longer think answers a
  shorter request — and produces the rest to `analysis.requests` (`KafkaAnalysisRequests` owns its producer), unless a
  request for that key and think is younger than `Analysis:RetryAfterSeconds`. `PositionKey.Of` = the FEN's first four
  fields, en passant kept only when a pawn can take (chess.js and Gera write it differently; `lib/analysis.ts#positionKey`
  mirrors it). The worker's analysis loop (`Engine:AnalysisProcesses`, own consumer group, full strength, MultiPV
  `Analysis:Lines`, scores turned to White's side) answers on `analysis.results`; `AnalysisResultConsumer` stores it,
  keeping the deeper of two answers. Scale with `Engine:AnalysisProcesses` or worker replicas (one group: total
  consumers ≤ the topic's 3 partitions). The study board (`AnalysisPanel`, `useAnalysis`) asks, then polls every 1.5 s for
  the pending positions; scores follow moves in the tree, and a line clicked is played into the study.

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
  `analysis.requests`, `analysis.results`; the integration fixture creates the engine and analysis topics itself) +
  `redpanda-console`. Backend env already carries
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
