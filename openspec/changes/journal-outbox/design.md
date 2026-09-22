## Context

The Part 0 spine currently writes each event twice, with nothing tying the two writes together:

```text
PingActor ──Persist──► akka journal (Postgres primary)      ← durable
    └── callback ──ProduceAsync (fire-and-forget)──► Kafka  ← best effort, 10 s timeout, logged on failure
```

Kafka's producer retries and idempotence only protect a message after librdkafka has queued it,
and only while the process is alive. Events get lost in three ways: a crash between the journal
commit and the broker ack, a broker outage longer than `MessageTimeoutMs`, and a shutdown flush that
runs past 5 s. `KafkaConsumerHost` and `PingProjection` are already at-least-once and idempotent by
`(aggregateId, seq)`, so the gap is on the producer side only.

The backend already runs as an Akka cluster: `backend-1`, plus `backend-2` under the `cluster`
profile. It uses the `backend` role, SBR keep-majority, and a Postgres primary shared by every node.
Akka.Persistence.Sql 1.5.70 defaults to `tag-read-mode = TagTable`. Its query side has gap
detection controlled by `journal-sequence-retrieval.query-delay` (default 1 s) and `refresh-interval`
(default 1 s).

## Goals / Non-Goals

**Goals:**

- Every event committed to the journal reaches Kafka eventually. That holds through a process crash,
  a restart, a broker outage of any length, and a deploy.
- Per-aggregate order on the topic matches journal `seq` order.
- With N backend containers, exactly one publisher is active. Two publishers must never run at the same time, even
  when the Akka cluster is partitioned or slow to fail over.
- The wire format stays unchanged, so `PingProjection` and the round-trip tests keep passing as they are.
- Publisher lag is observable.

**Non-Goals:**

- Exactly-once. Duplicates on restart are expected and absorbed by consumer idempotency.
- Kafka transactions and `read_committed` consumers.
- The ROADMAP §2 "reconcile actor from Kafka" path. It is moot once Kafka is derived from the journal.
- Any change to the command reply, the live hub or the SSR relay.

## Decisions

### D1. Tail the journal instead of adding a transactional outbox table

The journal already is a durable, ordered log in the same database, written atomically with the
event. Reading it with `EventsByTag` means no second write in the actor.

- _Rejected: an outbox table written in the same transaction._ Akka.Persistence owns the journal
  transaction, so a custom journal plugin or a two-phase write would be needed to join it.
- _Rejected: keep the actor publish and add a reconciler._ It keeps the dual write and adds a second
  path that has to agree with the first.

### D2. Tag via a write event adapter; one tag, stream and offset row per Kafka topic

Each event is tagged with its target topic (`game.events` for `Pinged`) by a `WriteEventAdapter`
registered on the journal, so `PingActor` doesn't know tags exist. Each tag gets its own
`EventsByTag` stream and its own row in `outbox_offsets`. Adding a topic later means adding a tag
mapping, not a new mechanism.

- _Rejected: `AllEvents`._ It would pick up any future persistent actor whose events must not leave
  the process, and it forces topic routing into the stream.
- _Fallback:_ if the Akka.Hosting surface in 1.5.70 can't register the adapter cleanly, the actor
  persists `new Tagged(evt, [topic])`, which is one line in `PingActor`.

### D3. A mapping registry turns journal events into Kafka records

`IJournalEventMapper` maps `(persistenceId, sequenceNr, timestamp, event)` to
`(topic, key, EventEnvelope json)`. The `Pinged` mapper produces exactly what `PingActor` produces
today: key `ping:{id}`, `seq = sequenceNr`, type `ping.pinged`, v 1. An unmapped event type fails the
stream loudly. Silently skipping it would reopen the gap under a new name.

### D4. Offsets live in Postgres and are committed only after Kafka acks

The flow is `EventsByTag(tag, Offset.Sequence(saved))` → map → `KafkaProducer.FlexiFlow` (acks=all,
idempotent) → `GroupedWithin(100, 200 ms)` → save the highest acked ordering. The table is
`outbox_offsets(stream_id text pk, last_ordering bigint, updated_at timestamptz)` in `public`, added
by an EF migration and written on the primary. The save is monotonic (`… WHERE last_ordering < @new`).

- The stream restarts with backoff, through `RestartSource.WithBackoff` or the actor's supervision,
  and on each restart it reloads the offset.
- Duplicates are bounded by one un-saved batch plus anything in flight.
- **The offset is shared, never per node or in memory.** One row per tag in Postgres. A new container,
  a restarted one, or the node that takes over the singleton all read the same row, so no node ever
  starts from ordering 0 on its own. Replaying the whole journal is always a deliberate act: reset
  the row.
