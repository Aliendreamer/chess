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

Relay overhead, loopback, against a stub hub (see the spike note): upgrade 15–37 ms, first frame
23–146 ms. These bound the relay itself, not the system.

**Pending the human stack runs** — these need `stack.sh up` and are not guesses worth writing down
until measured:

| Number                         | How to get it                                                   |
| ------------------------------ | --------------------------------------------------------------- |
| write → replica visibility lag | `tools/localdev/verify-stack.sh` (write→read section)           |
| ping → feed latency (real hub) | `tools/e2e.sh` / the `pings` Playwright spec, timed             |
| failover time (backend-1 down) | `tools/localdev/verify-part0.sh --cluster`                      |
| cold start of a backend node   | `stack.sh logs backend` — time from process start to cluster Up |

## What to change before Part 1

1. **Close the dual-write gap.** Either a journal tailer (read the Akka journal, publish to Kafka with
   an offset) or a transactional outbox in the same write as the event. This is the one item that
   should not carry into real moves.
2. **Multiplex the relay.** Today the SSR server opens one hub connection per open feed. One
   connection per node, fanned out locally by topic, before there are watchers on a game.
3. **Revisit `ShardCount = 50`** against an actual expected concurrent-game count; it is a migration
   to change once data exists.
4. **Decide the passivation policy per entity type.** A ping never passivates meaningfully; a finished
   game must.
5. **Give the projection a dead-letter path.** A poison event currently retries forever.

## Where the pieces live

Backend: `Akka/` (options, hosting, `Ping/`, `ActorTracing`), `Events/`, `Messaging/` (Kafka publisher,
consumer host), `Projections/`, `Data/ReadDbContext.cs` + `Data/ReadModels/`, `WebApi/Pings/`,
`WebApi/Hubs/`, `Extensions/ObservabilityExtensions.cs`. Frontend: `server/routes/api/ws/pings/[id].ts`,
`src/lib/pings.ts`, `src/lib/server/ping-relay.ts`, `src/components/PingFeed.tsx`,
`src/routes/_authenticated/pings.$id.tsx`. Stack: `tools/localdev/verify-part0.sh`, compose profile
`cluster` (`backend-2`).
