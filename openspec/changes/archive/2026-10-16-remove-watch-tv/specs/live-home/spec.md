## MODIFIED Requirements

### Requirement: The lobby is one shared read

The API SHALL answer `GET /api/lobby` for any signed-in user with the number of games in play and the number of people
waiting in each preset queue. The answer SHALL be shared by all callers for `Lobby:CacheSeconds` and SHALL be
`no-store` for the browser.

#### Scenario: Counters and queues

- **WHEN** two games are in play and one person waits in the 3+2 queue
- **THEN** the lobby says `gamesInPlay: 2` and lists every preset with `3+2` waiting 1 and the others 0

#### Scenario: Matchmaking does not answer

- **WHEN** the matchmaking singleton does not answer within the ask timeout
- **THEN** the lobby still answers, with `queues: null` and the other fields filled

#### Scenario: Anonymous caller

- **WHEN** the lobby is asked without a session
- **THEN** the API answers 401

### Requirement: Home shows the club is alive

Home SHALL show a "n waiting" count on a quick-pairing tile when someone waits there, and SHALL refresh the lobby every
10 s while the page is visible.

#### Scenario: Someone is seeking

- **WHEN** one person waits in the 5+0 queue and another player opens home
- **THEN** the 5+0 tile says "1 waiting"

## REMOVED Requirements

### Requirement: Club TV shows the most recently moved live games

**Reason**: A club's members do not watch strangers' games; the section mostly showed orphaned test games.
**Migration**: None; a game is still opened by its link.

### Requirement: Mini boards render on the server

**Reason**: Only Club TV and the Watch page drew mini boards.
**Migration**: None.

### Requirement: Every game in play can be found and watched

**Reason**: The Watch page is removed with Club TV.
**Migration**: `GET /api/games?status=playing` still lists games in play for any client that needs it.
