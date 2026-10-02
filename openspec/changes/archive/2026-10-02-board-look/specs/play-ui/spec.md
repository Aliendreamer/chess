## MODIFIED Requirements

### Requirement: The game page shows the game from the viewer's side, and only players act

The page SHALL orient the board toward the viewer's colour (White for spectators). It SHALL show both players by
display name (`Player {id}` until the read side has them), clocks that count down locally for the side to move
only while playing, the SAN move list, the last move highlighted, and a king in check marked. A player SHALL be able
to queue one premove in a live timed game while the opponent is to move. Resign, draw and abort controls MUST
appear only for the two players. An ended game SHALL show its result and reason and link to its PGN.

#### Scenario: A spectator sees no controls

- **WHEN** a signed-in user who is not a player opens `/games/{id}`
- **THEN** the board is shown from White's side and no move, resign, draw or abort control is available

#### Scenario: Moves from the opponent arrive live

- **WHEN** the opponent moves
- **THEN** the board, clocks and move list update from the `game:{id}` frame without a reload, and the moved piece
  slides into place

#### Scenario: A spectator cannot premove

- **WHEN** a spectator drags a piece
- **THEN** the piece does not move and nothing is queued
