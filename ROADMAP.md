# Chess — architecture & roadmap

A chess platform built deliberately as an **experiment in Akka.NET + Kafka + CQRS on Postgres**, on top of
the SSR-BFF cookie-session auth that already ships. The product is real (four play modes); the
architecture choices are the point. Everything runs self-contained from `tools/localdev/`.

Legend: **[decided]** = settled with the owner · **[default]** = agent's proposal, change freely ·
**[open]** = needs a decision before the part that uses it.

## 1. Principles

1. **Postgres is the source of truth.** Actors and Kafka are how state moves and recovers, never what
   we trust. If they disagree with the database, the database wins. [decided]
2. **Writes to the primary, reads from the replica.** Every query path is designed for replication lag
   from day one; "read your own write" is served from the actor, not the replica. [decided]
3. **Akka.NET actors are the sync plane.** A live game is one actor: it owns the in-memory truth of the
   game while it is being played, validates moves, runs clocks, and fans state out. [decided]
4. **Kafka is the event backbone, derived from the journal.** Actors persist domain events; a single
   fenced publisher tails the Akka journal into Kafka, and everything downstream (persistence
   projections, notifications, analysis, engine work) is an idempotent consumer. The journal is the
   recovery source; Kafka is never ahead of it. [decided — journal-outbox, 2026-09-23; supersedes
   "Kafka replay second"]
5. **The browser has one origin.** `app.` (the SSR BFF) is the only host the browser talks to, for
   HTTP _and_ realtime. The API stays internal. [decided]
6. **Experiment honestly.** Each part ends with a short written note: what Akka/Kafka bought us, what it
   cost, what we'd do differently. That's a deliverable, not an afterthought. [default]

## 2. System shape

```text
 browser ──http+ws──► app.  SSR BFF (TanStack Start, Nitro)
                        │  /api/auth/* proxy, server fns, WS relay (§4)
                        ▼  cookie forwarded, API name
                     backend (FastEndpoints)  ── /api/*  HTTP commands + queries
                        │                     ── /hub    realtime (SignalR)
                        ▼
                     Akka.NET ActorSystem
                       GameActor(gameId)  ClockActor  MatchmakingActor  EngineActor pool …
                        │ persist                     │ publish
                        ▼                             ▼
             Akka.Persistence journal ───────►   Kafka (Redpanda)  topics: game.events, …
             (Postgres PRIMARY)                       │ consume
                                                      ▼
                                              Projections (backend hosted services)
                                                      │ write read models
                                                      ▼
                    Postgres PRIMARY ──streaming replication──► Postgres REPLICA
                    (writes: journal, projections,              (reads: every GET, lists,
                     users, sessions)                            history, analysis)
```

- **Command side**: HTTP `POST /api/games/{id}/moves` → backend → `GameActor` (via `ActorRegistry`).
  The actor validates with the rules engine, persists the event (journal on the primary), replies to
  the caller, pushes the new state to subscribers. It does not publish: the journal publisher (a
  cluster singleton fenced by a Postgres advisory lock) tails the journal into Kafka from a stored
  offset, so a persisted event reaches Kafka even if the node dies right after the write.
- **Query side**: `GET /api/games/{id}` and lists read the **replica** through a read-only `DbContext`.
  A game that is live may also be read straight from its actor (`?live=true` / the hub), which is how
  "I just moved, show me the board" never sees replica lag.
- **Projections** consume Kafka and upsert read tables on the primary. Idempotent by `(gameId,
sequenceNr)` with a per-consumer high-water mark; a gap in `sequenceNr` stalls the consumer instead
  of skipping. Replaying a topic (or resetting the publisher offset) rebuilds a read model from scratch.
- **Recovery**: a node restart re-hydrates `GameActor` from its journal. Kafka is derived from the
  journal and can never be ahead of it, so there is nothing to reconcile from Kafka. [decided —
  journal-outbox, 2026-09-23; supersedes "reconciles from Kafka from its last snapshot offset"]

