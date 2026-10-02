## MODIFIED Requirements

### Requirement: A finished game opens as a study

A signed-in user SHALL be able to turn a finished game into a new study they own, with the game's moves as its main
line. "Analyse" on a finished game SHALL open the analysis board with the game's moves; Save as study there creates
the study, so looking at a game no longer leaves a study behind.

#### Scenario: Analyse after a loss

- **WHEN** a player clicks "Analyse" on their finished game and then Save as study
- **THEN** a new study with the game's moves opens, owned by them

#### Scenario: Only looking

- **WHEN** a player clicks "Analyse" on a finished game and leaves the analysis board without saving
- **THEN** no study was created
