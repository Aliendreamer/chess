## ADDED Requirements

### Requirement: Only the two players act, and only on their turn

A game SHALL have exactly two players, identified by local `users.id` (D10). A command from anyone else MUST be
rejected without changing the game. A move MUST be accepted only from the player whose turn it is. Resign,
draw offers and abort follow the rules in their own requirements.

#### Scenario: A spectator tries to move

- **WHEN** a signed-in user who is not a player sends a move
- **THEN** the response is 403 and the game is unchanged

#### Scenario: Moving out of turn

- **WHEN** Black sends a move while it is White's turn
- **THEN** the move is rejected as "not your turn" and nothing is persisted

### Requirement: Moves are validated by the rules library and recorded self-describing

A move SHALL be given as UCI (e.g. `e2e4`, `e7e8q`) and applied through the `ChessRules` adapter over
Gera.Chess. An illegal or malformed move MUST be rejected with nothing persisted. A legal move MUST be persisted
as one `MoveMade` event carrying the ply, UCI, SAN, the FEN after the move, both clocks' remaining time after
the move (increment applied), and the server timestamp (D13).

#### Scenario: Legal move

- **WHEN** White sends `e2e4` in the initial position
- **THEN** `MoveMade` is persisted with ply 1, SAN `e4`, a FEN whose placement is
  `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR` with Black to move, and both clocks, and the reply carries
  the new state

#### Scenario: Illegal move

- **WHEN** White sends `e2e5`
- **THEN** the response is 422 with the reason, and nothing is persisted

#### Scenario: Promotion

- **WHEN** a pawn reaches the last rank with `a7a8n`
- **THEN** it becomes a knight and the SAN is `a8=N` (with `+` or `#` when applicable)

### Requirement: Clocks run on the server with increment

Each side SHALL have a remaining time, starting at the time control's initial time. The side to move's clock
MUST run from the server time its turn started. When a move is accepted, the mover's clock MUST be reduced by
the elapsed server time and then increased by the increment. Client-reported times MUST be ignored. Clocks
MUST NOT run before each side's first move (D15).

#### Scenario: Time used and increment added

- **WHEN** in a 3+2 game White has 180 000 ms and moves 4 000 ms after the turn started
- **THEN** White's clock becomes 178 000 ms (180 000 − 4 000 + 2 000)

#### Scenario: First moves are free

- **WHEN** White makes the first move 20 s after the game started
- **THEN** White's clock still shows the full initial time

### Requirement: Running out of time ends the game

When the side to move's remaining time reaches zero, the game SHALL end without waiting for any message. That
side MUST lose, unless the opponent has no mating material (a lone king, or king with only a bishop or a
knight), in which case the result MUST be a draw (D18).

#### Scenario: Flag fall with no move sent

- **WHEN** White's clock runs out while White is thinking
- **THEN** `GameEnded(0-1, timeout)` is persisted and published at that moment

#### Scenario: Flag fall against a lone king

- **WHEN** White's clock runs out and Black has only a king and a knight
- **THEN** the game ends `½-½, timeout vs insufficient material`

### Requirement: An outage never costs a player time

The side to move's clock SHALL be restored to its value at the last persisted event when a game recovers after
its actor stopped (for example a node failure or passivation), and the turn MUST restart from the recovery
time (D14). A flag-fall timer MUST be re-armed with that remaining time.

#### Scenario: Node dies mid-turn

- **WHEN** White has 10 000 ms at the last event, the node dies 3 s later, and the game recovers 2 s after that
- **THEN** White has 10 000 ms again and the flag timer is set for 10 000 ms from recovery

### Requirement: Games end by the rules, by resignation or by agreement

After every accepted move the game SHALL check the rules library and end automatically on checkmate,
stalemate, insufficient material, threefold repetition or the 50-move rule (D18). A player MAY resign on any
turn once the first move has been made. A player MAY offer a draw. Only one offer can be pending, it lapses
when the opponent moves or declines, and the offering player MUST make another move before offering again.
The opponent accepting a pending offer MUST end the game as a draw. Every ending MUST persist exactly one
`GameEnded(result, reason)`, and an ended game MUST reject every further command.

#### Scenario: Checkmate

- **WHEN** the fool's mate sequence `f2f3 e7e5 g2g4 d8h4` is played
- **THEN** the game ends `0-1, checkmate` right after the last move

#### Scenario: Threefold repetition

- **WHEN** both knights go out and back twice (`g1f3 g8f6 f3g1 f6g8` twice)
- **THEN** the game ends `½-½, threefold repetition`, including after a snapshot and recovery in between

#### Scenario: Draw offer lifecycle

- **WHEN** White offers a draw and Black moves instead
- **THEN** the offer lapses. White can't offer again until White has moved, and Black's accept attempt is
  rejected.

#### Scenario: Command after the end

- **WHEN** a player sends a move to an ended game
- **THEN** the response is 409 and nothing is persisted

### Requirement: Unplayed games are aborted

A game SHALL be aborted (`GameEnded(*, aborted)`, no winner) if White hasn't made the first move within 1
minute of the game starting, or Black hasn't made the first reply within 1 minute of White's first move.
Either player MAY abort before their own first move. After both first moves, abort MUST be rejected and resign
used instead.

#### Scenario: No first move

- **WHEN** White doesn't move for 1 minute after the game starts
- **THEN** the game ends `*, aborted` with no result

#### Scenario: Abort too late

- **WHEN** a player sends abort after both players have moved
- **THEN** the response is 409

### Requirement: Every game event reaches Kafka and the live relay

Every persisted game event SHALL be tagged for `game.events` and mapped to the envelope format, keyed
`game:{id}`, with the journal seq (so the Part 0 outbox and projections apply unchanged). After each persisted
event the actor MUST publish a `LiveFrame("game:{id}", seq, view)` whose view carries the players, time control,
status, FEN, last move (UCI and SAN), both clocks with the server time they were read at, the pending draw offer,
and the result when ended. A `game` live subscriber MUST receive the current view as its snapshot.

#### Scenario: Move reaches both

- **WHEN** a move is accepted
- **THEN** a `MoveMade` envelope with that seq appears on `game.events` under key `game:{id}`, and subscribers of
  `game:{id}` receive a frame with the same seq

#### Scenario: Spectator joins mid-game

- **WHEN** a signed-in non-player opens the game's live socket after 10 moves
- **THEN** its first frame is the current position and clocks, and the following frames are the next moves
