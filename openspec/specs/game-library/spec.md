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

### Requirement: The library explores the moves played from a position

For a position, the API SHALL list every move played next in the library's games (a game counted once, at its first
visit), each with the number of games and how many White won, drew and Black won, most played first, with the opening
name of the position the move reaches when it has one. From the start position it SHALL list every game's first move.
A game that ends at the position adds no move.

#### Scenario: Replies to 1.e4

- **WHEN** the library holds three games after 1.e4: two with 1...e5 (one White win, one draw) and one with 1...c5
  (a Black win)
- **THEN** the position after 1.e4 lists e7e5 with 2 games (1 / 1 / 0) first, then c7c5 with 1 game (0 / 0 / 1)

#### Scenario: The start position

- **WHEN** the board is at the start position
- **THEN** the moves list every game's first move

### Requirement: The board walks the explorer

The analysis board's "In the library" panel SHALL show the moves in standard notation with their game counts and a
result bar, and clicking one SHALL play it on the board.

#### Scenario: Walking a line

- **WHEN** a member clicks 1.e4 in the moves table at the start position
- **THEN** the board shows the position after 1.e4 and the table lists Black's replies