- **First rollout starts at the head, not at 0.** The events already in the journal were published
  by the actor. The `AddOutboxOffsets` migration seeds each tag's row with the journal's current
  `max(ordering)` (0 on a fresh DB). The publisher refuses to start without a row rather than
  defaulting to 0.
- _Rejected: Kafka consumer-group offsets or a Kafka-stored offset._ The offset describes the journal,
  so it belongs next to the journal.
- _Rejected: Akka.Persistence snapshots of the offset._ That's more machinery than one row.

### D5. Multiple containers: a cluster singleton, fenced by a Postgres advisory lock

This is the part that makes N containers safe. There are two layers.

1. **Placement: Akka cluster singleton.** `JournalPublisher` is registered with Akka.Cluster.Hosting
   `WithSingleton` on the `backend` role, so one instance runs on the oldest `backend` node.
   - A graceful leave (deploy, scale-down) hands over cleanly.
   - A crashed node is taken over once SBR downs it, which took about 2 s in the Part 0
     `--cluster` test plus the SBR `stable-after`.
   - The singleton's stream stops on handover and the new one resumes from the saved offset.
2. **Fencing: `pg_try_advisory_lock(<const>)` on a dedicated connection.** A singleton alone is not
   enough, because during a partition or before SBR decides, both sides can briefly believe they
   host it. So before starting the stream, the singleton opens its own `NpgsqlConnection` to the
   primary and takes a session-scoped advisory lock.
   - **The database is the arbiter.** The lock is held for exactly as long as that session is
     alive, and only one session can hold it.
   - **Offset saves go through the same connection.** If the lock connection is gone, the save
     fails, the stream fails, and the instance stops producing. A lost lock can't go unnoticed.
   - **A 5 s liveness probe** (`SELECT 1` on that connection) catches a lost lock while the stream is idle.
   - **Npgsql `Keepalive`** is set so a half-dead TCP session is detected in seconds, not minutes.
   - **If the lock is busy,** the instance retries with backoff and doesn't publish.

   Worst case: the old holder still has messages in flight when its session drops. That produces
   duplicates, never loss and never two long-lived publishers.

- _Rejected: advisory lock only, a hosted service on every node._ It works, but every node polls for
  the lock, and it skips the cluster's placement and handover that D2 in ROADMAP already pays for.
- _Rejected: singleton only._ A split brain can double-publish until SBR acts. That's harmless for
  idempotent consumers today, but unbounded if SBR is misconfigured.
- _Rejected: Kafka transactional.id fencing._ Akka.Streams.Kafka's transactional support is
  consume→produce oriented and would force `read_committed` on every consumer.

### D6. Remove the publish from the actor

`PingActor` loses `IEventPublisher` and `PublishFailed`. Its `Persist` callback keeps
apply → DistributedPubSub → reply → snapshot. If nothing else references `IEventPublisher`,
`KafkaEventPublisher` and `NullEventPublisher`, they're deleted. The `Kafka:BootstrapServers`
empty-means-disabled switch now gates the singleton registration instead, plus the existing consumer
host.

### D7. Tune the journal query for latency, then measure

Defaults add up to about 2 s: a 1 s refresh plus a 1 s gap query delay. Start at `refresh-interval = 200ms` and
`journal-sequence-retrieval.query-delay = 200ms`. Measure ping-to-replica-row on the live stack against the
Part 0 baseline of 250–500 ms and record the result in the experiment note. Accept up to about +500 ms.

### D8. Observability

- A health detail on `/health` reports `publisher: { node, tag, lastOrdering, journalMaxOrdering, lag }`.
  It reads the offset table and `max(ordering)` from the journal. It's informational: _Degraded_
  above a threshold, never _Unhealthy_, so a Kafka outage doesn't pull every node out of rotation.
- `[LoggerMessage]` methods cover: lock acquired, lock lost, stream restarted, and unmapped event.
- The stream gets an Activity per batch on the existing `chess.actors` source.

### D9. What the offset is: the journal's global `ordering`, not the per-aggregate `seq`

Two sequence numbers exist and each has one job:

| Number                | Where                     | Scope                         | Used for                                                                                      |
| --------------------- | ------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `ordering`            | journal column, bigserial | global, all persistence ids   | **publisher offset** (`outbox_offsets.last_ordering`, `Offset.Sequence(n)`, resume _after_ n) |
| `seq` (`sequence_nr`) | journal column            | per aggregate, 1..n, gap-free | **consumer idempotency** (`EventEnvelope.seq`)                                                |

