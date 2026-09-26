# game-matchmaking Specification

## Purpose

How two players get into a game: a first-come-first-served queue per preset time control (a cluster singleton, kept
alive by client heartbeats), and 24-hour invite links that start a game with the creator's chosen colour. Both
start games only through `IGameStarter` and publish their state on the live relay (`queue:{tc}`, `invite:{id}`).

## Requirements

### Requirement: Players queue per time control and are paired first come, first served

A signed-in user SHALL join a queue with `POST /api/matchmaking/{tc}` for any D12 preset. Any other time control
MUST be 400. When another user is already waiting in that queue, the two MUST be paired at once, the one who
waited longest first (with immediate pairing a queue holds at most one waiting seeker). A game MUST be started for them with random colours, and both MUST learn its id. A user
MUST NOT be paired with themselves.

#### Scenario: Second seeker makes a game

- **WHEN** user A has joined `5+3` and user B then joins `5+3`
- **THEN** a 5+3 game between A and B is started, B's response carries its id, and A learns it from the queue

#### Scenario: A queue holds at most one seeker

- **WHEN** A joins `3+2` and B joins `3+2`
- **THEN** A and B are paired at once, the queue is empty again, and the next seeker C waits alone

#### Scenario: Not a preset

- **WHEN** a user posts to `/api/matchmaking/4+2`
- **THEN** the response is 400

### Requirement: A user waits in at most one queue, and only while present

A user SHALL hold at most one queue entry: joining another queue MUST move them. A seeker stays queued only
while they keep re-joining: an entry not renewed for 60 seconds MUST expire. `DELETE /api/matchmaking/{tc}` MUST
remove the entry at once. The queues are not persisted: after a failover, the next heartbeat re-queues the user.

#### Scenario: Switching queues

- **WHEN** user A is waiting in `5+3` and joins `10+5`
- **THEN** A is in `10+5` only, and a later `5+3` seeker is not paired with A

#### Scenario: Gone quiet

- **WHEN** user A joined `5+3` and has not re-joined for 61 seconds
- **THEN** A's entry has expired, and the next `5+3` seeker waits instead of being paired with A

#### Scenario: Re-joining keeps your place

- **WHEN** user A re-joins `5+3` while already waiting there
- **THEN** A keeps their original place in the queue and their entry is renewed

### Requirement: Pairings are visible live on the queue

Each queue SHALL be a live topic `queue:{tc}`. Its frames MUST carry the number of users waiting and, when a
pairing happens, the game id with both player ids. The snapshot MUST be the current waiting count.

#### Scenario: Waiting player learns of the match

- **WHEN** A is subscribed to `queue:5+3` and B joins, forming a game
- **THEN** A receives a frame naming the new game and both player ids

### Requirement: Invite links start a game with the first signed-in user who accepts

A signed-in user SHALL create an invite with `POST /api/invites` for a D12 preset and a colour (`white`, `black`
or `random`). The response MUST include a random, unguessable invite id (a v4 Guid in `N` form). Any signed-in
user other than the creator MAY read it (`GET /api/invites/{id}`) and accept it (`POST /api/invites/{id}/accept`).
The first accept MUST start the game with the creator's chosen colour (random resolved once at acceptance) and
answer with the game id. Every later accept MUST be 409. The creator accepting their own invite MUST be 409.

#### Scenario: Friend accepts

- **WHEN** A creates a `10+5` invite as `black`, and B accepts it
- **THEN** a 10+5 game starts with B as White and A as Black, and both the accept response and the invite show its
  id

#### Scenario: Too late

- **WHEN** C accepts the same invite after B
- **THEN** the response is 409 and no second game starts

### Requirement: Invites end when accepted, cancelled or after 24 hours

An invite SHALL be `open` until it is accepted, cancelled by its creator (`POST /api/invites/{id}/cancel`), or 24
hours have passed since it was created. After that it MUST refuse to be accepted (409) and report its status
(`accepted` with the game id, `cancelled`, or `expired`). Only the creator MAY cancel. An unknown id MUST be 404.
Invites MUST survive a node failure.

#### Scenario: Expired

- **WHEN** B opens an invite created 25 hours ago
- **THEN** it reports `expired`, and accepting it is 409

#### Scenario: Cancel

- **WHEN** the creator cancels an open invite
- **THEN** it reports `cancelled`, and a stranger's cancel attempt is 403

### Requirement: The creator learns live when the invite is accepted

Each invite SHALL be a live topic `invite:{id}`, whose snapshot and frames carry the invite's status and, once
accepted, the game id.

#### Scenario: Creator waiting on the link

- **WHEN** A is subscribed to `invite:{id}` and B accepts
- **THEN** A receives a frame with status `accepted` and the game id
