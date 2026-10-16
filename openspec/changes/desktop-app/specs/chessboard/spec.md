## MODIFIED Requirements

### Requirement: Pieces are the Cburnett set, licensed BSD

The board, the promotion picker and every other place that draws a piece SHALL use the Cburnett SVGs
`{wK,wQ,wR,wB,wN,wP,bK,bQ,bR,bB,bN,bP}.svg` kept in `libs/chess-ui/src/pieces/` and bundled by each app as assets. The
files MUST be the Wikimedia Commons copies used under their 3-clause BSD option, and `apps/frontend/ATTRIBUTION.md` MUST
name the author, the source and the licence. No Unicode chess glyph SHALL be used to draw a piece.

#### Scenario: A board shows image pieces

- **WHEN** a game page renders the starting position
- **THEN** each of the 32 pieces is an image of the Cburnett set and the page contains no ♔–♟ glyphs

#### Scenario: The promotion picker

- **WHEN** a white pawn reaches the eighth rank
- **THEN** the picker shows the white queen, rook, bishop and knight images, queen first

### Requirement: The board uses a named theme, Brown by default

The board's light and dark squares SHALL take their colours from a board theme, one of `brown` (#f0d9b5 / #b58863),
`blue` (#dee3e6 / #8ca2ad), `green` (#ffffdd / #86a666), `slate` (#c9cfd6 / #5d6b7a) and `walnut` (#ead6b0 / #9a6a44),
defined as CSS variables in `libs/chess-ui/src/theme.css`. `brown` MUST be the default. Coordinates SHALL sit inside the
edge squares in the opposite square colour.

#### Scenario: Default theme

- **WHEN** a user who never chose a theme opens a game
- **THEN** the light squares are #f0d9b5 and the dark squares #b58863
