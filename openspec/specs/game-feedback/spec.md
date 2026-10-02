# game-feedback Specification

## Purpose

How a game tells a player they are needed. It covers the tab title and favicon when it is their move, the
game-over card, an opponent found before the game opens, and a draw offer that stands out.

## Requirements

### Requirement: The tab shows when a player is needed

The tab SHALL signal a needed player. While the signed-in user is a player of the open game, the game is playing,
and it is their move, the document title SHALL be `● Your move · vs {opponent}` and the favicon SHALL be the "turn" icon (with a brass dot). While a draw offer
from the opponent is pending, the title SHALL be `● Draw offered · vs {opponent}`. Otherwise the title SHALL be
`{white} vs {black} · Chess` and the favicon the plain one. Spectators SHALL never see the turn signals.

#### Scenario: The opponent moves while the tab is in the background

- **WHEN** the opponent's move arrives and it becomes my move
- **THEN** the title becomes `● Your move · vs kasparov_fan` and the favicon shows the dot

#### Scenario: After my move

- **WHEN** I move
- **THEN** the title goes back to `{white} vs {black} · Chess` and the plain favicon returns

### Requirement: A game that ends live shows a game-over card

When a game the user is watching changes to `ended` while the page is open, a card SHALL appear over the board with
the result, the reason, and, for players, Rematch, New opponent (only for a preset time control) and Analyse. The card
SHALL be dismissible and SHALL NOT appear when the page is opened on a game that had already ended. The result panel
beside the board SHALL stay as it is today.

#### Scenario: Checkmate on the board

- **WHEN** the opponent mates me
- **THEN** a card over the board reads "0-1 · Checkmate" with Rematch, New opponent and Analyse

#### Scenario: Opening an old game

- **WHEN** I open a game that ended yesterday
- **THEN** no card covers the board

### Requirement: Opponent found is visible before the game opens

When quick pairing finds an opponent, the waiting tile SHALL show "Opponent found" for 600 ms before the game page
opens (immediately when the user prefers reduced motion).

#### Scenario: A pairing in blitz

- **WHEN** the `queue:3+2` frame names my game
- **THEN** the 3+2 tile flashes "Opponent found" and the game opens about 600 ms later

### Requirement: A draw offer stands out

While the opponent's draw offer is pending, the Accept / Decline controls SHALL be emphasised with a gentle pulse,
except under `prefers-reduced-motion`.

#### Scenario: A draw is offered

- **WHEN** the opponent offers a draw
- **THEN** the Accept draw and Decline buttons pulse until I answer or the offer lapses
