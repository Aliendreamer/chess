# Part 0 — what the spine cost and what it bought

**Date:** 2026-09-22 · **Scope:** Tasks 1–11 of `docs/superpowers/plans/2026-09-22-part0-spine.md`

Part 0 existed to answer one question with code rather than opinion: is the architecture in
`ROADMAP.md` — Akka.NET as the sync plane, Kafka as the backbone, primary/replica Postgres, SSR BFF —
worth its complexity before any chess logic is written? A trivial `PingActor` was made to travel the
whole path: **HTTP → sharded persistent actor → journal → Kafka → projection → read model on the
replica → DistributedPubSub → SignalR → SSR relay → browser.**

## What it bought

- **One writer per entity, cluster-wide, for free.** Sharding means the ping's count is never a
  read-modify-write race; the endpoint asks the entity and gets the post-persist state back
  (`PostPingEndpoint` returns the actor's reply, never a query). This is the property the whole live
  game plane will lean on, and it cost one `WithPingSharding` call.
- **Recovery without a cache.** The journal is the truth: restart the process and the entity rebuilds
  from its events, proven by `A_restarted_node_recovers_the_entity_from_the_journal`. Snapshots every
  20 events keep that bounded.
- **A replay-able read side.** The projection is a Kafka consumer, so `rm_pings` can be dropped and
  rebuilt from the topic. Read endpoints hit the replica and never the actor, which is what lets
  lists scale independently of the game plane.
- **One origin for the browser, including realtime.** The SSR relay (see
  [`part0-realtime-spike.md`](./part0-realtime-spike.md)) means the API host never appears in the
  client bundle even for WebSockets — verified by grepping the built assets and by an e2e test that
  fails if any request or socket leaves `app.`.

## What it cost

- **Configuration surface.** `Akka:{Hostname,Port,SeedNodes,Roles,ShardCount}`, SBR, persistence
  schema, Kafka bootstrap/group, replica connection string, forwarded-header networks. Most of it has
  a sane default; none of it is free to reason about. `AkkaOptions.Validate()` exists because a typo
  here fails at runtime, far from the edit.
- **A node must know its own address before it starts.** A node seeds itself at
  `akka.tcp://chess@host:port`, so "just use a free port" is not available — the integration fixture
  has to reserve a port and hand it to the app. The plan's `Akka__Port=0` was wrong for that reason.
- **Two hops of eventual consistency.** A write is visible to the actor immediately, to `rm_pings`
  after Kafka + projection, and to the replica after streaming replication. Every read endpoint has to
  decide which of the three it wants. Part 0 makes that explicit (`/live` = actor, list = replica);
  later parts must keep making it explicit.
- **The dual-write gap (ROADMAP P0-5) is still open.** `PingActor` persists, then publishes to Kafka
  on a task continuation. If the process dies in between, the event is in the journal and never on the
  topic; `PublishFailed` logs it, nothing repairs it. Acceptable for a ping, not for a game move.
- **Startup time and moving parts in local dev.** The stack is now Postgres + replica + Redpanda +
  console + Redis + Keycloak + Traefik + two app containers.

## Measured

Measured on the live stack, 2026-09-22 (WSL2, Docker 29.6):

| Number                          | Value                             | Source                        |
| ------------------------------- | --------------------------------- | ----------------------------- |
| write → replica visibility lag  | ~250 ms                           | `verify-stack.sh`             |
| ping → row on the replica       | 250–500 ms                        | `verify-part0.sh`             |
| failover, backend-1 stopped     | ~2 s to answer from backend-2     | `verify-part0.sh --cluster`   |
| relay overhead (loopback, stub) | upgrade 15–37 ms, frame 23–146 ms | the spike note                |
| full Testcontainers round trip  | ~1 m 36 s for both tests          | `nx integration-test backend` |

The ping→feed path end to end is fast enough that the Playwright spec's 5 s budget is never close.

## The finding that matters most: none of it ran until something ran it

Tasks 1–8 were committed green — unit tests passing, code reviewed — and the spine was in fact dead.
Three faults, each fatal on its own, sat undetected because every test was a unit test and the stack
gate had never actually got past login:

1. `Akka.Streams.Kafka` reads `akka.kafka.*` from the ActorSystem config, and Akka.Hosting does not
   load a package's reference.conf. Every consumer stream died on creation, and because
   `BackgroundServiceExceptionBehavior` defaults to `StopHost`, it took the whole API down with it.
2. `Akka.Persistence.Sql`'s `autoInitialize` creates its tables but not its schema, so a fresh
   database failed with `3F000: schema "akka" does not exist`.
3. `KafkaConsumerHost` discovers projections through `IProjection` and re-resolves each by its
   concrete type; an interface-only registration cannot serve that.

The live stack agreed: its database had no `akka` schema and no akka tables at all, and the backend
container had been exiting instead of serving. Two verification scripts were also wrong in ways that
only a working system could reveal — `verify-part0.sh` queried `rm_pings` with unquoted lowercase
columns, and `verify-stack.sh`'s Kafka round-trip read whichever partition answered first, which is
only reliable while the topic is empty.

The lesson for Part 1 is not "write more unit tests". It is that a distributed spine is only known to
work when something exercises it end to end, and that the exercise has to be cheap enough to run on
every change — which is what `nx integration-test backend` now is.

## What to change before Part 1

1. **Close the dual-write gap.** Either a journal tailer (read the Akka journal, publish to Kafka with
   an offset) or a transactional outbox in the same write as the event. This is the one item that
   should not carry into real moves. **Done (2026-09-23):** journal tailer, see OpenSpec change
   `journal-outbox`. Measured on the two-node stack: ping → replica row median ~240 ms, 19/20 under
   500 ms, one 2.2 s outlier (the journal gap detector's bounded wait, 10 × 200 ms); failover 1–2 s,
   with the publisher lease taken over by backend-2 from the saved offset. Verifying it surfaced two
   stack bugs, both fixed: `dotnet watch` ignores SIGTERM/SIGINT so `compose stop` SIGKILLed backend-1
   without a cluster leave (verify-part0 now signals the app), and backend-1 seeded only itself so a
   restart formed a second cluster (it now also seeds backend-2). The split brain happened once before
   the fix, and the advisory-lock fence held: one publisher, the other side logged "held elsewhere".
2. **Multiplex the relay.** Today the SSR server opens one hub connection per open feed. One
   connection per node, fanned out locally by topic, before there are watchers on a game.
3. **Give a late subscriber the current state.** The hub pushes only to whoever is subscribed when
   the event is published; a browser that connects a moment later sees nothing until the next move.
   The page papers over it by server-rendering the state on load, which will not survive a board.
4. **Revisit `ShardCount = 50`** against an actual expected concurrent-game count; it is a migration
   to change once data exists.
5. **Decide the passivation policy per entity type.** A ping never passivates meaningfully; a finished
   game must.
6. **Give the projection a dead-letter path.** A poison event currently retries forever.

## Where the pieces live

Backend: `Akka/` (options, hosting, `Ping/`, `ActorTracing`), `Events/`, `Messaging/` (Kafka publisher,
consumer host), `Projections/`, `Data/ReadDbContext.cs` + `Data/ReadModels/`, `WebApi/Pings/`,
`WebApi/Hubs/`, `Extensions/ObservabilityExtensions.cs`. Frontend: `server/routes/api/ws/pings/[id].ts`,
`src/lib/pings.ts`, `src/lib/server/ping-relay.ts`, `src/components/PingFeed.tsx`,
`src/routes/_authenticated/pings.$id.tsx`. Stack: `tools/localdev/verify-part0.sh`, compose profile
`cluster` (`backend-2`).
