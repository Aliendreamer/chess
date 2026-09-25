# event-publishing Specification

## Purpose

How domain events leave the Akka journal for Kafka and how consumers apply them: the journal is the
source, a single fenced publisher tails it with a stored offset, delivery is at-least-once, and every
consumer is idempotent by aggregate and sequence. Established by change `journal-outbox` (2026-09-23).

## Requirements

### Requirement: Events reach Kafka from the journal, not from the actor

Kafka SHALL receive domain events only by reading them from the Akka journal after the journal commit.
An actor MUST NOT produce to Kafka directly.

#### Scenario: Ping persisted while the broker is down

- **WHEN** a ping is accepted while Redpanda is unreachable and Redpanda comes back 60 s later
- **THEN** the `Pinged` event appears on `game.events` and the `rm_pings` row is updated without any
  further request

#### Scenario: Backend crashes after persist, before publish

- **WHEN** an event is committed to the journal and the backend process is killed before the event is
  produced
- **THEN** after the backend (or another node) restarts, the event appears on `game.events`

### Requirement: At-least-once delivery with a stored offset

The publisher SHALL store the highest journal ordering it has published per tag. It MUST store an
ordering only after Kafka has acknowledged every record up to it (`acks=all`). On start it MUST resume
from the stored offset.

#### Scenario: Restart resumes from the stored offset

- **WHEN** the publisher has published orderings 1–10, stored 10, and restarts
- **THEN** it produces starting at ordering 11 and does not re-produce 1–10

#### Scenario: Crash before the offset is stored

- **WHEN** records are acknowledged by Kafka but the process dies before their offset is saved
- **THEN** those records are produced again on restart, and the projection applies each
  `(aggregateId, seq)` exactly once

#### Scenario: No node publishes from the beginning on its own

- **WHEN** a new backend container joins, or takes over the publisher after a failover
- **THEN** it resumes from the shared stored offset and never re-publishes events before it

#### Scenario: First rollout over an existing journal

- **WHEN** the publisher first starts on a journal that already holds events the actor published
- **THEN** it starts after the journal's max ordering at migration time and does not re-publish them

### Requirement: Wire format and ordering are preserved

Published records SHALL keep the Part 0 contract: topic from the event's tag, key `ping:{id}` for pings,
value an `EventEnvelope` whose `seq` equals the journal sequence number. Records for one aggregate MUST
appear on the topic in `seq` order.

#### Scenario: Envelope matches the journal

- **WHEN** `ping-abc` persists its 3rd event
- **THEN** the record on `game.events` has key `ping:abc`, `type` `ping.pinged`, `v` 1, `aggregateId`
  `abc` and `seq` 3

#### Scenario: Per-aggregate order

- **WHEN** one ping id receives 50 pings in quick succession
- **THEN** the records for that key on `game.events` carry `seq` 1..50 in order

### Requirement: Exactly one active publisher per cluster

With any number of backend containers, the system SHALL run at most one active publisher. The
publisher MUST hold an exclusive Postgres advisory lock for as long as it produces. It MUST stop
producing as soon as that lock or its connection is lost.

#### Scenario: Two backend nodes

- **WHEN** `backend-1` and `backend-2` are both up
- **THEN** exactly one of them holds the publisher lock, and each event appears once on the topic
  (barring restart duplicates)

#### Scenario: Publisher node dies

- **WHEN** the node running the publisher is killed
- **THEN** the other node acquires the lock and resumes from the stored offset, and no event
  committed before or during the takeover is missing from `game.events`

#### Scenario: Two instances believe they are the singleton

- **WHEN** a second publisher instance starts while the first still holds the lock
- **THEN** the second does not produce until it acquires the lock

### Requirement: An unmapped event stops the stream

The publisher SHALL fail the stream, log the event type and persistence id, and retry with backoff when
a tagged event has no Kafka mapping. It MUST NOT skip the event.

#### Scenario: Tagged event without a mapper

- **WHEN** an event tagged `game.events` has no registered mapper
- **THEN** the stream stops before that event, the offset does not advance past it, and an error is logged

### Requirement: Consumers are idempotent by aggregate and sequence

Every Kafka consumer that writes state SHALL apply each `(aggregateId, seq)` at most once, with the
dedupe check and the effect committed in the same Postgres transaction. A consumer MUST NOT rely on
the journal `ordering`, which never appears on the wire.

#### Scenario: Duplicate delivery after publisher restart

- **WHEN** the same `Pinged` envelope `(abc, 7)` is delivered twice
- **THEN** `rm_pings` for `abc` reflects it once and `ProjectionSkippedReplay` is logged for the second

#### Scenario: Deliberate replay

- **WHEN** the publisher offset is reset to 0 and the whole topic history is produced again
- **THEN** no read model changes and every re-delivered event is skipped

#### Scenario: Consumer without a per-aggregate row

- **WHEN** a consumer that tracks its position in `consumer_positions` receives `(abc, 7)` twice
- **THEN** the effect is applied once, the second delivery is skipped, and the Kafka offset commits

#### Scenario: Gap in sequence

- **WHEN** a consumer at `last_seq = 3` for `abc` receives `seq = 5`
- **THEN** it does not apply it, logs `ProjectionGap`, and the stream retries instead of advancing

### Requirement: Publisher lag is observable

`/health` SHALL report, per tag, the stored offset, the journal's max ordering, and the difference between
them. It MUST report _Degraded_, never _Unhealthy_, when the lag exceeds the configured threshold.

