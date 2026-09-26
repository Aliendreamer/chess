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

### Requirement: Pairings are visible live on the queue

Each queue SHALL be a live topic `queue:{tc}`. Its frames MUST carry the number of users waiting and, when a
pairing happens, the game id with both player ids. The snapshot MUST be the current waiting count. A `waiting`
answer MUST carry the queue's live `seq` as of that answer (its own join's frame included), so that a client can
ignore pairings in frames up to it: the queue's view keeps its last pairing, which may name the client's previous
game.

#### Scenario: Waiting player learns of the match

- **WHEN** A is subscribed to `queue:5+3` and B joins, forming a game
- **THEN** A receives a frame naming the new game and both player ids

#### Scenario: A previous pairing is not mistaken for a new one

- **WHEN** A was paired in `5+3`, queues again at once and is answered `waiting` with seq 3
- **THEN** every `queue:5+3` frame with seq up to 3 may still name A's previous game, and only a frame after seq 3
  that names A is A's new game
