## REMOVED Requirements

### Requirement: No abandonment or draw offers in engine games

**Reason**: The owner decided on 2026-10-05 that a person who leaves a game against the computer loses it after a
minute; games left open for ever filled the lobby, Club TV and `/watch`.
**Migration**: Replaced by "A person away from an engine game for a minute loses it" and "Draw offers are refused in
engine games" below. Nothing to migrate in data: games already stuck end through the sweep requirement.

## ADDED Requirements

### Requirement: A person away from an engine game for a minute loses it

In an engine game, the person's presence SHALL be tracked once they have made a move, whether or not the BFF has
reported on the game yet; the engine MUST count as always present. When the person has been away for
`Akka:AbandonAfterSeconds` (60 s), the game MUST end at once with the engine's side winning and reason `Abandonment`;
no claim is offered to anyone. Returning before then MUST leave the game going. Before the person's first move only the
first-move abort applies. Correspondence games and games between people MUST be unaffected.

#### Scenario: The person closes the tab mid-game

- **WHEN** the person playing White has made moves and closes their only game page, and does not come back for a minute
- **THEN** the game ends `0-1` with reason `Abandonment`, and the lobby no longer counts it in play

#### Scenario: The person comes back in time

- **WHEN** the person closes the game page and reopens it 40 s later
- **THEN** the game is still being played and nothing has ended it

#### Scenario: The person never moved

- **WHEN** the person is to make the first move and leaves the page
- **THEN** the first-move abort ends the game with no result after its minute, as before, and no abandonment is
  persisted

#### Scenario: No claim in an engine game

- **WHEN** the person is away in an engine game
- **THEN** the live view never names anyone who may claim abandonment, and a `claim` request is refused with 409

### Requirement: Draw offers are refused in engine games

Draw offers in an engine game MUST be refused with 409, and the UI MUST NOT offer them. Resign and abort work as in any
game.

#### Scenario: Offering a draw to the engine

- **WHEN** the human posts a draw offer in an engine game
- **THEN** it is refused with 409 and nothing is persisted

### Requirement: Quiet engine games are woken and judged

The deadline sweep SHALL also ask every untimed game in play whose read row has not changed for
`Akka:UntimedIdleMinutes` to check itself, at most `MaxPerSweep` games per sweep after the correspondence deadlines.
A woken game with nobody present MUST end by the abandonment rule above (or the first-move abort when the person never
moved); a woken game whose person is present MUST continue unchanged.

#### Scenario: A game left in play before this change

- **WHEN** an engine game has been `playing` in `rm_games` for hours with no actor alive and nobody on its page
- **THEN** within a sweep plus one lease and one minute it ends with the engine winning by `Abandonment`

#### Scenario: A node went down under an engine game

- **WHEN** the node holding an engine game stops while the person had already left, and the game is quiet for
  `Akka:UntimedIdleMinutes`
- **THEN** the sweep wakes it on a surviving node and it ends by abandonment

#### Scenario: A person thinking for a long time

- **WHEN** the person keeps the game page open without moving for longer than `Akka:UntimedIdleMinutes`
- **THEN** the sweep's check changes nothing and the game is still theirs to play
