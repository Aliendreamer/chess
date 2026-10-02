## ADDED Requirements

### Requirement: Pieces are the Cburnett set, licensed BSD

The board, the promotion picker and every other place that draws a piece SHALL use the Cburnett SVGs served from
`/pieces/cburnett/{wK,wQ,wR,wB,wN,wP,bK,bQ,bR,bB,bN,bP}.svg`. The files MUST be the Wikimedia Commons copies used under
their 3-clause BSD option, and `apps/frontend/ATTRIBUTION.md` MUST name the author, the source and the licence. No
Unicode chess glyph SHALL be used to draw a piece.

#### Scenario: A board shows image pieces

- **WHEN** a game page renders the starting position
- **THEN** each of the 32 pieces is an image from `/pieces/cburnett/` and the page contains no ♔–♟ glyphs

#### Scenario: The promotion picker

- **WHEN** a white pawn reaches the eighth rank
- **THEN** the picker shows the white queen, rook, bishop and knight images, queen first

### Requirement: The board uses a named theme, Brown by default

The board's light and dark squares SHALL take their colours from a board theme, one of `brown` (#f0d9b5 / #b58863),
`blue` (#dee3e6 / #8ca2ad), `green` (#ffffdd / #86a666), `slate` (#c9cfd6 / #5d6b7a) and `walnut` (#ead6b0 / #9a6a44),
defined as CSS variables in `styles.css`. `brown` MUST be the default. Coordinates SHALL sit inside the edge squares
in the opposite square colour.

#### Scenario: Default theme

- **WHEN** a user who never chose a theme opens a game
- **THEN** the light squares are #f0d9b5 and the dark squares #b58863

### Requirement: Highlights show the last move, the selection, the targets and check

The board SHALL tint the last move's two squares and the selected piece's square, mark every legal target of the
selected piece (a dot on an empty square, a ring on a capture), and show a red radial glow on the square of a king in
check. Targets SHALL come from chess.js for feedback only.

#### Scenario: Check is marked

- **WHEN** the position after 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7+ is shown
- **THEN** the e8 square carries the check glow and f7 and h5 carry the last-move tint

#### Scenario: Capture targets are rings

- **WHEN** a knight that can take a pawn is selected
- **THEN** the pawn's square shows a ring and the empty targets show dots

### Requirement: Pieces move by click, by drag, and slide into place

A player SHALL be able to move by clicking the piece and then the target, or by dragging the piece onto the target.
Every position change SHALL animate the pieces that moved over 200 ms (no animation when the user prefers reduced
motion). A drop on a square that is not a legal target SHALL put the piece back without sending anything.

#### Scenario: Drag a legal move

- **WHEN** White drags the e2 pawn to e4 on their turn
- **THEN** the pawn stays on e4 at once and the move is sent to the server

#### Scenario: Drop on an illegal square

- **WHEN** White drags the e2 pawn to e5
- **THEN** the pawn returns to e2 and no command is sent

#### Scenario: The opponent's move slides

- **WHEN** a `game:{id}` frame brings the opponent's move
- **THEN** the moved piece slides from its old square to its new one

### Requirement: One premove can be queued while the opponent is to move

While a player's opponent is to move, the player SHALL be able to queue one premove by click or drag with their own
pieces, ignoring legality in the current position. The queued move's squares SHALL be highlighted in a premove
colour. When a frame makes it the player's turn, the premove MUST be sent if it is legal in the new position and
dropped silently otherwise. A click on an empty square or a right-click SHALL cancel it. Premoves SHALL NOT exist in
studies, in correspondence games or in games against the computer.

#### Scenario: A premove is played

- **WHEN** Black queues e7e5 while White is to move, and White plays e4
- **THEN** e7e5 is sent as soon as the frame with e4 arrives, without another click

#### Scenario: A premove that became illegal

- **WHEN** Black queues d8h4 and White's move blocks the diagonal
- **THEN** nothing is sent, the premove highlight disappears, and Black moves normally

### Requirement: Arrows and circles can be drawn

A right-drag from one square to another SHALL draw an arrow, and a right-click on a square SHALL draw a circle, on the
game page (players and spectators) and the study page. Shapes MUST stay in the browser (never sent to the server) and
SHALL clear when the position changes.

#### Scenario: Drawing an arrow

- **WHEN** a spectator right-drags from g1 to f3
- **THEN** an arrow from g1 to f3 is drawn, and it disappears after the next move

### Requirement: The board is drawn in the browser without a layout shift

The interactive board SHALL render only in the browser. The server-rendered page MUST contain an empty board of the
same size and theme colours in its place, so the page does not move when the board appears. Every square MUST keep a
`data-square` attribute with its name.

#### Scenario: First paint

- **WHEN** a game page is loaded with JavaScript disabled
- **THEN** an empty 8×8 board in the theme colours is visible where the board will be
