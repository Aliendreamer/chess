## ADDED Requirements

### Requirement: The library explores the moves played from a position

For a position, the API SHALL list every move played next in the library's games (a game counted once, at its first
visit), each with the number of games and how many White won, drew and Black won, most played first, with the opening
name of the position the move reaches when it has one. From the start position it SHALL list every game's first move.
A game that ends at the position adds no move.

#### Scenario: Replies to 1.e4

- **WHEN** the library holds three games after 1.e4: two with 1...e5 (one White win, one draw) and one with 1...c5
  (a Black win)
- **THEN** the position after 1.e4 lists e7e5 with 2 games (1 / 1 / 0) first, then c7c5 with 1 game (0 / 0 / 1)

#### Scenario: The start position

- **WHEN** the board is at the start position
- **THEN** the moves list every game's first move

### Requirement: The board walks the explorer

The analysis board's "In the library" panel SHALL show the moves in standard notation with their game counts and a
result bar, and clicking one SHALL play it on the board.

#### Scenario: Walking a line

- **WHEN** a member clicks 1.e4 in the moves table at the start position
- **THEN** the board shows the position after 1.e4 and the table lists Black's replies
