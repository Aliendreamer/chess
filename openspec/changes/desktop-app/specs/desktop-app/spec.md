## ADDED Requirements

### Requirement: The app works offline for one local player

The desktop app SHALL start and offer every feature with no network, no account and no server: one local player,
whose games, studies, progress, library and news are stored in one SQLite database in the app data directory. It
MUST NOT contact any host except the news sources (and only to fetch news), and MUST NOT load remote scripts, fonts or
images.

#### Scenario: First start with no network

- **WHEN** the app is installed and started on a machine with no network
- **THEN** home opens, a game against the computer can be played to the end and analysed, and the news page says it
  has nothing yet

#### Scenario: Data survives a restart

- **WHEN** the player closes the app in the middle of a game and starts it again
- **THEN** the game is still in play at the same position, with its moves

### Requirement: Stockfish is bundled and supervised

The app SHALL ship the pinned Stockfish release as a sidecar and speak UCI to it: one process for play at the chosen
level, one at full strength for analysis, review and mining. A process that exits SHALL be restarted and its request
asked again; the page MUST show that the engine is restarting rather than fail.

#### Scenario: The engine crashes while thinking

- **WHEN** the play process exits while it is the engine's turn
- **THEN** it is restarted, the move is asked again, and the game continues

### Requirement: Games against the computer

The player SHALL be able to start an untimed game against any of the five levels (Casual, Club, Expert, Master, Maximum)
with a chosen or random colour and the engine's think time of 5, 10 or 20 s a move. The app SHALL enforce the rules,
including checkmate, stalemate, threefold repetition, the fifty-move rule and insufficient material; there are no
clocks. The player MAY resign, take back any number of moves (or play on from an earlier position), premove on the
engine's turn, offer a draw (the engine SHALL accept only from move 15 and when it is not better) and ask the engine to
resign (it SHALL accept only when it is at least five pawns down or mated), the engine answering from the analysis
engine's evaluation. A finished game SHALL have its PGN, be listed in the game list, and be
reviewed automatically.

#### Scenario: A finished game

- **WHEN** the player is checkmated by Casual
- **THEN** the game ends 0-1 (or 1-0) by checkmate, appears first in the game list, its PGN can be saved, and its
  review starts

#### Scenario: A longer think

- **WHEN** the player starts a game against Master with 20 s a move
- **THEN** the engine takes about 20 s for each of its moves, and the next new game offers 20 s first

#### Scenario: A move the rules refuse

- **WHEN** the player drags a piece to an illegal square
- **THEN** the piece returns and the position is unchanged

### Requirement: Analysis and review

The analysis board SHALL take a FEN, a PGN or a finished game and evaluate the position shown once it settles
(quick/normal/deep), with up to three lines, scores in the move tree, the opening name and the library games at the
position. Evaluations SHALL be stored per position and think time and reused, a longer think answering a shorter one.
Every finished game with at least two moves SHALL be reviewed with mistakes marked ?!/?/??, an evaluation graph and
the book exit, as in the club.

#### Scenario: A position already evaluated

- **WHEN** the player opens a position evaluated at deep before and asks for normal
- **THEN** the stored deep evaluation is shown at once and the engine is not asked

### Requirement: Studies

The player SHALL be able to create studies, add moves and variations, import PGN (several games, a broken
game reported by number) and export PGN with variations, and make a study from a finished game.

#### Scenario: Import a collection

- **WHEN** the player imports a PGN file of five games of which the third is broken
- **THEN** four studies are created and the import reports game 3 as not read

### Requirement: The opening trainer and training

The app SHALL offer the opening trainer (families by kind, lines, the Leitner schedule), lines from the player's own
studies, and training sessions from the player's own mistakes and from critical moments of their library's games,
judged and scheduled by the same rules as the club. The miner SHALL run in the background only while the app is open,
and MAY be turned off in settings.

#### Scenario: A mistake becomes training

- **WHEN** the review of a finished game marks a blunder by the player
- **THEN** that position is in "My games" training once, and not the engine's moves

### Requirement: The library and explorer

The player SHALL be able to import PGN collections into the library (moves and factual headers only, replayed from the
start, an illegal game refused, a duplicate skipped), search it by player, event and year, and see the explorer at any
position: the next moves with White/draw/Black counts and the opening reached. The openings list SHALL be embedded.

#### Scenario: A duplicate import

- **WHEN** the player imports the same PGN file twice
- **THEN** the second import adds no games and reports them as duplicates

#### Scenario: The club's library comes with the app

- **WHEN** the app starts for the first time
- **THEN** the World Championship and lichess broadcast games are in the library, the positions the club mined are in
  Master games training (found by a part of a player's name), and the miner never asks a position the club judged

#### Scenario: A new version's library only adds

- **WHEN** a new version ships a changed bundled library
- **THEN** its new games are added, a game the player already has is not stored twice, and the player's progress is kept

### Requirement: News that waits for you

While the app runs and the machine is online, it SHALL fetch the club's news feeds (FIDE, ChessBase, Lichess blog, The
Week in Chess) and the list of tournaments being played, keep the items locally for `keepDays`, and show them on home
and on the news page with their source and date. Links MUST open in the system browser. A failed fetch MUST leave the
stored items as they are. Each source MAY be turned off.

#### Scenario: Back after a week offline

- **WHEN** the player starts the app after a week without network, and the network is back
- **THEN** the items fetched before are shown at once, and the new ones are added after the next round

#### Scenario: A source fails

- **WHEN** ChessBase answers with an error
- **THEN** its stored items stay, the other sources are fetched, and the next round tries again

### Requirement: Settings

The player SHALL be able to choose the site theme (Club dark, Parchment light), the board theme, piece animation and
coordinates, which apply at once and are kept.

#### Scenario: Light theme

- **WHEN** the player picks Parchment
- **THEN** every page uses the light tokens, and the choice is kept after a restart

### Requirement: Backup and restore

The player SHALL be able to save all their data (games, studies, progress, library, news, settings) to one backup file
while the app runs, and to restore such a file, which replaces the current data after a confirmation and keeps the
replaced data aside. A file that is not a backup of this app, or one made by a newer version, MUST be refused with
nothing changed.

#### Scenario: Move to a new machine

- **WHEN** the player saves a backup on one machine and restores it on another with the same or a newer version
- **THEN** the second machine shows the same games, studies, progress and settings

#### Scenario: Not a backup

- **WHEN** the player restores a file that is not a backup of this app
- **THEN** it is refused and the current data is unchanged
