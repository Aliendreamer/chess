## ADDED Requirements

### Requirement: Each player's captures and the material difference are shown

Under each player's name the game page SHALL show the opponent's pieces that player has captured, grouped by type
(pawns, knights, bishops, rooks, queens), and on the side that is ahead the difference in material counted as
pawn 1, knight 3, bishop 3, rook 5, queen 9. Captures SHALL be derived from the position shown, comparing it with a
full set and counting promoted pieces as material.

#### Scenario: A side is ahead

- **WHEN** White has taken a knight and a pawn and Black has taken a pawn
- **THEN** White's strip shows a black knight and a black pawn with `+3`, and Black's strip shows a white pawn and no
  number

#### Scenario: Equal material

- **WHEN** both sides have taken one pawn
- **THEN** each strip shows one pawn and neither shows a number

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