`ordering` may have holes (rolled-back inserts); that is fine because the publisher only ever stores the
highest acked value and resumes strictly after it. It never travels on Kafka — consumers must not depend
on it, so a journal migration or re-numbering cannot break them.

### D10. Consumers own their idempotency

At-least-once publishing means every consumer will see duplicates (restart batch, failover, deliberate
replay). The rule: **the dedupe check and the effect commit in the same Postgres transaction**, keyed by
`(aggregateId, seq)`. Two shapes, pick per consumer:

1. **High-water mark in the read row** — when the projection keeps one row per aggregate (today's
   `PingProjection`: `rm_pings.last_seq`). `seq <= last_seq` → skip; the update and `last_seq` go in one
   `SaveChanges`. Cheapest; relies on per-key order, which the single publisher + key partitioning give.
2. **Consumer position table**: for consumers with no row per aggregate (notifications, analysis
   requests, fan-out to many rows). `consumer_positions(group_id, aggregate_id, last_seq)` with PK on
   `(group_id, aggregate_id)`. The same high-water check applies, and the position row is updated in
   the same `SaveChanges` as the effect. One row per aggregate per consumer means no pruning, and gap
   detection works exactly as in shape 1. _Rejected: one inbox row per event_. It grows forever, and
   pruning it would lose the high-water mark.

Plus, for both: **gap detection.** With a single ordered publisher, a consumer must never see
`seq > last_seq + 1` for a key. If it does, the projection logs `ProjectionGap` and throws, so the stream
stalls and retries instead of silently skipping — a lost event becomes a loud stall, not a wrong read
model. (Replaying a topic from scratch starts at seq 1, so this holds there too.)

Side effects outside Postgres (email, webhooks) cannot join the transaction: they advance the position
_before_ sending and pass `{aggregateId}:{seq}` as the external idempotency key. Not needed until Part 3.

The shared piece lands now as a small helper both shapes use (`IdempotencyGuard` and a `PositionedProjection<T>`
base), so Part 1's projections start from it rather than re-inventing it.

## Risks / Trade-offs

- **[Read-model lag grows by the poll interval]** → D7 tunes it and measures it. The command reply and
  the hub come from the actor, so the player doesn't see this lag.
- **[All publishing on one node]** → Fine at our scale, since one node publishes thousands of small
  JSON records per second. If that ever changes, shard by tag (one singleton per topic), which is
  already the D2 shape.
- **[Failover gap: nothing publishes between node death and takeover]** → Events wait in the journal
  and nothing is lost. The gap equals the SBR decision time plus handover and shows up as lag in the health detail.
- **[Tag storage missing on existing journal rows]** → Dev only: `stack.sh down -v`, or a one-off SQL
  backfill of `tags` for `ping-%` persistence ids. There's no production data yet.
- **[Journal gaps from concurrent inserts committing out of order]** → Akka.Persistence.Sql's gap
  detection holds the stream back for `max-tries × query-delay` (10 × 200 ms = 2 s) and then moves on. An
  insert that commits later than that could be skipped. That needs a transaction to stay open more than 2 s
  after a later one commits, which is plausible under load. So the integration test asserts no loss
  with concurrent writers from two nodes, and we treat any skip as a blocker that justifies a larger
  delay.
- **[Advisory lock held by a zombie session]** → Npgsql keepalive plus Postgres
  `tcp_keepalives_idle`/`idle_session_timeout` on the lock role bound it. Until then, takeover waits.
  That's safe, just slower.
- **[Offset semantics: exclusive vs inclusive]** → Pinned by a test. `Offset.Sequence(n)` must
  resume after `n`.

## Migration Plan

1. Land the migration (`outbox_offsets`) and journal tag config. Existing dev stacks need
   `stack.sh down -v`.
2. Land the publisher behind the existing `Kafka:BootstrapServers` switch, while the actor still
   publishes. For one commit, both paths run and consumers dedupe. This proves the new path on the
   live stack.
3. Remove the actor publish.
4. Rollback: revert to the previous image tag (`YYYYMMDD.<sha>`). The `outbox_offsets` table is inert
   without the publisher.

## Open Questions

- ~~**ROADMAP principle 4 and §2 Recovery**~~ — **resolved 2026-09-23 (user: "1 is fine")**: "reconciles
  from Kafka" is superseded; the journal is the recovery source and Kafka is derived from it. Applied
  in task 9.2.
- **Lag threshold for _Degraded_:** 30 s? Unless told otherwise, it's set in config with that default.
- **Should the singleton run on a dedicated role later**, for example a `publisher` role, so API nodes
  can scale separately? Not needed now, noted for Part 1 sizing.
