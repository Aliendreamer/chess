# Part 0 — the spine (design)

Status: draft for review · Roadmap: `ROADMAP.md` §6 Part 0 · Date: 2026-09-22

## Goal

Make the architecture exist end to end with a trivial domain, so every later part only adds chess:
an **Akka.NET cluster** hosting persistent, sharded actors; **Kafka (Redpanda)** carrying their events;
a **projection** writing read models to the Postgres primary; every query served from the **replica**;
and a **realtime path** from actor to browser through the SSR BFF. Proven by a `PingActor`.

Non-goals: any chess rules, matchmaking, engine, production hardening of the realtime relay, service
discovery beyond Compose DNS, Akka.Management, the journal→Kafka outbox tailer (candidate follow-up).

## Decisions (extends ROADMAP §3)

| #     | Decision                                                                                                                                                                                                                         | Status          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P0-1  | `Akka.Hosting` registers one `ActorSystem` (`chess`) in the backend host; actors resolved via `ActorRegistry`/`IRequiredActor<T>`; no static system                                                                              | decided         |
| P0-2  | **Cluster from day one**: `Akka.Cluster.Hosting`, `Akka.Remote` TCP on the compose network, role `backend`, static seed nodes from config, built-in split-brain resolver (keep-majority) configured now                          | decided         |
| P0-3  | `Akka.Cluster.Sharding` for every persistent entity, `PingActor` first; entity id = aggregate id; sharding is the _only_ way to reach an entity                                                                                  | decided         |
| P0-4  | `Akka.Persistence.Sql` (Linq2Db/Npgsql) journal + snapshots on the **primary**, schema `akka`, auto-initialised by Akka (not EF)                                                                                                 | decided         |
| P0-5  | Events published to Kafka **from the actor after `Persist` succeeds** (at-least-once; consumers idempotent by `(aggregateId, seqNr)`); dual-write gap accepted and logged in the experiment note; journal tailer is the fallback | decided         |
| P0-6  | `Confluent.Kafka` producer behind `IEventPublisher` (idempotent, `acks=all`); consumers via `Akka.Streams.Kafka` committable source, one consumer group per projection, commit after the DB write                                | decided         |
| P0-7  | Read side: `ReadDbContext` on `ConnectionStrings:PostgresReplica`, `NoTracking`, model contains only `rm_*` tables; write side unchanged (`ProjectDbContext`, primary). Projections write `rm_*` via `ProjectDbContext`          | decided         |
| P0-8  | Hub fan-out across nodes via `Akka.Cluster.Tools` DistributedPubSub (topic per aggregate), not the SignalR Redis backplane                                                                                                       | decided         |
| P0-9  | Realtime to the browser: **relay in the SSR server** (Nitro/crossws WebSocket ↔ SignalR client to the backend with the forwarded cookie); edge-upgrade is the documented fallback                                                | decided (spike) |
| P0-10 | Akka.NET latest stable 1.5.x, pinned exactly; all other new packages pinned                                                                                                                                                      | decided         |
| P0-11 | Observability: OpenTelemetry (ASP.NET, HttpClient, Npgsql, Confluent) + a `chess.actors` `ActivitySource` around message handling; console exporter locally                                                                      | decided         |

## Topology

```text
backend-1 ───┐   Akka cluster (remote tcp :8091)   ┌─── backend-2  (compose profile `cluster`)
  ActorSystem│   sharding: PingActor(id) lives on   │   ActorSystem
  hub /hub   │   exactly one node; DistributedPubSub│   hub /hub
             │   fans events to hubs on every node  │
             └──────────────┬───────────────────────┘
                            │ journal/snapshots (schema akka) ──► Postgres PRIMARY ──► REPLICA ◄── ReadDbContext
                            │ publish game.events (key ping:<id>) ──► Redpanda ──► projection (group rm-pings) ──► rm_pings (PRIMARY)
```

Traefik load-balances `api.` across `backend-1`/`backend-2` in the `cluster` profile; sticky sessions
are not needed because state lives in the sharded actor, not the node.

## Components

### Backend

- `Akka/` — `AkkaHostingExtensions.AddActorSystem(builder)`: Akka.Hosting + Cluster + Sharding +
  Persistence.Sql + DistributedPubSub, config bound from `Akka` section (`Hostname`, `Port`,
  `SeedNodes[]`, `Roles[]`). Local single node: seed = itself.
- `Akka/Ping/PingActor.cs` — `ReceivePersistentActor`; commands `Ping(text, userId)`, `GetState`;
  events `Pinged(seq, text, userId, at)`; state `{count, last}`; snapshot every 20 events; on
  `Persist` success → `IEventPublisher.PublishAsync("game.events", key, envelope)` via `PipeTo`
  then reply `PingState`. Passivates after 5 min idle (sharding `Passivate`).
- `Events/` — `EventEnvelope { type, v, aggregateId, seq, at, payload }`; `Pinged` record; STJ
  source-generated context.
- `Messaging/` — `IEventPublisher` + `KafkaEventPublisher` (Confluent producer, singleton, flush on
  stop); `KafkaConsumerHost` (Akka.Streams.Kafka `CommittableSource` → `ProjectionRunner`).
- `Projections/PingProjection.cs` — upserts `rm_pings(ping_id, count, last_text, last_at, last_seq)`
  where `last_seq < event.seq` (idempotent); commits offset after `SaveChanges`.
