## ADDED Requirements

### Requirement: Each player's material surplus is shown

Under each player's name the game page SHALL show the material imbalance as lichess does: for each piece type
(pawns, knights, bishops, rooks, queens) the side with more of that type shows the surplus as the opponent's piece
images, and the side ahead in points (pawn 1, knight 3, bishop 3, rook 5, queen 9) shows `+N`. The imbalance SHALL be
derived from the position shown, so a promotion counts as the promoted piece.

#### Scenario: A side is ahead

- **WHEN** White has taken a knight and a pawn and Black has taken a pawn
- **THEN** White's strip shows a black knight and `+3`, and Black's strip shows nothing

#### Scenario: An uneven trade

- **WHEN** Black has won a rook for a bishop and a pawn
- **THEN** White's strip shows a black pawn and a black bishop, and Black's strip shows a white rook and `+1`

### Requirement: Earlier positions can be viewed without leaving the game

The move list SHALL be clickable. A click on a move, the keys ← → Home End, and a start / back / forward / end bar
under the board SHALL change the position shown. While an earlier position is shown the board MUST be read-only, the
viewed move MUST be highlighted in the list, and a "Back to the game" control SHALL return to the latest position. A
new move arriving while the player looks back SHALL NOT change the position shown. If the latest position is shown,
the view SHALL follow new moves. Navigation SHALL be available to players during a live game and to spectators.

#### Scenario: Stepping back

- **WHEN** a player presses ← after move 12…Nf6
- **THEN** the board shows the position after 12.Bd3, 12.Bd3 is highlighted in the list, and the board cannot be
  moved on

#### Scenario: The opponent moves while you look back

- **WHEN** a player views move 5 and the opponent plays move 20
- **THEN** the board still shows move 5, the list gains move 20, and "Back to the game" shows move 20

### Requirement: The board can be flipped

A flip control and the `f` key SHALL turn the board to the other side for the current page view, for players and
spectators alike. The player strips SHALL swap with it, so each name stays next to its own side.

#### Scenario: A spectator flips

- **WHEN** a spectator presses `f`
- **THEN** the board is shown from Black's side with Black's strip at the bottom
