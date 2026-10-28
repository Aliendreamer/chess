# apps/backend — Chess.Backend

Loaded when working under `apps/backend`. Cross-app rules live in the root `CLAUDE.md`; the BFF half of the live
relay and the UI rules are in `apps/frontend/CLAUDE.md`; the local stack and the observability stack in
`tools/localdev/CLAUDE.md`. Feature sections below also name the frontend files that go with each feature.

## Commands (run in apps/backend)

```bash
# backend (apps/backend)
dotnet build Chess.Backend.csproj              # warning-clean under AnalysisMode=All + TreatWarningsAsErrors
./build_test.sh                                # xUnit + coverage gate (COVERAGE_THRESHOLD, default 75)
dotnet test Chess.Backend.Tests --filter "FullyQualifiedName~SessionStoreTests"   # one class
./build_migration.sh "AddSomething"            # EF migration (dotnet-ef 10.x)
pnpm exec nx integration-test backend          # (from the repo root) Testcontainers round-trip + recovery (needs Docker)
```

## Startup, settings, telemetry

Startup logging: `Program.cs` creates a Serilog bootstrap logger before anything else and runs each startup step
through `StartupSteps` (`Extensions/StartupLogging.cs`): every step is logged with its duration, one `StartupSummary`
event shows the node's settings (never secrets: connection strings shrink to host:port/db, Redis to on/off), and any
failure is a Fatal `Startup failed at {Step}` with exit code 1 — read `docker logs chess-backend-1` first when a node
won't start. Configuration: every operational value (timeouts, cache lifetimes, health limits, retry delays, page
sizes, sweep/passivation intervals) lives in an `ISettings` options class registered with `services.AddSettings<T>()`
(bind + validate at startup, registered as `T` and `IOptions<T>`) and listed in `Config/appsettings.json` with its
default; `SettingsTests` fails if the file and the class defaults drift. Game rules (D8/D15/D16/D17 timings) stay in
code on purpose. Array options must not default to a non-empty array (the binder appends): see `AkkaOptions.Roles`.

`Observability:Enabled` (off in `appsettings.json`, on in the stack) exports traces, metrics and logs over OTLP to the
collector (`Observability:OtlpEndpoint`), as `chess-backend` with the Akka hostname as `service.instance.id`; logs go
through Serilog's OTLP sink with their trace ids. `Observability:SampleRatio` (1.0) is a parent-based head sampler.

## Architecture

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
  gets Redis as L2 + backplane, the global rate limiter (300 req/min per signed-in user, per client IP when anonymous; keyed after authentication) becomes Redis-backed
  (shared across replicas), and `/health` includes Redis; unset ⇒ L1-only cache, in-memory limiter, no Redis
  health check. Unit tests run without Redis.