- `Data/ReadDbContext.cs` (+ `Data/ReadModels/RmPing.cs`); EF migration `AddRmPings` on the write
  context (tables are created on the primary, read from the replica).
- `WebApi/Pings/` — `POST api/pings/{id}` (`{text}`) → sharding `Ask<PingState>` → 200 with state;
  `GET api/pings/{id}/live` → actor state; `GET api/pings` → `ReadDbContext` list. All `[Authorize]`.
- `WebApi/Hubs/PingsHub.cs` — SignalR at `/hub/pings`; `Subscribe(id)` joins group `ping:<id>`; a
  `HubFanOut` actor subscribes to DistributedPubSub topic `ping:*` and pushes to the group via
  `IHubContext`. Auth: JwtBearer with the cookie resolver (SignalR reads the cookie on the
  negotiate/WebSocket request — no `access_token` query string).
- Health: `postgres-replica` (Npgsql to replica + `pg_last_wal_replay_lsn` lag seconds), `kafka`
  (Confluent admin metadata), `akka-cluster` (self member `Up`).
- Config: `Akka`, `Kafka:BootstrapServers`, `ConnectionStrings:PostgresReplica`.

### Frontend (spike)

- `src/routes/api/ws/pings/$id.ts` — Nitro WebSocket handler (crossws): on open, validate the cookie
  via `getMe()`-equivalent server call, open `@microsoft/signalr` `HubConnection` to
  `${API_URL}/hub/pings` with the forwarded cookie header, `Subscribe(id)`, relay `state` messages to
  the socket; close both together.
- `src/routes/_authenticated/pings.$id.tsx` — SSR renders `GET /api/pings/{id}/live`; a tiny client
  component opens `wss://app./api/ws/pings/{id}` and appends events. A button posts a ping via a
  server function.
- Outcome recorded in `docs/superpowers/notes/part0-realtime-spike.md`: keep relay or switch to
  edge upgrade, with the reason.

### Local stack

- `docker-compose.yml`: backend gets `Akka__Hostname` (container name), `Akka__Port=8091`,
  `Akka__SeedNodes__0=akka.tcp://chess@backend:8091`; profile `cluster` adds `backend-2` (same
  image, `Akka__Hostname=backend-2`, seeds `[backend, backend-2]`) and Traefik file-provider route
  `api` gets both servers.
- Coverage compose mirrors only what it must (Akka env) — updated when Part 0 code lands.

## Data flow (one ping)

1. `POST /api/pings/p1 {text}` → endpoint → `ShardRegion.Ask(new Ping("p1", text, userId))`.
2. Shard resolves/creates `PingActor(p1)` on some node (recovering from journal + snapshot if it
   exists).
3. Actor validates (non-empty text ≤ 200 chars), `Persist(Pinged)` → state updated → publish to Kafka
   (key `ping:p1`) → DistributedPubSub publish `ping:p1` → reply `PingState`.
4. Endpoint returns `PingState` **from the actor** (read-your-write).
5. Projection consumes `Pinged`, upserts `rm_pings` on the primary, commits offset.
6. Replica receives the row; `GET /api/pings` shows it a moment later.
7. Hubs on every node receive the pub/sub message and push to `ping:p1` subscribers; the SSR relay
   forwards to the browser socket.

## Failure handling

- Kafka down: `Persist` still succeeds; publish fails → logged with the seq, actor keeps serving;
  the event is in the journal, so a later journal tailer (or a manual replay tool) can republish.
  Health shows `kafka: unhealthy`. (This is the at-least-once gap P0-5 accepts.)
- Replica down: reads fail with 503 from a `ReadDbContext` health-gated endpoint filter; writes and
  live reads unaffected.
- Node loss (cluster profile): shard rebalances; entity recovers from journal on the surviving node;
  in-flight `Ask` times out (5 s) and the client retries.
- Projection crash mid-batch: offset not committed → redelivered → idempotent upsert.
- Actor recovery mismatch (journal behind Kafka): out of scope for Part 0; recorded as the trigger
  for the tailer follow-up.

## Testing

- Unit (xUnit): `PingActor` via Akka.TestKit with the in-memory journal (persist → state → publish
  captured by a fake `IEventPublisher` → snapshot after 20); `PingProjection` with EF InMemory
  (idempotency on replay, ordering); `EventEnvelope` round-trip; endpoints' pure helpers. 90 % gate
  on non-actor code (actors measured by TestKit scenarios, excluded from the line gate).
- Integration (Nx target `integration-test`, Testcontainers Postgres + Redpanda, human-run): full
  round-trip `POST → journal → Kafka → rm_pings`; kill/restart the host → `GET /live` state intact.
- Stack (`tools/localdev/verify-part0.sh`, human-run): single node — ping, live read, list read
  from replica within 2 s, `rm_pings` row on replica; `cluster` profile — same, plus stop `backend-1`
  and observe `p1` served by `backend-2` with the same count.
- Frontend: vitest for the relay's pure message mapping; Playwright: page shows a ping arriving live.

## Order of work

1. Akka hosting + cluster + sharding + persistence (single node) — `PingActor` with `GET /live` only.
2. `ReadDbContext`, `rm_pings` migration, `GET /api/pings` (replica).
3. Kafka publisher + projection consumer (round-trip complete).
4. DistributedPubSub + SignalR hub.
5. SSR relay spike + page.
6. `cluster` compose profile + `verify-part0.sh`; integration tests; OTel.
7. Experiment note.
