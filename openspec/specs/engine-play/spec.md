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

### Requirement: A person away from an engine game for a minute loses it

In an engine game, the person's presence SHALL be tracked once they have made a move, whether or not the BFF has
reported on the game yet; the engine MUST count as always present. When the person has been away for
`Akka:AbandonAfterSeconds` (60 s), the game MUST end at once with the engine's side winning and reason `Abandonment`;
no claim is offered to anyone. Returning before then MUST leave the game going. Before the person's first move only the
first-move abort applies. Correspondence games and games between people MUST be unaffected.

#### Scenario: The person closes the tab mid-game

- **WHEN** the person playing White has made moves and closes their only game page, and does not come back for a minute
- **THEN** the game ends `0-1` with reason `Abandonment`, and the lobby no longer counts it in play

#### Scenario: The person comes back in time

- **WHEN** the person closes the game page and reopens it 40 s later
- **THEN** the game is still being played and nothing has ended it

#### Scenario: The person never moved

- **WHEN** the person is to make the first move and leaves the page
- **THEN** the first-move abort ends the game with no result after its minute, as before, and no abandonment is
  persisted

#### Scenario: No claim in an engine game

- **WHEN** the person is away in an engine game
- **THEN** the live view never names anyone who may claim abandonment, and a `claim` request is refused with 409

### Requirement: Draw offers are refused in engine games

Draw offers in an engine game MUST be refused with 409, and the UI MUST NOT offer them. Resign and abort work as in any
game.

#### Scenario: Offering a draw to the engine

- **WHEN** the human posts a draw offer in an engine game
- **THEN** it is refused with 409 and nothing is persisted

### Requirement: Quiet engine games are woken and judged

An idle-game sweep SHALL ask every untimed game in play whose read row has not changed for `Akka:UntimedIdleMinutes` to
check itself, oldest first, at most `MaxPerSweep` games per sweep. A woken game with nobody present MUST end by the
abandonment rule above (or the first-move abort when the person never moved); a woken game whose person is present MUST
continue unchanged.

#### Scenario: A game left in play before this change

- **WHEN** an engine game has been `playing` in `rm_games` for hours with no actor alive and nobody on its page
- **THEN** within a sweep plus one lease and one minute it ends with the engine winning by `Abandonment`

#### Scenario: A node went down under an engine game

- **WHEN** the node holding an engine game stops while the person had already left, and the game is quiet for
  `Akka:UntimedIdleMinutes`
- **THEN** the sweep wakes it on a surviving node and it ends by abandonment

#### Scenario: A person thinking for a long time

- **WHEN** the person keeps the game page open without moving for longer than `Akka:UntimedIdleMinutes`
- **THEN** the sweep's check changes nothing and the game is still theirs to play

### Requirement: The engine image carries a pinned, verified Stockfish

The engine image SHALL be built with the Stockfish release named by a pinned download URL and SHA-256, fetched at build
time; the build MUST fail when the downloaded file's SHA-256 differs from the pinned one. The build SHALL NOT need any
file outside the repository. The image MUST carry the release's GPLv3 licence and a notice naming the release and where
its source is, next to the binary.

#### Scenario: A fresh clone builds the engine

- **WHEN** someone clones the repository and runs `tools/deploy/build.sh engine local`
- **THEN** the image builds without any Stockfish archive in the working tree, and `/opt/stockfish/stockfish` in it
  answers `uci` with `id name Stockfish 19`

#### Scenario: A tampered or wrong download

- **WHEN** the image is built with a SHA-256 that does not match the downloaded archive
- **THEN** the build fails at the download step and no image is produced

#### Scenario: The licence travels with the binary

- **WHEN** the engine image is inspected
- **THEN** `/opt/stockfish/Copying.txt` (GPLv3) and `/opt/stockfish/SOURCE.txt` (release tag and source URL) are present
