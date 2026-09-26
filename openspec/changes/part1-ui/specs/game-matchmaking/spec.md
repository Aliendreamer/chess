## MODIFIED Requirements

### Requirement: A user waits in at most one queue, and only while present

A user SHALL hold at most one queue entry: joining another queue MUST move them. A seeker stays queued only
while they keep re-joining: an entry not renewed for 60 seconds MUST expire. `DELETE /api/matchmaking/{tc}` MUST
remove the entry at once. The queues are not persisted: after a failover, the next heartbeat re-queues the user.
A keep-alive is `POST /api/matchmaking/{tc}?heartbeat=true`: only a heartbeat MAY be answered with a pairing made
in the last 60 seconds; a plain `POST` MUST always seek a new game.

#### Scenario: Switching queues

- **WHEN** user A is waiting in `5+3` and joins `10+5`
- **THEN** A is in `10+5` only, and a later `5+3` seeker is not paired with A

#### Scenario: Gone quiet

- **WHEN** user A joined `5+3` and has not re-joined for 61 seconds
- **THEN** A's entry has expired, and the next `5+3` seeker waits instead of being paired with A

#### Scenario: Re-joining keeps your place

- **WHEN** user A re-joins `5+3` while already waiting there
- **THEN** A keeps their original place in the queue and their entry is renewed

#### Scenario: A heartbeat that raced its pairing

- **WHEN** A was waiting in `5+3`, B's join paired them, and A's heartbeat arrives a moment later
- **THEN** A's heartbeat answers `matched` with the same game, and no second game starts

#### Scenario: Queueing again right after a quick game

- **WHEN** A was paired in `5+3` less than 60 seconds ago and joins `5+3` again with a plain `POST`
- **THEN** A is waiting for a new opponent instead of being answered with the finished game
