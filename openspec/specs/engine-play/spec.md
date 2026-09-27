# engine-play Specification

## Purpose

Games against the computer: Stockfish in its own worker behind Kafka, five levels as seeded players, untimed games,
moves requested and applied through the ordinary game path, and recovery when the engine restarts or a request is lost.

## Requirements

### Requirement: A player can start a game against the computer at a chosen level

A signed-in player SHALL be able to start a game against Stockfish at one of five levels (1320, 1600, 2000, 2400, max,
shown as Casual, Club, Expert, Master and Maximum because `UCI_Elo` is an engine scale, not a human one)
choosing White, Black or random. Each level MUST be a seeded user, so the game has two players like any other and
shows the engine's name in lists and PGN.

#### Scenario: Starting as White against 1600

- **WHEN** a player posts `/api/engine-games` with level 1600 and colour white
- **THEN** a game starts with the player as White and `Stockfish (Club)` as Black, and the answer is its view

#### Scenario: An unknown level

- **WHEN** a player asks for level 1800
- **THEN** the request is refused with 400 before any game is created

### Requirement: Engine games are untimed

An engine game SHALL use the `untimed` time control: no clocks run, no flag falls, and the view carries no clock
values. The first-move abort MUST still apply to the human player. `untimed` MUST NOT be available to the queue or to
invites.

#### Scenario: A long think by the human

- **WHEN** the human takes ten minutes over a move in an engine game
- **THEN** the game is still playing and the move is accepted

### Requirement: The engine moves within its think time

When the engine is to move, the backend SHALL request a move with a think time drawn from 5–10 s (configurable), and the
engine worker MUST answer with the best move Stockfish finds at the game's level in that time. The move MUST be applied
through the same command path and rules as a human's move.

#### Scenario: The engine replies

- **WHEN** the human plays 1.e4 against Stockfish (Expert)
- **THEN** within about 5–10 s a legal reply for Black appears in the game, its live frame and its move list

#### Scenario: The engine plays first

- **WHEN** a game starts with the engine as White
- **THEN** the engine makes the first move without any action by the human

### Requirement: Engine moves are applied at most once

An engine result SHALL be applied only if it matches the game's current ply and it is the engine's turn. A duplicate,
stale or late result (the game ended, the human resigned) MUST be dropped without an error visible to the player.

#### Scenario: A result arrives twice

- **WHEN** the same engine result is delivered twice
- **THEN** the move is made once and the second delivery is ignored

### Requirement: Engine games survive an engine restart

A request SHALL NOT be lost when the engine worker or one of its Stockfish processes stops mid-think. The worker MUST
commit a request only after its result is published, and the game MUST re-request a move if the engine has not moved
within the stall time (60 s by default) or when the game recovers with the engine to move.

#### Scenario: The engine container restarts mid-think

- **WHEN** the `engine` container is restarted while the engine is thinking
- **THEN** the engine's move still arrives after the container is back, and the game continues

### Requirement: No abandonment or draw offers in engine games

In an engine game, presence SHALL NOT be tracked: no player-left, returned or abandonment events are persisted and no
claim is offered. Draw offers MUST be refused with 409, and the UI MUST NOT offer them. Resign and abort work as in any
game.

#### Scenario: The human leaves the page

- **WHEN** the human closes the tab for five minutes in an engine game
- **THEN** no abandonment is offered or claimable, and the game is unchanged when they return

#### Scenario: Offering a draw to the engine

- **WHEN** the human posts a draw offer in an engine game
- **THEN** it is refused with 409 and nothing is persisted
