# studies Specification

## Purpose

Studies: games kept with their variations, imported from PGN or made from a finished game, validated move by move on
the server, shared read-only by link, and exported as PGN.

## Requirements

### Requirement: A study keeps a game with its variations

A study SHALL hold a title, a start position and a move tree with a main line and any number of nested variations. It
MUST belong to the user who created it; only the owner can change, share or delete it.

#### Scenario: A saved variation

- **WHEN** the owner plays 2…Nc6 instead of the main line's 2…d6 and saves
- **THEN** reopening the study shows the main line with 2…Nc6 as a variation

### Requirement: The server accepts only legal studies

The server SHALL replay every line of a study from its start position with the rules library and store the SAN and
FEN it computed. A study with an illegal move, an unparseable start position or beyond the size limits MUST be
refused with 400, naming the first bad move.

#### Scenario: An illegal move in a variation

- **WHEN** a client saves a tree whose variation contains the illegal move `e1e3`
- **THEN** the save is refused with 400 naming that move, and the stored study is unchanged

### Requirement: PGN can be imported and exported

A user SHALL be able to import PGN by pasting text or uploading a file; each game (up to 20) MUST become one study with
its variations, and games that cannot be read MUST be reported while the others are imported. A study SHALL be
downloadable as PGN with its variations.

#### Scenario: A file with three games, one broken

- **WHEN** a user uploads a PGN file with three games, the second of which has an illegal move
- **THEN** two studies are created and the second game is reported as not imported

### Requirement: A study can be shared read-only

The owner SHALL be able to share a study; anyone signed in with its link MUST then be able to open it read-only. A
study that is not shared MUST answer 404 to anyone but its owner.

#### Scenario: Opening a friend's shared study

- **WHEN** a signed-in user opens a shared study they do not own
- **THEN** they see the board and the moves but cannot edit, and a private one answers 404

### Requirement: A finished game opens as a study

A signed-in user SHALL be able to turn a finished game into a new study they own, with the game's moves as its main
line.

#### Scenario: Analyse after a loss

- **WHEN** a player clicks "Analyse" on their finished game
- **THEN** a new study with the game's moves opens, owned by them
