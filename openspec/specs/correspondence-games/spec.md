# correspondence-games Specification

## Purpose

Correspondence games: a week per move reset after every move, deadlines enforced from the database while the game
sleeps, email notifications for the player to move and the result, and the games waiting for your move.

## Requirements

### Requirement: A correspondence game gives each move seven days

A game with the `7d` time control SHALL give the player to move a deadline of 7 days from the previous move (from
the start for the first move). No clock runs and no increment applies. The deadline MUST reset after every move.
The `7d` control MUST be available for invites and MUST NOT be available for matchmaking.

#### Scenario: A move after five days

- **WHEN** White moves on day 5 of their deadline
- **THEN** the move is accepted and Black has 7 days from that move

### Requirement: A missed deadline ends the game

A correspondence game whose player to move has not moved by the deadline SHALL end: aborted with no result before
both first moves, otherwise lost by the player who missed it (reason `Timeout`). The end MUST happen even when no
one opens the game, and after restarts, passivation or failover.

#### Scenario: Black never answers

- **WHEN** Black does not move within 7 days after White's third move
- **THEN** the game ends 1-0 by timeout without anyone opening it

#### Scenario: The deadline check arrives twice

- **WHEN** the deadline check for an expired game is delivered twice
- **THEN** the game ends once

### Requirement: A correspondence game leaves memory while it waits

A correspondence game SHALL keep no timers while waiting for a move and MUST passivate after being idle, recovering
unchanged when someone acts on it or its deadline is checked.

#### Scenario: A move after passivation

- **WHEN** a correspondence game has passivated and the player to move then moves
- **THEN** the move is accepted on the recovered game

### Requirement: No presence-based abandonment in correspondence games

In a correspondence game, presence SHALL NOT be tracked and no abandonment claim MUST be offered; the missed deadline
is the only way a player loses by absence.

#### Scenario: Closing the page for an hour

- **WHEN** a player closes a correspondence game for an hour
- **THEN** nothing is persisted and no claim is offered

### Requirement: The player to move is emailed

After each move in a correspondence game, the player to move SHALL receive one email naming the opponent and linking
to the game; when a correspondence game ends, both players SHALL receive one email with the result. A notification
MUST NOT be sent twice for the same event, and without SMTP configured nothing is sent (only logged).

#### Scenario: Your move

- **WHEN** White moves in a correspondence game
- **THEN** Black gets one email "Your move against <White>" with a link to the game

#### Scenario: A replayed event

- **WHEN** the same move event is consumed twice
- **THEN** only one email is sent