- **Forwarded headers (backend)** — `X-Forwarded-*` is trusted only from `ForwardedHeaders:KnownNetworks`
  (CIDRs) / `KnownProxies`; default is ASP.NET's loopback-only, `ForwardLimit = 1`. The compose network is
  pinned to `172.30.0.0/24` and passed as `ForwardedHeaders__KnownNetworks__0`. **Every deployment must set
  this to the edge's network**, otherwise the per-client rate limiter keys on the proxy's IP. The BFF tells the API
  who calls: every upstream request (server functions, the auth proxy, PGN downloads, the relay's session check)
  carries `X-Forwarded-For: <client>` from `upstream.ts#clientIp` — the rightmost entry its edge appended, so exactly
  one proxy hop may sit in front of the BFF — and the BFF's network must be in `KnownNetworks` too.
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
- **Journal outbox (backend)** — actors never produce to Kafka. `Akka/Outbox/`: `TopicTagger` tags events
  with their topic (tag table), `JournalPublisher` is a cluster singleton that takes a Postgres advisory lock
  (`PostgresPublisherLeaseProvider`, unpooled connection) and runs `JournalPublisherLoop`: `EventsByTag`
  after `outbox_offsets.LastOrdering` → `JournalEventMappers` → Kafka (acks=all) → save offset through the
  lock connection. Any failure releases the lease and resumes from the saved offset (at-least-once).
  Consumers dedupe via `IdempotencyGuard` on `(aggregateId, seq)` and stall on a gap
  (`ProjectionGapException`). A new event type needs a `TopicTagger.BoundTypes` entry AND a mapper.
  Every record goes through `Projections/ProjectionRunner`: `LastSeq` is a concurrency token (a lost race
  re-runs and skips), and any other exception is retried 5× then parked in `projection_dead_letters`,
  quarantining that `(group, aggregate)` until an Admin replays it (`WebApi/Admin/`; in the browser at `/admin`,
  admin-screens, shown only to the `Admin` role — a new consumer group also goes into `lib/admin.ts#PROJECTION_GROUPS`). Gaps never park.

- **Games (backend)** — `Akka/Games/GameActor` (sharded `games`, persistence id `game-{id:N}`, Guid v7 ids) owns
  board and clocks; rules only via `Games/ChessRules` (Gera.Chess shares our root namespace `Chess`, so it is used
  through a `Gera` alias there and nowhere else; its auto-draw rules are OFF by default — the adapter turns on
  `All`). Clocks run from Black's first reply (−elapsed +increment); flag fall is an actor timer, a late move after
  the flag ends the game; recovery restores the side to move's clock as of the last event (D14). The `games`
  region has idle passivation OFF (Akka default 120 s would kill clocks); `PassivationPolicy` passivates 1 min
  after the end. Games start only through `IGameStarter`: from matchmaking (`Akka/Matchmaking/MatchmakingActor`, a cluster singleton;
  `POST|DELETE /api/matchmaking/{tc}`; `?heartbeat=true` every ~25 s keeps your place, 60 s silence drops you) or a
  rematch or a challenge — there are no invite links (remove-friend-invites); `Akka/Matchmaking/InviteActor` (sharded
  `invites`) serves rematches (24 h) and challenges (60 s, club-members). Live kinds `queue:{tc}` and `invite:{id}`. **Rematch (game-feedback)**: `POST /api/games/{id}/rematch`
  (`Rematch.Offer` + `OfferRematch`) is an invite whose id IS the finished game's id, reserved for the other player
  (`InviteCreated.ForId`, optional, so old rows read), colours swapped; first call offers, the guest's call accepts. The
  game page watches `invite:{gameId}` once the game ends (`useLiveTopic({ enabled })`). The tab title/favicon signals
  and the rematch state are pure in `lib/feedback.ts`.
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
  `Akka:UntimedIdleMinutes`) and refuse draw offers. Presence counts only the person, from their first move, reported
  or not (engine-game-abandonment): a minute away ends the game, the engine winning by `Abandonment` (no claim), and the
  `IdleGameSweeper` singleton (`Akka/Games/`) sends `WakeIdle` every `Akka:IdleSweepSeconds` to untimed games quiet for
  `UntimedIdleMinutes` so a game nobody is at still ends. The
  engine's stall timer is due from the start of its turn (`_stallDue`), so presence re-arming never pushes it back. `Engine/`:
  `EngineRequestConsumer` (on `game.events`, watermark on its `engine_games` row, kept after the end) produces to
  `engine.moves.requests` whenever the engine is to move, with a think time from `Engine:MinThinkMs`–`MaxThinkMs`
  (5–10 s); the worker (`apps/engine`, one Stockfish process + consumer per `Engine:Processes`, commit after produce)
  answers on `engine.moves.results`; `EngineMoveConsumer` sends `MakeMove(…, AtPly)` as the level's user, so stale or
  duplicate answers are refused. A game whose engine is silent for `Engine:StallSeconds` asks again through
  `IEngineRequests` — the one actor-side producer, owned by that service. Endpoints: `POST /api/engine-games`,
  `GET /api/engine-levels`.

