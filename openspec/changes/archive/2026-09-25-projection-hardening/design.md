## Context

`KafkaConsumerHost` runs one committable Akka.Streams.Kafka stream per `IProjection`. Each record goes through
`SelectAsync(1)`, which calls `ApplyAsync` in a fresh DI scope and commits the offset after it returns. Any
exception, whether a broker error, a gap or a projection bug, fails the whole stream. `RunOnceWithRetryAsync`
logs it, waits 5 s and rematerializes from the last committed offset. That gives three behaviours we want
to separate:

| Exception                         | Today               | Wanted                                         |
| --------------------------------- | ------------------- | ---------------------------------------------- |
| broker / stream stage             | restart after 5 s   | unchanged                                      |
| `ProjectionGapException`          | restart after 5 s   | unchanged (stall; lost upstream event)         |
| projection bug / constraint error | restart **forever** | retry N times in place, then park + quarantine |
| concurrency conflict              | not detected        | re-run in place, then skip                     |

Watermarks: `PingProjection` keeps `LastSeq` on `rm_pings`. `PositionedProjection<T>` keeps it in
`consumer_positions (GroupId, AggregateId)`. Neither is a concurrency token today. Unit tests run projections
on the EF InMemory provider (`Support/TestDb`), and Postgres behaviour is proved in the Testcontainers suite.

## Goals / Non-Goals

**Goals:**

- One bad event blocks only its own aggregate, in its own consumer group.
- Concurrent delivery can't double-apply, for update and first-insert alike.
- An operator can see what's parked and replay it after a fix, without SQL.
- The retry and parking logic is unit-testable without a broker.

**Non-Goals:**

- A dead-letter Kafka topic, automatic replay, or a UI.
- Persisting attempt counts across restarts (see Risks).
- Changing the stream-level restart for broker errors and gaps.

## Decisions

### D1. Per-message logic moves into a broker-free `ProjectionRunner`

A new `internal sealed class ProjectionRunner` owns the per-record decision: quarantine check → attempt loop
→ conflict retry → park. The host's `SelectAsync` calls `runner.RunAsync(projectionType, key, value, ct)` and
commits when it returns. Gaps and cancellation are rethrown so the existing stream restart handles them.

_Alternative:_ putting the loop into `IProjection` implementations or `PositionedProjection`. Rejected: every
projection would need to repeat it, and `PingProjection` doesn't derive from the base. The existing test note on
`KafkaConsumerHostTests` already asks for logic that can be tested without a broker, and the runner is that seam.

### D2. `LastSeq` is an EF concurrency token, and unique violations count as conflicts

`builder.Property(x => x.LastSeq).IsConcurrencyToken()` on `RmPing` and `ConsumerPosition`. EF then emits
`UPDATE … WHERE "LastSeq" = @original`, and zero rows affected raises `DbUpdateConcurrencyException`. A racing
first insert is a primary-key violation instead: `DbUpdateException` wrapping `PostgresException` with
`SqlState == 23505`. `ConflictDetector.IsConflict(Exception)` recognises both.

On a conflict the runner disposes the scope and re-runs `ApplyAsync` in a new scope. The new `DbContext` reads
the winner's `LastSeq`, so `IdempotencyGuard` returns `Skip`. Conflict retries are capped at 3 and **don't
count** toward the attempt limit. A fourth consecutive conflict is treated as an ordinary failure, which
guards against a livelock that shouldn't happen.

_Alternatives:_ Postgres `xmin` as the token. Rejected: it's provider-specific, and the InMemory unit tests
couldn't exercise it. Hand-written `UPDATE … WHERE LastSeq < @seq`: rejected, because it bypasses EF change
tracking for the rest of the row. `LastSeq` is already the value that means "applied up to", so it is the
natural token and adds no column.

This is a model change only. The token is a query-generation concern, so the migration snapshot changes but
no DDL is emitted.

### D3. The runner peeks at the envelope header for identity

To park and quarantine, the runner needs `(aggregateId, seq)` without knowing the payload type. It deserializes
`EventEnvelope<JsonElement>` through `EventJson.TryDeserialize`. If that fails, it falls back to the Kafka key
as the aggregate id with `seq = 0`. Per D8, topics are keyed by aggregate id, so the fallback still quarantines
the right thing.

### D4. Quarantine = "a parked row exists"; no separate state

`projection_dead_letters(Id, GroupId, AggregateId, Seq, KafkaKey, Value, Attempts, LastError, FirstFailedAt,
ParkedAt)` with an index on `(GroupId, AggregateId, Seq)`. An aggregate is quarantined for a group exactly when
it has at least one row. Replaying the last row lifts it, so nothing else has to be kept in step.

_As built:_ `Id` is a Guid v7 in a native `uuid` column, per ROADMAP D11 (settled during this change,
2026-09-24). `Keyset` gained a `Guid` tiebreak overload and `KeysetCursor.TryDecodeGuid` for it. The first
cut stored the id as `varchar(32)`, and migration `DeadLetterIdUuid` casts it with `USING "Id"::uuid`, because
Npgsql's `AlterColumn` emits no `USING` clause. `AggregateId` and `KafkaKey` are unbounded `text`: the fallback
identity is the raw Kafka key, and a length limit would make an oversized key's park fail, which would be a new
poison loop. Columns are
PascalCase like the rest of the schema.

