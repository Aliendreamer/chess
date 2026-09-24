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
