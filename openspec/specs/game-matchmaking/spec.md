# game-matchmaking Specification

## Purpose

How two players get into a game: a first-come-first-served queue per preset time control (a cluster singleton, kept
alive by client heartbeats), and rematches of a finished game (24-hour invites reserved for the opponent). Both
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

### Requirement: A finished game can be rematched

`POST /api/games/{id}/rematch` SHALL be allowed only to a player of that game, only once it has ended, and not for a
game against the computer (400). The rematch is an invite whose id is the game's id, reserved for the other player,
with the same time control and the caller taking the colour the opponent had. The first call creates the invite
(the caller is its creator). A call by the reserved guest accepts it and starts the game; any other user is refused as
forbidden. A repeated call by the creator returns the open invite unchanged. The rematch invite SHALL be open for 24
hours, SHALL survive a node failure, and SHALL be a live topic `invite:{id}` whose snapshot and frames carry its status
and, once accepted, the new game's id.

#### Scenario: Both players press Rematch

- **WHEN** White presses Rematch after the game ends and then Black presses Rematch
- **THEN** a new game starts with the previous Black as White, the same time control, and the `invite:{gameId}` frame
  names the new game

#### Scenario: A spectator asks for a rematch

- **WHEN** a user who did not play the game posts to its rematch
- **THEN** the answer is 403 and no invite exists

#### Scenario: Too late

- **WHEN** the guest presses Rematch 25 hours after the offer
- **THEN** the rematch is refused as expired

#### Scenario: The game is still on

- **WHEN** a player posts to the rematch of a game that is still playing
- **THEN** the answer is 409
