## ADDED Requirements

### Requirement: The lobby is one shared read

The API SHALL answer `GET /api/lobby` for any signed-in user with the number of games in play, the number of people
waiting in each preset queue, and up to `Lobby:TvGames` Club TV games. The answer SHALL be shared by all callers for
`Lobby:CacheSeconds` and SHALL be `no-store` for the browser.

#### Scenario: Counters and queues

- **WHEN** two games are in play and one person waits in the 3+2 queue
- **THEN** the lobby says `gamesInPlay: 2` and lists every preset with `3+2` waiting 1 and the others 0

#### Scenario: Matchmaking does not answer

- **WHEN** the matchmaking singleton does not answer within the ask timeout
- **THEN** the lobby still answers, with `queues: null` and the other fields filled

#### Scenario: Anonymous caller

- **WHEN** the lobby is asked without a session
- **THEN** the API answers 401

### Requirement: Club TV shows the most recently moved live games

Club TV SHALL list games in play, newest activity first, at most `Lobby:TvGames` of them, each with both players'
names, the time control, the position (FEN), the last move and the ply. Correspondence games SHALL NOT appear;
games against the computer MAY appear.

#### Scenario: Order and limit

- **WHEN** eight timed games are in play
- **THEN** Club TV lists the six whose last move is newest, newest first

#### Scenario: Correspondence left out

- **WHEN** the only game in play is a 7-day game
- **THEN** Club TV is empty while `gamesInPlay` counts it

### Requirement: Home shows the club is alive

Home SHALL show the number of games in play, a "n waiting" count on each quick-pairing tile when the queues are known,
and a Club TV section of mini boards that each open the game. Home SHALL refresh the lobby every 10 s while the page is
visible, and SHALL show an empty-state line instead of the boards when no game is on.

#### Scenario: Someone is seeking

- **WHEN** one person waits in the 5+0 queue and another player opens home
- **THEN** the 5+0 tile says "1 waiting"

#### Scenario: Watching from home

- **WHEN** a player clicks a Club TV board
- **THEN** the game page opens with that game, read-only for a spectator

### Requirement: Mini boards render on the server

A mini board SHALL be drawn from a FEN without react-chessboard: the full position with Cburnett pieces in the user's
board theme, the last move tinted, white at the bottom, in the server HTML, with an accessible name naming the players.

#### Scenario: First paint

- **WHEN** home is server-rendered with one TV game
- **THEN** the HTML already contains that game's 64 squares and its pieces

### Requirement: Every game in play can be found and watched

A Watch page SHALL list every game in play, newest activity first, with a mini board, both players and the time
control, page by page ("Load more"), and each entry SHALL open the game.

#### Scenario: Paging

- **WHEN** more games are in play than one page holds
- **THEN** "Load more" appends the next page without repeating a game
