## ADDED Requirements

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

The backend SHALL report the number of quarantined aggregates per consumer group in its health detail. Any
quarantined aggregate MUST make that entry `Degraded`, not `Unhealthy`, because the rest of the pipeline is
still flowing.

#### Scenario: One aggregate quarantined

- **WHEN** game A is quarantined for `chess.rm-pings`
- **THEN** `/health` shows the dead-letter entry as `Degraded` with `chess.rm-pings: 1`
