## ADDED Requirements

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
range, result, World Championship only, ECO code and opening name, newest year first, page by page.

#### Scenario: A player as either colour

- **WHEN** a member searches for "kasparov" between 1984 and 1990, World Championship only
- **THEN** the results are the World Championship games of those years in which Kasparov played White or Black

#### Scenario: An opening

- **WHEN** a member searches for ECO "C67"
- **THEN** every result's opening is a C67 line

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
