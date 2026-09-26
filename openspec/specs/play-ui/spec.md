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
only while playing, the SAN move list, and the last move highlighted. Resign, draw and abort controls MUST
appear only for the two players. An ended game SHALL show its result and reason and link to its PGN.

#### Scenario: A spectator sees no controls

- **WHEN** a signed-in user who is not a player opens `/games/{id}`
- **THEN** the board is shown from White's side and no move, resign, draw or abort control is available

#### Scenario: Moves from the opponent arrive live

- **WHEN** the opponent moves
- **THEN** the board, clocks and move list update from the `game:{id}` frame without a reload

### Requirement: The UI uses the Club design tokens only

Colours, fonts, radii and spacing SHALL come from the Club tokens defined in `styles.css` (CSS variables mapped
into Tailwind's `@theme`). Fonts MUST be self-hosted, and the page MUST NOT load fonts or styles from a third
party.

#### Scenario: No third-party font request

- **WHEN** any page is loaded
- **THEN** every font and stylesheet is served from `app.`'s own origin