- **Club members (club-members)** — accounts come only from an Admin (`/admin` Members: `WebApi/Admin/Members/`,
  `Authentication/MemberAdmin.cs` + `KeycloakAdmin.cs`, the `chess_api` service account's admin REST API with
  `manage-users` + `view-realm` from `keycloak-init`): create (a temporary password shown once, changed at first
  sign-in; the `users` row is made at once), deactivate (Keycloak disabled, `users."Active"` false, every session
  revoked, challenges and queue places dropped; the provisioning pre-processor answers 401, cached `user-active:{id}`),
  reactivate, reset password, Admin on/off (never your own off). Keycloak first, then the database: a Keycloak failure
  is a 502 with nothing changed. Presence: the Shell subscribes `user:{me}` on every page (the relay allows only your
  own id) and the BFF reports Present/Absent for it as for `game:`; the `presence` singleton (`Akka/Presence/`) holds
  the leases, who is playing (`GameActor` announces person-vs-person games on pub/sub `presence`; reloaded from
  `rm_games` after a failover), `users."LastSeenAt"` and the challenge reservations. Live kinds `members:all` and
  `user:{id}` (open challenges to you). `GET /api/members`; `/members` lists them with Challenge:
  `POST /api/challenges {opponentId, timeControl, color}` (refused when offline, playing or already challenged),
  `…/{id}/accept|decline|cancel`; a challenge is an invite with `Kind` and `LifetimeSeconds` (optional fields: old rows
  read) and a 60 s actor timer (`InviteExpired`), shown on any page by `ChallengeBanner`. Profiles link Analyse on
  finished games.

- **No correspondence games (remove-correspondence)** — there is no `7d` time control, no move deadlines and no mail:
  games are live (presets) or against the computer (`untimed`). Playwright runs 2 workers: every spec drives two
  browsers against one dev server.

