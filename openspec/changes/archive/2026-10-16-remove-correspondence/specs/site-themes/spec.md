## MODIFIED Requirements

### Requirement: Each game type has its own colour

The time-control categories SHALL each have a token: bullet, blitz, rapid, classical and computer (untimed engine
games). Quick-pairing tiles, history rows and the game page header SHALL show the game's category colour next to its
text label, never instead of it. The colours MUST stay distinguishable in both themes.

#### Scenario: A blitz tile

- **WHEN** the home page shows the 3+2 tile
- **THEN** the tile carries the blitz colour bar and the label "Blitz"

#### Scenario: An engine game in history

- **WHEN** the history lists an untimed game against Stockfish
- **THEN** its row carries the computer colour
