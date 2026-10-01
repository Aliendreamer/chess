## ADDED Requirements

### Requirement: Dark is the default site theme and light is optional

The site SHALL have two themes: `dark` (the Club palette, the default) and `light` (Parchment). A theme MUST be
expressed only by redefining the semantic tokens (`surface-*`, `fg-*`, `line-*`, `status-*`) under
`[data-theme=…]`. Components MUST NOT contain theme-specific classes. Both themes MUST meet WCAG AA contrast
(4.5:1) for body text on their page and card surfaces.

#### Scenario: Default

- **WHEN** a user who never chose a site theme opens any page
- **THEN** it renders in the dark Club palette

#### Scenario: Light chosen

- **WHEN** a user chooses Light on `/settings`
- **THEN** every page renders with Parchment surfaces and dark text, starting from the first paint

### Requirement: Each game type has its own colour

The time-control categories SHALL each have a token: bullet, blitz, rapid, classical, correspondence and computer
(untimed engine games). Quick-pairing tiles, history rows, "Your turn" rows and the game page header SHALL show the
game's category colour next to its text label, never instead of it. The colours MUST stay distinguishable in both
themes.

#### Scenario: A blitz tile

- **WHEN** the home page shows the 3+2 tile
- **THEN** the tile carries the blitz colour bar and the label "Blitz"

#### Scenario: An engine game in history

- **WHEN** the history lists an untimed game against Stockfish
- **THEN** its row carries the computer colour

### Requirement: Icons always come with a name

Icons SHALL come from `lucide-react`. Every icon MUST either sit next to visible text (and be `aria-hidden`) or be
the only content of a control that has an `aria-label`.

#### Scenario: The rail

- **WHEN** the rail is shown
- **THEN** Home, History, Studies and Settings each show an icon followed by their text
