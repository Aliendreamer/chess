## MODIFIED Requirements

### Requirement: A finished game can be rematched

`POST /api/games/{id}/rematch` SHALL be allowed only to a player of that game, only once it has ended, and not for a
game against the computer (400). The rematch is an invite whose id is the game's id, reserved for the other player,
with the same time control and the caller taking the colour the opponent had. The first call creates the invite
(the caller is its creator). A call by the reserved guest accepts it and starts the game; any other user is refused as
forbidden. A repeated call by the creator returns the open invite unchanged. The rematch invite SHALL be open for 24
hours, SHALL survive a node failure, and SHALL be a live topic `invite:{id}` whose snapshot and frames carry its status
and, once accepted, the new game's id.

#### Scenario: Both players press Rematch

- **WHEN** White presses Rematch after the game ends and then Black presses Rematch
- **THEN** a new game starts with the previous Black as White, the same time control, and the `invite:{gameId}` frame
  names the new game

#### Scenario: A spectator asks for a rematch

- **WHEN** a user who did not play the game posts to its rematch
- **THEN** the answer is 403 and no invite exists

#### Scenario: Too late

- **WHEN** the guest presses Rematch 25 hours after the offer
- **THEN** the rematch is refused as expired

## REMOVED Requirements

### Requirement: Invite links start a game with the first signed-in user who accepts

**Reason**: Club members pair through the queue; invite links are removed.
**Migration**: Quick pairing; rematch for a second game with the same opponent.

### Requirement: Invites end when accepted, cancelled or after 24 hours

**Reason**: Only rematch invites remain; their lifetime is in the rematch requirement, and they cannot be cancelled.
**Migration**: None.

### Requirement: The creator learns live when the invite is accepted

**Reason**: Folded into the rematch requirement (`invite:{id}`).
**Migration**: None.

### Requirement: An invite can be reserved for one user

**Reason**: Every remaining invite is a rematch, reserved for the opponent; folded into the rematch requirement.
**Migration**: None.