- **Studies (studies)** — plain rows on the primary (`studies`, tree as jsonb; no actor, no events), owned, shareable
  by link (random v4 id; a private study is 404 for others), `Version` as the concurrency token (a stale save is 409).
  `Studies/StudyTree` replays every line with `ChessRules.ForStudy` (any FEN, no automatic endings) and stores the
  server's SAN/FEN — the browser sends UCI only; `StudyPgn` exports with variations; `StudyService` holds the logic
  behind `WebApi/Studies/*` and `POST /api/games/{id}/study`. Frontend: `@chess/ui` `studies-model.ts` (tree ops, PGN import with
  `@mliebelt/pgn-parser` — chess.js drops variations — per game, so a broken game is reported), `/studies`,
  `/studies/$id`, `/pgn/study/$id`. A controlled input must adopt text typed before hydration (see the import form).
  **Analysis board (analysis-board)**: `/analysis` analyses any position without saving (`?fen=`, `?game={id}` for a
  finished game only — judged by the live view, `lib/server/games.ts#loadFinishedGame`, since the replica lags; or a
  pasted FEN/PGN); the study page and it share `@chess/ui` `studies.tsx#AnalysisBoard` + `studies-model.ts#useMoveTree`.
  The game page's Analyse opens the board; Save as study there makes the study. **Game library (game-library)**:
  `library_games` (moves and factual headers, never annotations, each with `source` and `licence`), `library_positions`
  (every position a game reached, by `PositionKey`) and `openings` (lichess `chess-openings`, CC0, embedded from
  `apps/backend/Library/Openings/*.tsv` and seeded at startup under an advisory lock). Admins import PGN on `/admin`
  (`POST /api/admin/library/import`, ≤100 games: replayed from the start, illegal → refused, `DedupeKey` → duplicate);
  members search `/library` (`pg_trgm` ILIKE on names/event) and the analysis board shows the opening and "In the
  library" per position (`?library={id}&ply=`). The explorer (library-explorer) is the same endpoint's `moves`: the next move of every game
  at the position, with W/D/B and the opening reached, counted in SQL from `library_positions` (ply 0 stored; each row
  copies the next move, result and source; a game counts once, at its first visit), cached per (key, source) under the
  `library-positions` tag, which an import that stores games removes. **Broadcasts (broadcast-explorer)**: `/admin` starts
  a month (`POST|GET /api/admin/library/broadcasts`); the `library-importer` singleton streams lichess's
  `.pgn.zst` (`Library/Broadcasts.cs`, `Pgn.cs`, `BroadcastImport.cs`; runs in `library_import_runs`) through
  `LibraryBroadcasts:*` (2400+, no blitz, 40 plies of positions); `source=all|wc|broadcasts` on the reads, `?src=` on
  `/analysis`, a CC BY-SA credit wherever broadcasts count. PGN collections are never committed: `tools/library/SOURCES.md` lists
  what may be imported and under which licence. Fields typed before hydration: `useAdoptTyped`, or a plain GET form. **Opening trainer (opening-trainer)**:
  `openings."MovesUci"` (reseeded once when a row lacks it) gives each named line its moves; `Trainer/OpeningFamilies`
  groups them by the name before ':' (search also matches a variation, the name before ','), and a family's lines are
  only its leaves (no line of the group extends them). `trainer_progress` (PK user, line, colour) holds a Leitner box
  0–5 and a due time (`TrainerSchedule`: clean = up a box, due after 0/1/3/7/14/30 days; a mistake = box 0, due now;
  next = lowest due box, then oldest due, then new; learned from box 3), on the primary and only the member's own.
  `GET /api/trainer/families?q&color`, `…/family?name&color`, `…/next`, `POST …/results`, `GET /api/me/trainer`.
  `/trainer` shows the families in columns by kind (`@chess/core#openingKind`: gambits, defences, openings,
  games), each scrolling inside the `wide fill` page (trainer-columns). Frontend: `@chess/ui` `trainer-model.ts#useDrill` (the board plays the other side after 400 ms, a wrong move is shown with the
  right one and must be replaced, `onDone(mistakes)` once), `/trainer`, `/trainer/$family?color=`, the rail's Trainer
  and "Openings trained" on the member's own profile only. **Study lines (study-repertoire-trainer)**: `Trainer/StudyLines`
  makes every start-to-leaf path of the member's OWN study a line (main line first; a path with no move for the side
  is skipped), keyed `study:` + SHA-256 of the start position and its moves, so reordering keeps progress and a
  changed line starts over; `trainer_progress."StudyId"` (cascade) marks them, and `StudyService.UpdateAsync` drops
  rows for lines the saved tree lost. `GET /api/trainer/studies`, `…/{id}`, `…/{id}/next`, `POST …/{id}/results`;
  `/trainer?source=studies`, `/trainer/study/$id` (`useDrill` takes a start FEN and the other lines: another line's
  move is named, not counted). **Game review (game-review)**: `POST /api/games/{id}/review` (a player of an
  ended game, or an Admin; 409 while played) sends the positions the shared cache lacks to `analysis.review.requests`
  at `Review:ThinkMs` (800 ms, kept apart from the board's think times) — the worker's own review loop
  (`Engine:ReviewProcesses`, `MaxReviewAgeSeconds`) answers on `analysis.results`, so reviews never queue ahead of
  interactive analysis. `GET …/review` computes the review on read (`Review/GameReviewer`, pure: lichess's winning
  chances, 0.1/0.2/0.3 = ?!/?/??, the engine's own move never marked, a board ending judged from the result, the book
  exit from `openings`); a finished game is reviewed automatically (`Training/AutoReview.cs`, group
  `chess.auto-review`; not aborted, ply ≥ 2). Frontend: `@chess/ui` `review-model.ts` (`useReview` polls every 2 s while running),
  `review.tsx` (`EvalGraph`, `ReviewPanel` on the ended game page with the clickable better line,
  move-list marks). **Training (training-sessions)**: `/training` (`/practice` redirects), two modes. _My games_:
  `mistake_drills`, filled lazily by `TrainingService.SyncAsync` from complete reviews (once per member and game,
  `training_synced`). _Master games_: `training_positions`, critical moments mined from `library_positions` by the
  `training-miner` singleton (`Training/TrainingMiner.cs`: candidates in `training_candidates`, evaluated through the
  shared `ReviewQueue` at `Review:ThinkMs`, kept when best − second ≥ `Training:MinGap` in winning chances, from
  `Training:MinPly`, ≤ `Training:PerGame` per game, ≤ `Training:InFlight` waiting; runs only with Kafka). Stateless
  sessions: `GET /api/training/next?mode&eco&phase&player&from&to&exclude` (ids `g:{gameId:N}:{ply}` /
  `p:{positionId:N}`), `POST /api/training/answer` (the server judges: master's move or engine-accepted, verdict
  `master|engine|both|none`; Leitner via `TrainerSchedule`, progress in `training_progress`), `GET
/api/training/summary`. Frontend: `@chess/ui` `training-model.ts` (session reducer, verdict text, `useAnswerBoard`),
  `training.tsx`; 10-position sets or endless.
  The local stack allows `RateLimit__PermitLimit=1200` (the e2e suite's pace). **Chess news (chess-news)**: the
  `news-fetcher` cluster singleton (`News/`) runs `INewsRounds` every `News:FetchMinutes` over `News:Feeds` (FIDE,
  ChessBase, Lichess blog, TWIC with its `Accept` header — never chess.com: its terms; only enabled feeds are listed) and every
  `News:EventsMinutes` over lichess's broadcast list (`chess_events`, replaced whole; 60 s pause after a 429;
  `News__LichessToken` env var only). `FeedParser` refuses DTDs, keeps plain-text titles and https links only — never
  article text or images (no third-party requests from the browser). `GET /api/news`, `/news/sources`, `/news/events`;
  home's News and Events now, `/news`. `News__Enabled=false` keeps tests off the internet; metric `chess.news.fetch`.

- **Engine analysis (engine-analysis)** — `POST /api/analysis {fen, think}` (one position: the one on the board;
  quick/normal/deep = `Analysis:QuickMs`/`NormalMs`/`DeepMs`) answers it from the shared cache
  `position_evaluations` (PK `(PositionKey, ThinkMs)`; `Analysis/PositionAnalysis.cs`) — a longer think answers a
  shorter request — or produces it to `analysis.requests` (`KafkaAnalysisRequests` owns its producer), unless a
  request for that key and think is younger than `Analysis:RetryAfterSeconds`. `PositionKey.Of` = the FEN's first four
  fields, en passant kept only when a pawn can take (chess.js and Gera write it differently; `@chess/core#positionKey`
  mirrors it). The worker's analysis loop (`Engine:AnalysisProcesses`, own consumer group, full strength, MultiPV
  `Analysis:Lines`, scores turned to White's side) answers on `analysis.results`; `AnalysisResultConsumer` stores it,
  keeping the deeper of two answers. Scale with `Engine:AnalysisProcesses` or worker replicas (one group: total
  consumers ≤ the topic's 3 partitions). The study and analysis boards (`AnalysisPanel`, `useAnalysis`) ask for the position on the board
  once it settles (`useAutoEvaluate`, 300 ms; no button), then poll every 1.5 s until the evaluation is there; both pages
  are `wide fill` columns (board | moves + engine | library games from `wide:`, 1600px); scores of the positions evaluated follow their moves in the tree, and a line clicked is played into the study.

- **One trace per user action:** senders `ActorTracing.Wrap(cmd)` (a `Traced` envelope, only while tracing);
  extractors `Unwrap`; every actor overrides `AroundReceive` with `ActorTracing.Receive(actor, …)` (a span and the
  `chess.actor.*` metrics; timers start root traces); every persist is written as
  `PersistAll(ActorTracing.StampAll(events), ActorTracing.Persisting<T>(actor, count, e => …))`. Events carry `Trace`
  (`ITracedEvent`, `[JsonIgnore]`, so Kafka payloads are unchanged); the publisher writes it as the `traceparent`
  header (`OutboxRecord.ToMessage`); `ProjectionRunner` continues it (a `consume {group}` span with the outcome); and
  `LiveFrame.trace` carries it to the BFF, which strips it before the browser. A new actor, sender or event must follow
  these, or its trace breaks. Metric labels are types only, never ids (`ActorMetricsTests` checks). The BFF loads its
  SDK with `node --import ./otel/instrument.mjs` (`dev:stack`, `start`, and the prod image, which ships only
  `apps/frontend/otel`, its own workspace package, deployed with `pnpm deploy`; it must declare `@opentelemetry/api`,
  the SDK's peer). The page's tracer reports to `POST /otel/v1/traces` on `app.`.
