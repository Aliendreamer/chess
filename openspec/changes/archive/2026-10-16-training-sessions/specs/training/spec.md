## ADDED Requirements

### Requirement: Finished games are reviewed and their mistakes kept automatically

Every game that ends with at least two moves and not by abort SHALL be reviewed by the engine without anyone asking,
and each player's mistakes and blunders from a complete review SHALL be in that player's training pool once, without
any button.

#### Scenario: A finished game

- **WHEN** a member finishes a game with two blunders and later opens training in "My games"
- **THEN** both positions are in their pool once, and none of their opponent's

### Requirement: Critical moments are mined from the library

A background miner SHALL examine library positions from ply `Training:MinPly` on, at most `Training:PerGame` per
game, through the engine's review queue, and SHALL keep a position only when it has at least two legal moves and the
engine's best move beats its second by at least `Training:MinGap` in winning chances for the side to move. A position
SHALL be examined once.

#### Scenario: A quiet position

- **WHEN** the engine's two best moves in a position are 0.05 apart
- **THEN** the position is not in the pool and is never asked again

#### Scenario: A critical position

- **WHEN** the best move is 0.4 better than the second
- **THEN** the position is in the pool with the master's move, the engine-accepted moves, the line, and the game's facts

### Requirement: Training sessions

A member SHALL be able to train in "My games" or "Master games" (filtered by opening, phase, player and years), in sets
of 10 or endlessly, one position at a time, never the same position twice in a session; due positions come first.

#### Scenario: Filters

- **WHEN** a member starts master games with phase endgame and player "Carlsen"
- **THEN** every position offered is an endgame from a game Carlsen played

### Requirement: The server judges each answer

In master games a move SHALL be correct when it is the move the master played or a move the engine accepts, and the
answer SHALL say which; in my games a move SHALL be correct when the engine accepts it. A wrong answer SHALL show the
master's move (master games), the move played in the game (my games), and the engine's line. Each answer SHALL move the
position in the member's Leitner boxes as the opening trainer does.

#### Scenario: The master's move

- **WHEN** a member plays the move Kasparov played, which the engine does not accept
- **THEN** it is correct and the answer says it is the master's move

#### Scenario: A wrong answer

- **WHEN** a member's move is neither
- **THEN** it is wrong, the position goes to box 0 due now, and the master's move and the engine's line are shown