The check runs **per message against the database** (one indexed `EXISTS`), not against an in-memory set. A
replay can run on any node through the API, and a node-local cache would need invalidation across the cluster.
One indexed lookup next to the projection's own read is cheap.

`last_error` stores the exception type and message only, truncated to 2 000 characters, with no stack trace.
Stack traces go to the log (`Log.ProjectionParked`), where the trace id links them.

### D5. Consumer and replay serialise on a transaction-scoped advisory lock

Both the consumer's "check quarantine → park" step and each replay step run inside a transaction that first
takes `pg_advisory_xact_lock(hashtextextended(group_id || ':' || aggregate_id, 0))`. This prevents two
interleavings:

- A replay deleting the last row while the consumer is parking a new one. The consumer would see the quarantine
  after the replay has moved on, leaving an orphan with a lifted quarantine.
- The consumer applying `seq 9` while the replay still has `seq 8` pending, which would be a gap.

The lock is only taken on the quarantine path: when the `EXISTS` check hits, and on every replay step. The
normal apply path for a healthy aggregate costs nothing extra. It is transaction-scoped, so it can't leak like
the session lock the publisher deliberately holds.

On EF InMemory the lock statement is skipped behind `Database.IsRelational()`. The unit tests cover the
decision logic, and the Testcontainers suite covers the lock.

### D6. Attempts and backoff are in-process and bounded

`Projections:DeadLetter:MaxAttempts` (default 5) and `BaseDelay` (default 200 ms), doubling per attempt and
capped at 5 s. The worst case holds the partition for about 7 s before parking. Attempts live on the runner's
stack, not in the database (see Risks).

### D7. Replay goes through the same runner code, from the API

`POST /api/admin/projections/{groupId}/dead-letters/{aggregateId}/replay` resolves the projection whose
`GroupId` matches from the registered `IProjection`s. Unknown groups get 404. It loops: lock, read the lowest
`seq` row, `ApplyAsync`, delete the row, commit. It stops at the first failure and returns `409` with the
error and the number applied, or `200` with the count once nothing is left. `GET
/api/admin/projections/dead-letters` lists rows with keyset paging (`Keyset.NewestFirst` on `(parked_at, id)`),
filterable by group. Both require `Constants.Roles.Admin`. The endpoints stay thin and
`[ExcludeFromCodeCoverage]`, and `DeadLetterReplayer` holds the tested logic.

### D8. Health: `projection-dead-letters`, Degraded when any quarantine exists

`SELECT group_id, count(DISTINCT aggregate_id) … GROUP BY group_id` reports Healthy with an empty map, or
Degraded with `{group: count}`. It is registered with `failureStatus: Degraded`, the same as
`journal-publisher`, because the rest of the pipeline is fine.

### D9. `ShardCount` stays 50; the Part 0 note is corrected

There's no code change. The docs will say that the shard id is only a routing decision: it isn't in the
`persistenceId`, and `RememberEntities = false` stores nothing keyed by it. Changing it needs every node to
agree, which means a full cluster restart rather than a rolling one, but no data migration. At about 10 shards
per node, 50 suits 1–5 nodes.

## Risks / Trade-offs

- [Attempt counts reset on restart] A node that dies mid-loop redelivers the record, which gets a fresh 5
  attempts. → Acceptable: the worst case is 5 attempts per restart, and restarts are rare. Persisting
  attempts would cost a write on every failure.
- [Partition blocked during the attempt loop] Up to about 7 s per poison record for every aggregate on that
  partition. → Bounded, and only paid once per poison record. After that, quarantine parks later events
  without retrying.
- [A bug that fails every event] Each aggregate gets quarantined one by one, and each pays the full retry
  wait. → The health check turns Degraded after the first one. The fix-and-replay path is the remedy, and a
  global circuit breaker is deferred.
- [Replay on an old node] A node that hasn't been redeployed runs the buggy projection again. → Replay stops
  at the first failure and leaves everything parked, so nothing is lost. The operator retries once the rollout
  is complete.
- [Advisory lock hash collisions] Two different `(group, aggregate)` pairs sharing a 64-bit hash would
  serialise needlessly. → They would only block, never corrupt, and it's vanishingly rare.
- [The InMemory provider doesn't raise 23505] The duplicate-insert conflict can't be unit-tested. → It is
  covered in the Testcontainers suite.

## Migration Plan

1. The migration `AddProjectionDeadLetters` creates the table and index. The concurrency token changes only
   the model snapshot.
2. Deploy normally. No data backfill: existing aggregates start unquarantined.
3. Rollback: the previous image ignores the table. Any parked rows remain for a later replay.

## Open Questions

None blocking. The attempt limit and backoff are configuration and can be tuned after Part 1 load tests.
