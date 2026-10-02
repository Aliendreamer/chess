# play-ui Specification

## Purpose

The Part 1 screens in the owner's Club design: quick pairing and invite links to reach a game, the live game page
(board, clocks, move list, controls for players only), history and PGN. The browser gives instant feedback with
chess.js, but the backend alone decides legality and outcomes.

## Requirements

### Requirement: The client never decides a move's legality or a game's outcome

The game page SHALL post every move to `POST /api/games/{id}/moves` and SHALL treat the backend's answer and
`game:{id}` frames as the only truth. It MAY show a move optimistically and mark legal targets using chess.js.
A rejected move MUST revert to the last server view and show the server's reason. The page MUST NOT end a game,
declare a draw or declare flag fall on its own.

#### Scenario: A rejected move snaps back

- **WHEN** a player's optimistic move is answered 409 or 422
- **THEN** the board shows the last server position again and the server's reason is displayed

#### Scenario: A local clock at zero is not a loss

- **WHEN** the side to move's local countdown reaches 0:00 and no frame has ended the game
- **THEN** the clock shows 0:00 and the game stays in play until the server's frame says otherwise

### Requirement: Players reach a game by quick pairing or an invite link

The home page SHALL offer the D12 presets as quick-pairing tiles. Choosing one MUST join that queue, show the
waiting count, heartbeat every 25 s, and navigate to the game as soon as a `queue:{tc}` frame names this user in
its pairing or a heartbeat answers `matched`. Cancel or leaving the page MUST leave the queue. "Play a friend"
SHALL create an invite and open `/invites/{id}`. There the creator can copy or cancel the link, anyone else can
accept it, and both are navigated to the game when it is accepted.

#### Scenario: The waiting player is moved into the game

- **WHEN** player A waits on `5+3` and player B chooses `5+3`
- **THEN** B lands on the new game from the join answer, and A lands on it from the `queue:5+3` frame without
  waiting for a heartbeat

#### Scenario: An accepted invite moves the creator

- **WHEN** the creator is on `/invites/{id}` and a friend accepts
- **THEN** the creator's page navigates to the game from the `invite:{id}` frame

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

### Requirement: The UI uses the Club design tokens only

Colours, fonts, radii and spacing SHALL come from the Club tokens defined in `styles.css` (CSS variables mapped
into Tailwind's `@theme`), including the game-type tokens (`--color-tc-*`). A site theme MAY redefine the semantic
tokens under `[data-theme=…]`, and components SHALL use only the semantic names. Fonts MUST be self-hosted, and the
page MUST NOT load fonts or styles from a third party.

#### Scenario: No third-party font request

- **WHEN** any page is loaded
- **THEN** every font and stylesheet is served from `app.`'s own origin

#### Scenario: A theme changes no component

- **WHEN** the light theme is added
- **THEN** no file under `components/` changes for it, only `styles.css`

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
