# analysis-board Specification

## Purpose

An analysis board open to every member: any position or finished game with the study tree and the engine, nothing
saved until Save as study, and a link to share a position.

## Requirements

### Requirement: Any position can be analysed without creating anything

The site SHALL offer an analysis page to every signed-in member with a board, a move tree with variations, the engine
panel (think time, best lines, a line played into the tree on click) and keyboard navigation (← → Home End, `f` to
flip). Nothing SHALL be stored by moving or analysing on it.

#### Scenario: Analyse from the start

- **WHEN** a member opens the analysis page and plays 1.e4 e5
- **THEN** the tree shows the two moves, the engine can be asked about the current position, and no study exists

#### Scenario: A variation

- **WHEN** the member goes back one move and plays 1…c5 instead
- **THEN** the tree keeps 1…e5 and shows 1…c5 as a variation

### Requirement: Analysis starts from a FEN, a PGN or a game

The analysis page SHALL start from the standard position, from a FEN given in the link or pasted, from a pasted PGN
(choosing one game when it has several), or from any finished game, opened with its moves; a game still being played SHALL NOT be opened this way. An invalid FEN or
PGN SHALL be reported and SHALL NOT replace the current analysis.

#### Scenario: A FEN in the link

- **WHEN** a member opens `/analysis?fen=` with a legal position
- **THEN** the board shows that position with an empty tree

#### Scenario: A broken FEN

- **WHEN** a member pastes text that is not a legal FEN
- **THEN** an error says so and the board keeps its current position

#### Scenario: A game still being played

- **WHEN** a member opens the analysis page for a game that has not ended
- **THEN** an error says it can be analysed once it ends, and the board starts from the standard position

#### Scenario: From a finished game

- **WHEN** a member presses Analyse on a finished game's page
- **THEN** the analysis page opens with that game's moves as the main line, at its last position

### Requirement: Analysis can be kept as a study

The analysis page SHALL offer Save as study, creating one study from the current tree and start position and opening
it; and Copy link, giving a link to the current position.

#### Scenario: Save

- **WHEN** a member with a two-move tree presses Save as study
- **THEN** a study with those two moves exists, owned by the member, and its page opens
