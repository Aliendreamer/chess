## Why

`PingActor` persists an event to the Akka journal and then publishes it to Kafka as a separate step.
If the process dies, the broker is unreachable for longer than `MessageTimeoutMs` (10 s), or shutdown
cuts the 5 s flush short, the event stays in the journal but never reaches `game.events`. The read
model then misses it for good. Nothing notices, and nothing repairs it. `docs/superpowers/notes/part0-experiment.md`
lists this as item 1 to change before Part 1: a lost ping is tolerable, a lost game move is not.

## What Changes

**For a player:** nothing visible on the happy path. The command reply and the live hub still come
straight from the actor. What changes is that a list or history row can no longer go missing
after a crash or a Redpanda outage. It shows up once publishing resumes. Read-model lag may grow by up
to the journal poll interval, which is measured and tuned in this change.

**In the code:**

- **Journal as the outbox.** A new `JournalPublisher` reads persisted events from the Akka SQL
  journal (Akka.Persistence.Query `EventsByTag`) and produces them to Kafka through
  Akka.Streams.Kafka. It saves the last published journal offset in Postgres only after Kafka acks.
  On restart it resumes from that offset, so delivery is at-least-once with no loss.
- **Exactly one publisher per cluster.** It runs as an Akka **cluster singleton** on the `backend`
  role and is **fenced by a Postgres advisory lock**. With N backend containers, one publishes and
  the others stand by. During a split brain or a slow failover, the database still lets only one
  instance publish.
- **BREAKING (internal):** `PingActor` stops publishing to Kafka. It persists a **tagged** event, then
  fans out over DistributedPubSub and replies as before. `IEventPublisher`, `KafkaEventPublisher`, `NullEventPublisher`
  and the actor's `PublishFailed` path are removed if nothing else uses them.
- The Kafka wire format stays the same: same topic, key and `EventEnvelope` shape, and `seq` is
  still the journal sequence number. `PingProjection` and its `(aggregateId, seq)` idempotency don't
  change.
- New `outbox_offsets` table (EF migration, primary) and a health detail showing publisher lag
  (journal head minus published offset).

**Out of scope:** exactly-once delivery and Kafka transactions; the §2 "actor reconciles from Kafka"
recovery path (see below); game events and any Part 1 code; multiplexing the SSR relay and
late-subscriber state (experiment-note items 2–3); a schema registry.

**Part:** a Part 0 follow-up, a prerequisite for Part 1.

**ROADMAP decisions:**

- Settles the dual-write gap from the Part 0 experiment note.
- Depends on D2 (cluster present, so a singleton is available), D3 (Akka.Persistence.Sql journal in `akka`),
  D4 (Akka.Streams.Kafka) and D8 (topics, JSON envelope with `type` + version).
- Changes §2 **Recovery**. Kafka can no longer be ahead of the journal, so "actor reconciles from Kafka"
  has nothing left to reconcile. This change proposes marking that clause as superseded in `ROADMAP.md` (principle 4
  becomes "Akka.Persistence is the recovery source; Kafka is derived from the journal"). Agreed by the
  user on 2026-09-23.
- Keeps §5 unchanged. Command responses still come from the actor, and projections stay idempotent.

## Capabilities

### New Capabilities

- `event-publishing`: how persisted domain events reach Kafka. Journal-derived, at-least-once, ordered per
  aggregate, resumable from a stored offset, with exactly one active publisher across the cluster.

### Modified Capabilities

<!-- none: openspec/specs/ is empty; Part 0 was specified before OpenSpec was adopted -->

## Impact

- **Backend code:** new `Akka/Outbox/` (publisher actor, offset store, advisory-lock fence, singleton
  registration); `Akka/Ping/PingActor.cs` and `PingShardingExtensions.cs` (no publisher, tagged persist);
  `Akka/AkkaHostingExtensions.cs` (query/tag config, singleton); `Extensions/BuilderExtension.cs` (Kafka
  wiring); `Messaging/*Publisher*` removed; `Utils/Log.cs` new log methods.
- **Database:** EF migration adding `outbox_offsets`. Akka journal tag storage must be switched on
  (tag table or CSV column, see design). The existing ping journal has no tags, so dev stacks
  need `stack.sh down -v` or a one-off backfill.
- **Dependencies:** the `Akka.Persistence.Query.Sql` surface comes with `Akka.Persistence.Sql`. No new
  package is expected, but verify at implementation.
- **Tests:** unit (TestKit and `Akka.Persistence.TestKit`) for the tagging and offset logic;
  integration (Testcontainers) for broker outage, crash-restart and two-node fencing.
- **Ops:** read-model lag gains one poll interval. One node carries all publish load, which is fine
  at our scale. Failover delay equals the SBR decision time plus singleton handover.
