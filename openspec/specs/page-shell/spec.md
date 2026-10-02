# page-shell Specification

## Purpose

What every page shares: its own tab title, the pending, error and not-found screens inside the shell, list loading
and empty states, navigation highlighting and the shell's accessibility details.

## Requirements

### Requirement: Every page names itself in the tab

Each page SHALL set a tab title of the form "<page> · Chess": Home, History, Studies, a study's title, Settings, a
game as "<white> vs <black>", an invite, Watch, a player's name, Admin.

#### Scenario: History

- **WHEN** a player opens History
- **THEN** the tab is titled "History · Chess"

### Requirement: Loading, failure and unknown pages use the shell

A navigation that takes longer than 300 ms SHALL show a progress bar; a page whose data fails to load SHALL show an
error panel with "Try again" and a link home; an unknown address SHALL show a not-found panel with a link home — all
inside the normal shell.

#### Scenario: Unknown address

- **WHEN** a signed-in player opens `/nowhere`
- **THEN** a not-found panel with a Home link is shown, with the navigation still there

### Requirement: Paged lists show their state

Every "Load more" (History, Watch, a profile's games, the admin list) SHALL say "Loading…" while it loads and SHALL show an error line, keeping the items already shown, when a
page fails.

#### Scenario: A page fails

- **WHEN** the next page of History fails to load
- **THEN** the games already listed stay and an error line says the page could not be loaded

### Requirement: Home leads on from recent games

Home's "Recent games" SHALL link to History, and with no games it SHALL say so and point at Quick pairing.

#### Scenario: No games yet

- **WHEN** a new player opens home
- **THEN** "Recent games" says there are none yet and suggests a quick pairing

### Requirement: Names and labels fit and read consistently

Engine level names SHALL fit their tiles at every width; a study with an unknown result SHALL NOT show `*`; the end
reason SHALL be capitalised the same way in the result panel and the game-over card; the PGN file picker SHALL be a
styled control with a visible label.

#### Scenario: Maximum fits

- **WHEN** home is shown at 1366 px
- **THEN** the "Maximum" tile shows the whole word inside its border

### Requirement: Navigation shows where you are

The navigation SHALL highlight a section on its sub-pages (a study highlights Studies) except Home and History, which
highlight only on themselves.

#### Scenario: On a study

- **WHEN** a player opens a study
- **THEN** Studies is highlighted in the navigation

### Requirement: The shell is accessible

Errors SHALL be announced as alerts, the board placeholder SHALL be a named group, the mobile menu SHALL close with
Escape, and the avatar SHALL use site colours, not the board theme's.

#### Scenario: Escape closes the menu

- **WHEN** the phone menu is open and the player presses Escape
- **THEN** the menu closes
