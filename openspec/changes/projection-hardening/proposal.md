## Why

A player never sees a projection directly, but they see what it produces: game lists, "my games" and move
history all come from `rm_*` tables, which Kafka projections fill. Two faults from Part 0 would reach players
the moment Part 1's `GameProjection` exists:

- **One bad event freezes every list on its partition.** An exception in a projection is retried forever,
  and every other game on that partition waits behind it.
- **A Kafka rebalance can apply one event twice.** Projections read their watermark, then write, with no
  concurrency check, so two consumers briefly holding the same partition can both apply `seq n`. That is
  harmless for `rm_pings` but duplicates rows for any projection that inserts.

Both must be fixed while pings are the only consumer, before Part 1 builds on the pattern.

## What Changes

For a player:

- A game whose events a projection cannot apply stops updating in lists and history; **every other game
  keeps updating**. Live play is unaffected, because the actor and the hub never go through a projection.
- Once an operator fixes and replays it, the frozen game catches up.
- A rebalance never duplicates a row in lists or history.

In the code (backend only):

- `LastSeq` becomes an EF concurrency token on `rm_pings` and `consumer_positions`. A losing writer's
  conflict, whether a stale update or a duplicate insert, re-runs that one message in place. The re-run skips
  the already-applied event, and a conflict never counts as a failure.
- A new `projection_dead_letters` table. After 5 failed attempts at one event, the consumer parks it and
  **quarantines that aggregate for that consumer**: each later event for it is parked too, without calling
  the projection, until replayed. The Kafka offset commits, so other aggregates keep flowing.
- A gap (`ProjectionGapException`) still stalls the consumer and is never parked.
- Admin-only endpoints list parked events and replay one aggregate in `seq` order through the same
  projection. A successful replay lifts the quarantine.
- A publisher lag–style health detail: the number of quarantined aggregates per consumer.
- Documentation correction: changing `Akka:ShardCount` is a full-cluster restart, **not** a data migration,
  because `persistenceId` doesn't depend on the shard and `RememberEntities = false`. The value stays 50,
  which suits 1–5 nodes.

**Part**: 0 (carry-over items 6 and "concurrency token" from `docs/superpowers/notes/part0-experiment.md`).

**Out of scope**: a UI for dead letters (admin endpoints only), a Kafka dead-letter topic, automatic replay,
relay multiplexing and late-subscriber state (separate Part 0 carry-overs), anything in `GameActor`.

**ROADMAP decisions**: depends on D8 (topics keyed by aggregate id) and D9 (read-model tables in `public`).
Settles nothing in §3; records that D2's `ShardCount` default stands at 50.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `event-publishing`: consumers gain a concurrency guarantee (no double-apply under concurrent delivery), a
  dead-letter path with per-aggregate quarantine, operator replay, and an observable quarantine count.

## Impact

- **Code**: `Messaging/KafkaConsumerHost.cs` (per-message attempt loop, conflict retry, parking),
  `Projections/` (new `DeadLetterStore`, quarantine check), `Data/` (entity + configuration + migration
  `AddProjectionDeadLetters`, concurrency tokens on `RmPing.LastSeq` and `ConsumerPosition.LastSeq`),
  `WebApi/Admin/` (two endpoints), a health check.
- **Database**: one new table on the primary. The concurrency token adds no column; it changes the generated
  `UPDATE … WHERE`.
- **API**: `GET /api/admin/projections/dead-letters`, `POST /api/admin/projections/{groupId}/dead-letters/{aggregateId}/replay`,
  both `Admin` role.
- **Docs**: `docs/superpowers/notes/part0-experiment.md` item 4, `openspec/architecture.md` §4 "Open" note.
- **Dependencies**: none.
