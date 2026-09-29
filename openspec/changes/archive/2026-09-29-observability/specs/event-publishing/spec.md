## MODIFIED Requirements

### Requirement: Wire format and ordering are preserved

Published records SHALL keep the Part 0 contract: topic from the event's tag, key `ping:{id}` for pings,
value an `EventEnvelope` whose `seq` equals the journal sequence number. Records for one aggregate MUST
appear on the topic in `seq` order. A record whose event carries a trace context MUST carry it as the W3C
`traceparent` header (and `tracestate` when present); the envelope MUST NOT change because of it, and a record
without a trace context has no such header.

#### Scenario: Envelope matches the journal

- **WHEN** `ping-abc` persists its 3rd event
- **THEN** the record on `game.events` has key `ping:abc`, `type` `ping.pinged`, `v` 1, `aggregateId`
  `abc` and `seq` 3

#### Scenario: Per-aggregate order

- **WHEN** one ping id receives 50 pings in quick succession
- **THEN** the records for that key on `game.events` carry `seq` 1..50 in order

#### Scenario: The trace travels as a header

- **WHEN** a move persisted while tracing was on is published
- **THEN** its record has a `traceparent` header continuing the move's trace, and its envelope is byte-for-byte
  what it would be without tracing

#### Scenario: An old event has no header

- **WHEN** an event persisted before this change is published
- **THEN** its record has no `traceparent` header and consumers handle it as before
