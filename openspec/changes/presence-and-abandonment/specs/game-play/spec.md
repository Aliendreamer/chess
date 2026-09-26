## ADDED Requirements

### Requirement: A player absent for a minute can lose the game by abandonment

While a game is being played and both first moves have been made, the game SHALL track which players are present
(reported by the BFF, D15). A player MUST count as absent once no BFF instance has reported them present for 75
seconds or the last one reported them gone; the transitions MUST be persisted as `PlayerLeft` and
`PlayerReturned`. After one minute of absence the other player, if present, SHALL be offered the claim
(`claimableBy`) and MAY end the game with `POST /api/games/{id}/claim` as a win (`1-0`/`0-1`) or a draw
(`1/2-1/2`), both with reason `Abandonment`. A claim by anyone else, too early, or after the absent player
returned MUST be 409. After a recovery, an absence MUST be counted from the recovery time.

#### Scenario: Claiming the win after a minute

- **WHEN** Black closes every tab of a game in progress and White stays on the page for 61 seconds
- **THEN** White's view carries `claimableBy` = White, and `POST …/claim {"outcome":"win"}` ends the game `1-0`
  with reason `Abandonment`

#### Scenario: Calling it a draw

- **WHEN** the same happens and White posts `{"outcome":"draw"}`
- **THEN** the game ends `1/2-1/2` with reason `Abandonment`

#### Scenario: The absent player comes back first

- **WHEN** Black returns after 50 seconds
- **THEN** no claim is offered, and after 61 seconds a claim by White is 409

#### Scenario: Too early

- **WHEN** White claims 30 seconds after Black left
- **THEN** the response is 409 and the game goes on

#### Scenario: A crashed BFF stops counting

- **WHEN** the only BFF instance reporting Black present stops refreshing
- **THEN** Black counts as absent 75 seconds after its last report, and the minute starts from then

#### Scenario: Before both first moves

- **WHEN** Black leaves before making their first move
- **THEN** no absence is recorded; the 1-minute abort applies instead