#### Scenario: Broker outage shows as lag

- **WHEN** Redpanda is down and pings keep arriving
- **THEN** the publisher health detail shows a growing lag and status _Degraded_, and the node stays
  in rotation

### Requirement: Concurrent delivery never double-applies an event

A consumer's watermark (`LastSeq`, on the read row or in `consumer_positions`) SHALL be written only if it
still holds the value the consumer read. A write that loses that race, as a stale update or a duplicate
insert of the same key, MUST be retried in place on a fresh context, where the idempotency guard skips it.
Such a conflict MUST NOT count as a failed attempt.

#### Scenario: Two consumers apply the same event during a rebalance

- **WHEN** two consumers of one group both read `LastSeq = n` for an aggregate and both try to apply `seq n+1`
- **THEN** exactly one write succeeds, the other's save raises a concurrency conflict, its in-place retry
  reads `LastSeq = n+1` and skips, and the read model reflects `seq n+1` once

#### Scenario: Two consumers insert the first row for a new aggregate

- **WHEN** two consumers both find no row for an aggregate and both insert it for `seq 1`
- **THEN** one insert succeeds, the other's unique-key violation is treated as a conflict, and its retry skips

#### Scenario: A conflict is not a failure

- **WHEN** an event causes a concurrency conflict on its first try and then skips on the retry
- **THEN** no dead-letter attempt is recorded and nothing is parked

### Requirement: A repeatedly failing event is parked and its aggregate quarantined

If a projection throws on an event (any exception other than a gap or cancellation) the consumer SHALL retry
it, with backoff, up to the configured attempt limit (default 5). If the last attempt also fails, the consumer
MUST store the record in `projection_dead_letters`: group, aggregate, Kafka key, raw value, `seq`, attempt
count, last error and timestamps. It MUST then commit the Kafka offset and continue with the next record. From
then on, every event for that `(group, aggregate)` MUST be parked without calling the projection until the
aggregate is replayed. Other aggregates and other consumer groups MUST be unaffected.

#### Scenario: Poison event on one game

- **WHEN** a projection throws on every attempt at `seq 7` of game A
- **THEN** after 5 attempts `seq 7` is parked, the offset commits, and the next record on the partition, for
  game B, is applied normally

#### Scenario: Later events of a quarantined aggregate

- **WHEN** `seq 8` of game A arrives while game A is quarantined for that consumer
- **THEN** it is parked without the projection being called, and no gap is raised

#### Scenario: Quarantine is per consumer group

- **WHEN** game A is quarantined for `chess.rm-games`
- **THEN** another group consuming the same topic still applies game A's events

#### Scenario: Transient failure recovers before the limit

- **WHEN** a projection throws on the first two attempts at an event and succeeds on the third
- **THEN** the event is applied once, nothing is parked, and the offset commits after the success

#### Scenario: Record with no readable envelope keeps failing

- **WHEN** a record whose value cannot be parsed as an envelope makes the projection throw on every attempt
- **THEN** it is parked under the Kafka key as the aggregate id, with `seq` 0

### Requirement: A gap still stalls and is never parked

A `ProjectionGapException` SHALL keep its Part 0 meaning. The consumer stalls and retries with backoff, and
the record MUST NOT be counted as an attempt or parked. A lost upstream event is fixed at the source, not
skipped.

#### Scenario: Gap after the limit would have been reached

- **WHEN** a projection raises a gap on `seq 9` more times than the attempt limit
- **THEN** nothing is parked and the consumer keeps stalling on `seq 9`, logging each retry

### Requirement: Parked events can be replayed by an operator

A user with the `Admin` role SHALL be able to list parked events and to replay one `(group, aggregate)`. A
replay MUST feed that aggregate's parked records through the same projection in ascending `seq`, deleting
each record once it applies (or skips). It MUST lift the quarantine only when no parked record remains. If a
record fails again during replay, the replay MUST stop there, leaving it and every later record parked, and
report the error. A replay and the consumer MUST NOT interleave for the same `(group, aggregate)`.

#### Scenario: Replay after a fix

- **WHEN** an operator replays game A after the projection bug is fixed, with `seq 7` and `seq 8` parked
- **THEN** both are applied in order, both rows are deleted, the quarantine is lifted, and `seq 9` from Kafka
  is applied normally

#### Scenario: Replay hits the same bug

- **WHEN** the replay of game A throws on `seq 7` again
- **THEN** the response reports the error, `seq 7` and `seq 8` stay parked, and game A stays quarantined

#### Scenario: Non-admin

- **WHEN** a user without the `Admin` role calls the list or replay endpoint
- **THEN** the response is 403 and nothing is read or replayed

### Requirement: Quarantined aggregates are observable

The backend SHALL run a `projection-dead-letters` health check that counts quarantined aggregates per
consumer group. Any quarantined aggregate MUST make the check, and therefore `/health`, `Degraded`, not
`Unhealthy`, because the rest of the pipeline is still flowing. The per-group detail MUST be available to an
Admin through the dead-letter list endpoint.

#### Scenario: One aggregate quarantined

- **WHEN** game A is quarantined for `chess.rm-pings`
- **THEN** the check reports `Degraded` with `chess.rm-pings: 1` in its data, `/health` answers `Degraded`,
  and the Admin list shows game A's parked records

#### Scenario: Nothing quarantined

- **WHEN** no record is parked
- **THEN** the check reports `Healthy`
