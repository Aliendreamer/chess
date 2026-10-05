# game-library Specification

## Purpose

The club's library of famous games: World Championship and classic games with their source and licence, searched by
details, opening and position, imported by admins from PGN, and shown on the analysis board at every position.

## Requirements

### Requirement: Library games carry their source and licence

Every library game SHALL store its players, event, site, round, date (partial allowed), result, opening, moves, source
and licence, and every place that shows a library game SHALL show its source and licence. No annotation from any
source SHALL be stored.

#### Scenario: Attribution on a game

- **WHEN** a member opens a game imported from the lichess broadcasts
- **THEN** the page says its source is the lichess broadcasts under CC BY-SA 4.0

### Requirement: Admins import games from PGN

An admin SHALL be able to import a PGN file into the library with a source, a licence and whether the games are World
Championship games. The server SHALL replay every game from the standard start and SHALL refuse a game that is illegal
or starts from another position, SHALL skip a game already in the library, and SHALL report each game's outcome.
Anyone without the Admin role SHALL get 403.

#### Scenario: A mixed file

- **WHEN** an admin imports three games: one new, one already imported, one with an illegal move
- **THEN** the answer says imported, duplicate and refused (with the move) and only the new game is added

#### Scenario: Not an admin

- **WHEN** a member without the Admin role posts an import
- **THEN** the API answers 403 and nothing is stored

### Requirement: Library games can be searched by details and opening

The API and the Library page SHALL search games by player (either colour, part of the name, any case), event, year
range, result, World Championship only, ECO code, opening name and source (all, World Championships, lichess
broadcasts), newest year first, page by page.

#### Scenario: A player as either colour

- **WHEN** a member searches for "kasparov" between 1984 and 1990, World Championship only
- **THEN** the results are the World Championship games of those years in which Kasparov played White or Black

#### Scenario: An opening

- **WHEN** a member searches for ECO "C67"
- **THEN** every result's opening is a C67 line

#### Scenario: Broadcasts only

- **WHEN** a member searches for "carlsen" with source lichess broadcasts
- **THEN** every result is a broadcast game with Carlsen as White or Black, credited to the lichess broadcasts

### Requirement: Every game and position has an opening name

Each library game SHALL show the deepest named opening position it reaches, from the CC0 lichess opening list, and
the analysis board SHALL show the opening name of its current position when the position is named or follows from
one, by position (so transpositions get the same name).

#### Scenario: A transposition

- **WHEN** two games reach the same named position by different move orders
- **THEN** both show the same opening name

### Requirement: Positions find the famous games that reached them

The API SHALL list the library games that reached a position, with the move number, and how many of them White won,
drew and Black won; the analysis board SHALL show them in an In the library panel and open a game at that move.

#### Scenario: A position from the 1972 match

- **WHEN** the analysis board reaches a position that occurred in a library game
- **THEN** the panel lists that game with its players, year and result, and a click opens it at that position

#### Scenario: A position nobody played

- **WHEN** the position occurs in no library game
- **THEN** the panel says no library game reached it

### Requirement: The library explores the moves played from a position

For a position and a source choice (all, World Championships, lichess broadcasts; all by default), the API SHALL list
every move played next in the chosen games (a game counted once, at its first visit). Each move SHALL come with the
number of games and how many White won, drew and Black won, most played first, and with the opening name of the
position the move reaches when it has one. From the start position it SHALL list every chosen game's first move. A
game that ends at the position, or whose stored positions end there, SHALL add no move. The counts SHALL be computed
by the database, never by loading the games.

#### Scenario: Replies to 1.e4

- **WHEN** the library holds three games after 1.e4: two with 1...e5 (one White win, one draw) and one with 1...c5
  (a Black win)
- **THEN** the position after 1.e4 lists e7e5 with 2 games (1 / 1 / 0) first, then c7c5 with 1 game (0 / 0 / 1)

#### Scenario: The start position

- **WHEN** the board is at the start position
- **THEN** the moves list every chosen game's first move

#### Scenario: One source

- **WHEN** the library holds one World Championship game and two broadcast games after 1.e4, and the member picks
  broadcasts
- **THEN** the moves count only the two broadcast games

### Requirement: The board walks the explorer

The analysis board's "In the library" panel SHALL show the moves in standard notation with their game counts and a
result bar, a source switch (All, World Championships, Broadcasts) kept in the address, and one attribution line per
source it counts. Clicking a move SHALL play it on the board.

#### Scenario: Walking a line

- **WHEN** a member clicks 1.e4 in the moves table at the start position
- **THEN** the board shows the position after 1.e4 and the table lists Black's replies

#### Scenario: Credits

- **WHEN** the panel counts broadcast games
- **THEN** it shows "Lichess broadcasts, CC BY-SA 4.0" with a link to the lichess database

### Requirement: Admins import a month of lichess broadcasts

An admin SHALL be able to start the import of one month of the lichess broadcast database by naming the month. The
server SHALL fetch that month's file from database.lichess.org, a URL built from the month only. It SHALL import the
games that pass the broadcast filter with source "lichess broadcasts", licence "CC BY-SA 4.0" and the game's lichess
URL as its reference, in the background. It SHALL record the run's progress: read, kept, imported, duplicate and
refused. Only one run SHALL run at a time. A month imported again SHALL add no game twice. Anyone without the Admin
role SHALL get 403.

#### Scenario: A month is imported

- **WHEN** an admin starts the import of 2026-08
- **THEN** a run is listed as running and then finished, with how many games were read, kept and imported, and the
  imported games show their source, licence and lichess link

#### Scenario: The same month twice

- **WHEN** an admin imports a month that was already imported
- **THEN** the run finishes with every kept game counted as a duplicate and the library unchanged

#### Scenario: A run already going

- **WHEN** an admin starts an import while another run is running
- **THEN** the API answers 409 and the running import goes on

#### Scenario: Not a month

- **WHEN** an admin posts a month that is malformed or not published (e.g. "2019-13" or a future month)
- **THEN** the API answers 400 and nothing is fetched

### Requirement: Broadcast games are filtered for strength

The broadcast import SHALL keep a game only if:

- it is standard chess from the standard start;
- it has a finished result;
- both players' ratings are at least the configured minimum (2400 by default);
- when fast games are excluded (the default), its time control does not read as under 10 minutes base. A game without
  a readable time control is kept.

It SHALL store each kept game's positions only up to the configured number of plies (40 by default) and SHALL store
no comment, evaluation or clock from the file.

#### Scenario: A weaker game

- **WHEN** a broadcast game has White rated 2450 and Black 2310
- **THEN** it is not kept

#### Scenario: A blitz game

- **WHEN** a game between two 2600 players has time control "3+2"
- **THEN** it is not kept, and the same game with "90+30" or no time control is kept

#### Scenario: Positions of a long game

- **WHEN** a kept broadcast game is 90 plies long
- **THEN** its positions are stored for plies 0 to 40 and its moves are stored in full