## 3. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| D1  | Postgres primary/replica; reads always replica, writes always primary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | decided              |
| D2  | Akka.NET (Akka.Hosting) inside the backend process; one `ActorSystem` per backend replica; Cluster.Sharding added only when we run >1 backend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | default              |
| D3  | Akka.Persistence.Sql (Linq2Db → Postgres primary) for journal + snapshots; `akka` schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | default              |
| D4  | Kafka via **Redpanda** locally (single binary, Kafka API, includes console); code uses the Confluent client / Akka.Streams.Kafka so real Kafka is a config change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | default              |
| D5  | Realtime: browser ↔ `app.` WebSocket (Nitro/crossws); the SSR server holds **one SignalR connection per node** under a service identity (Keycloak client credentials), checks each browser's session cookie itself before subscribing it, and fans out per topic. `Subscribe` returns the current state (actor, or replica for a finished game) and frames carry `seq` so a late subscriber drops stale ones. Per-user private streams keep a per-session connection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | decided (2026-09-25) |
| D6  | Rules engine: **Gera.Chess** (MIT, 1.2.0) for legality, SAN/FEN/PGN, checkmate/stalemate, threefold, 50-move, insufficient material; the actor never re-implements rules. Chosen over ChessLib (2026-09-25): its only NuGet release is 0.0.3 from 2022, with fixes unpublished. Per-side "can still mate" (D18 flag fall) is a small helper of ours. Revisit for Chess960                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | decided (2026-09-25) |
| D7  | Engine: Stockfish in its own container, UCI over stdio, driven by an `EngineActor` pool with a bounded mailbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | default              |
| D8  | Topics: `game.events` (keyed by gameId), `matchmaking.events`, `analysis.requests`/`analysis.results`; JSON payloads with a `type` + `version`; schema registry not used initially                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | default              |
| D9  | Read-model tables live next to the write tables in `public`, prefixed `rm_`; journal in schema `akka`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | default              |
| D10 | Identity in the actor world = local `users.id` (from the session), never the Keycloak `sub`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | default              |
| D11 | New entity ids are **Guid v7** in native `uuid` columns (time-ordered like ULID, 16 bytes, native in .NET/EF/Npgsql/PG 18 `uuidv7()`); never ids stored as text. A ULID-style base32 form only at the URL boundary, if a shared link needs it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | decided (2026-09-24) |
| D12 | Time controls for Part 1 (minutes + Fischer increment in seconds): bullet 1+0, 2+1 · blitz 3+0, 3+2, 5+0, 5+3 · rapid 10+0, 10+5, 15+10 · classical 30+20, 90+30. No delay modes, no custom controls. Chess960 (Fischer Random) comes later                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | decided (2026-09-25) |
| D13 | `GameActor` owns the board **and the clocks** (no `ClockActor`). Keeps the ChessLib board + clocks in memory and rebuilds from its own journal (snapshot + events, never the read model). Each move persists a self-describing event: UCI, SAN, FEN after the move, both clocks, server timestamp. Only the two participants (`users.id`, D10) may send commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | decided (2026-09-25) |
| D14 | Clocks: flag fall is an actor timer set to the mover's remaining time; move time is the server's receive time, never the client's. On recovery (failover) the side to move gets its clock back **as of the last persisted event**, so an outage never costs a player time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | decided (2026-09-25) |
| D15 | Abort / abandon: once both players are in, a game whose first move is not made within **1 min** is **aborted** (no result); link games wait for an opponent per D17. Presence comes from the BFF (it knows each user's game sockets) as persisted `PlayerLeft` / `PlayerReturned` commands; `PlayerLeft` only when that user's last socket closes. After **1 min** absent the remaining player **chooses**: claim the win, call it a draw, or keep waiting; if the absent player returns first, play continues. Refined 2026-09-26 (presence-and-abandonment): the BFF counts sockets per (game, user) and reports `Present`/`Absent` under a per-process **instance id**, refreshed every 30 s; the actor drops an instance not heard from in **75 s** (covers a crashed BFF or hub node). Only while playing after both first moves; a claim is `1-0`/`0-1` or `1/2-1/2` with reason `Abandonment`. Presence events go to `game.events` like every game event (projections stall on a seq gap) | decided (2026-09-25) |
| D16 | Matchmaking: one queue per D12 time control, **first come, first served** (no rating), random colours. One cluster-singleton `MatchmakingActor` owns every queue (refined 2026-09-26: queues hold at most one seeker since pairing is immediate, so sharding bought nothing); queues are **not persisted**: a seeker re-POSTs `/api/matchmaking/{tc}` as a heartbeat (~30 s, dropped after 60 s silence), which also re-queues them after a failover (refined: no BFF re-queuing). A pairing is remembered 60 s so a raced heartbeat learns its game. One queue entry per user (joining another moves you). The queue is a live kind (`queue:{tc}`) on the relay                                                                                                                                                                                                                                                                                                                                 | decided (2026-09-25) |
| D17 | Invite links: the creator picks the time control and a colour (white / black / random); the game waits `open` until **any signed-in user** opens the link and joins (first wins; anonymous visitors bounce through login and `returnTo` back), the creator cancels, or **24 h** pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | decided (2026-09-25) |
| D18 | Game endings: checkmate, stalemate, insufficient material, **threefold** and **50-move** end the game automatically (ChessLib, after each move). Flag fall loses unless the opponent lacks mating material (then draw). Resign any time after the first move (before it: abort, D15). One pending draw offer, which lapses on the opponent's move or decline; no re-offer until the offerer has moved again. No takebacks in Part 1. Every ending persists one `GameEnded(result, reason)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | decided (2026-09-25) |
| D19 | Part 1 read side: `rm_games` (players, time control, status open/playing/ended/aborted, result + reason, move count, last FEN, timestamps, `LastSeq`) and `rm_moves` (game, ply, UCI, SAN, FEN after, clocks, server time); both projected on the primary, read from the replica, keyset-paged. PGN is built from `rm_moves` SAN without ChessLib. The `game` live snapshot comes from the actor while playing and from the replica once ended                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | decided (2026-09-25) |
| D20 | Spectators: any signed-in user may watch any game (read-only board); only the two players may act                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | decided (2026-09-25) |
| D21 | Ratings are **not** in Part 1 (the queue is first come, first served). Later: Glicko-2 from `GameEnded` via a Kafka consumer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | decided (2026-09-25) |
| D22 | A game's canonical record is its **move list** (UCI + SAN per `MoveMade`; UCI in snapshots). FEN is stored per move as a cached position only, since it can't recreate a game or detect repetition. **PGN** is the exchange format, generated when a game ends and stored with the finished game. Passivation follows the game type: live controls never passivate while playing; correspondence (Part 3) will                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | decided (2026-09-26) |
| D23 | Player display name = Keycloak `preferred_username` (`users.Username`), never email or full name; snapshotted onto each game when it is created (lists and PGN keep the name as it was); fallback `Player {id}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | decided (2026-09-26) |

## 4. Realtime through the BFF (D5)

The browser must never open a socket to the API. Two ways to keep that true:

- **A. Relay in the SSR server** [default]: the browser opens `wss://app./ws/games/{id}`; the Nitro
  server (crossws) authenticates it by the same cookie the pages use, then acts as a SignalR _client_
  to the backend hub, forwarding the session cookie exactly as server functions do. One backend
  connection per browser socket; messages pass through untouched. Keeps every existing invariant
  (`cookies.ts`, `forwardCookieHeader`), costs a hop and some SSR-server memory per socket.
- **B. Proxy the WebSocket at the edge**: nginx/Traefik upgrades `/hub` straight to the backend. Cheaper,
  but the browser now holds a socket to the API's route, and the `__Host-` cookie name mapping has to
  happen at the edge instead of in code we test.

Part 1 starts with a **spike on A** (one afternoon): a page that subscribes to a fake game actor and
receives ticks. If the relay is awkward under Nitro, fall back to B with a documented reason.

## 5. Consistency rules (write once, apply everywhere)

- A command's HTTP response carries the resulting state from the **actor** (not a re-read).
- Lists and history read the **replica** and are labelled "eventually consistent" in the API docs.
- The UI treats the live hub as truth for the game it is watching and the replica for everything else.
- Projections are idempotent; a replay must never double-apply. Version every event.
- Clocks are owned by the actor; the client only displays; disagreement → actor wins.

## 6. Parts

Each part: spec → plan → implement (TDD) → verify against the live stack → experiment note.

### Part 0 — Spine (cross-cutting, before any mode)

Goal: the architecture exists end to end with a trivial domain, so every later part only adds chess.

- Compose: Postgres **replica** (same image, `pg_basebackup` init, `hot_standby`), **Redpanda** +
  console, **Stockfish** image stub (used in Part 2), all on the `chess` network.
- Backend: `Akka.Hosting` + `Akka.Persistence.Sql` (journal/snapshot tables migrated by the app),
  `ReadDbContext` (replica, `NoTracking`, `QueryTrackingBehavior` off, read-only connection string) next
  to the existing write `ProjectDbContext`; health checks for replica + Kafka.
- A `PingActor` that persists `Pinged` events and publishes them to Kafka; a projection that writes
  `rm_pings`; `POST /api/ping` (primary via actor) and `GET /api/pings` (replica). Proves: persist →
  publish → project → replicate → read.
- Realtime spike (§4) with the `PingActor`.
- Tooling: Akka TestKit + Testcontainers (Postgres, Redpanda) in a separate `integration-test` Nx
  target (`tools/test-all.sh` already has the hook); OpenTelemetry traces across HTTP → actor → Kafka.
- Verify: `verify-auth.sh` still green; a ping round-trips; kill the backend mid-flight, restart,
  `GET /api/pings` complete; replica lag visible in a health detail.

### Part 1 — Live games vs people

- Domain: `GameActor` (state machine: created → playing → ended; move validation via D6; clocks via a
  `ClockActor` child), `MatchmakingActor` (queue by time control), invites by link.
- API: create/join/resign/offer-draw/move; hub events: `state`, `move`, `clock`, `ended`.
- Read side: `rm_games` (list, my games), `rm_moves` (history, PGN export).
- FE: game page (board component, clocks, move list), lobby, invite page — SSR for the initial state,
  hub for updates. Board UI library to evaluate (react-chessboard) vs own.
- Verify: two browsers play a full game; a node restart mid-game resumes with clocks; the replica
  shows the finished game; Playwright covers create → join → move → resign.

### Part 2 — Play vs the computer

- Built as `engine-play` (2026-09-27): the Stockfish pool lives in its own worker container (`apps/engine`), not an
  `EngineActor` — it keeps engine CPU away from the game clocks and scales on its own. Moves use their own topics
  (`engine.moves.requests` / `.results`); `analysis.*` stays for Part 4. Strength via `UCI_LimitStrength` +
  `UCI_Elo` (levels 1320, 1600, 2000, 2400, max, shown as Casual, Club, Expert, Master, Maximum); engine games are untimed for now, 5–10 s per engine move.
- The same `GameActor` — the engine is a seeded player, not a special game type.
- Verify: `tools/localdev/verify-part2.sh` (three strengths, an engine restart mid-think, a full game).

### Part 3 — Correspondence / async games

- Built as `correspondence-games` (2026-09-27): `7d`, a week per move reset every move, from invites. Same actors,
  passivated when idle and recovered on the next command; no running clocks. Instead of a `deadline.expired` topic,
  deadlines are a projected table (`game_deadlines`) read by a `DeadlineSweeper` singleton that asks each game past
  due to check itself — the game stays the judge.
- Notifications consumer on `game.events` mails "your move" and results through SMTP (MailKit; Mailpit locally, a
  production provider by configuration later).
- Verify: `tools/localdev/verify-part3.sh` on the stack; forfeits and passivation in the integration and unit tests
  (deadlines shortened to seconds).

### Part 4 — Study & analysis

- Two changes (owner decision 2026-09-28). **`studies` — built 2026-09-28**: PGN import (paste or file, variations
  kept), a board with saved variations, sharing by link, a study from a finished game, PGN export; plain rows, no actor.
  Verify: `tools/localdev/verify-part4a.sh`.
- **`engine-analysis` — built 2026-09-28**: evaluate the position on the study board (one at a time) at Quick, Normal or
  Deep (1/3/10 s), three best lines, over `analysis.*` with its own engine process; evaluations cached per position for
  everyone, the board polls until they arrive. Verify: `tools/localdev/verify-part4b.sh`.
- Later: the openings explorer from imported games.

### Part 5 — Look and feel (lichess-inspired)

Owner review of lichess.org on 2026-10-01 (proposals P1–P10). Six OpenSpec changes, built in this order:

- **`board-look`** (P1–P3) **[decided]**: the board becomes `react-chessboard` (MIT, React 19, maintained), rendered in
  the browser only. Pieces are Cburnett SVGs from Wikimedia Commons under their 3-clause BSD option (not lichess's GPL
  copy). Lichess **Brown** is the default board; Blue, Green, Slate and Club walnut are the other themes. Lichess
  highlights: last move, check glow, target dots and capture rings. Pieces slide, drag or click-click, premove, and
  right-drag arrows and circles. chessground is out (GPL-3.0 would conflict with the planned MIT licence).
- **`game-page-navigation`** (P5) **[decided]**: captured pieces and the material difference under each player, a
  clickable move list with ← → navigation through earlier positions, and a flip-board button. The clocks stay as
  they are (no tenths, no low-time colour).
- **`game-feedback`** (P8) **[decided]**: "Your turn" in the tab title and a dot on the favicon, a game-over card with
  Rematch, an opponent-found flash, and a draw offer that stands out.
- **`user-preferences`** (P9) **[decided]**: a settings page and a preferences row on the account (board theme,
  piece set, animation, coordinates, site theme), read with `getMe()` so the server renders them without a flash.
- **`site-themes`** (P7) **[decided]**: other site themes are allowed; **dark stays the default**. A colour per game
  type and an icon set (Lucide, ISC).
- **`responsive-layout`** (P10) **[decided]**: its own spec; every page works from phone width up.
- **No sound** (P4) **[decided]**: the site plays no sounds.
- **Live home** (P6) **[open — for discussion]**: counters (games in play, players online, queue sizes), "Club TV"
  mini boards of live games, mini boards for "Your turn". Spectating is already allowed (D20). To settle: counters only
  or live mini boards too, how Club TV picks games (there are no ratings yet), whether players can opt out of being
  shown, and whether engine and correspondence games appear.

## 7. Cross-cutting

- **Testing**: unit (xUnit + Akka TestKit; vitest), integration (Testcontainers), e2e (Playwright);
  coverage gate stays at 90 % for the non-actor code, actors measured via TestKit scenarios.
- **Observability — built 2026-09-29 (`observability`)**: always part of the local stack — OTel Collector, Prometheus,
  Tempo, Loki, Pyroscope and Grafana (eight dashboards as code). One trace per user action from the browser through the
  BFF, the actors, the journal, Kafka, the consumers and the engine worker back to the other player's socket; actor,
  cluster and pipeline metrics per node; every container's logs; profiles of the backend and the BFF. Verify:
  `tools/localdev/verify-observability.sh`.
- **Security**: all commands pass the existing `[Authorize]` + `ICurrentUser`; hub connections carry
  the same cookie; rate limiting already per client via Redis; Kafka/Redpanda unauthenticated on the
  compose network only.
- **Operations**: `stack.sh up` remains the one command; Redpanda console and replica lag show up in
  the stack banner.

## 8. Open questions (answer before the part that needs them)

- ~~Time controls to support first (Part 1)~~ — settled as D12.
- ~~Whether Cluster.Sharding is in scope for Part 1~~ — settled by Part 0: every entity is sharded.
- Notification channel for Part 3 (email vs in-app only).
- Engine levels for people: Stockfish's `UCI_Elo` is calibrated at 120 s + 1 s and anchored to CCRL 40/4 (engines,
  not humans), so level 1320 is far stronger than a 1320 human — in `verify-part2.sh` it beat full-strength Stockfish
  at 200 ms a move. The levels are now named Casual … Maximum instead of by Elo (2026-09-27); making the bottom level
  beatable for beginners still needs our own handicaps (shallower search, deliberate inaccuracies).
- A desktop app for the UI: how to package or build one (for example wrapping the web UI, or a native client over
  the same BFF). Parked on purpose; to be thought through later, not now.
