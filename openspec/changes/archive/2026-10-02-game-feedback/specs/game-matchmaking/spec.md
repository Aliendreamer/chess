## ADDED Requirements

### Requirement: An invite can be reserved for one user

An invite MAY name the one user who can accept it (`ForId`). For a reserved invite, any other user's accept MUST be
refused as forbidden. An invite without `ForId` SHALL behave as before (the first signed-in user other than the
creator may accept). Invites recorded before this change SHALL read as unreserved.

#### Scenario: A stranger opens a reserved invite

- **WHEN** a user who is not the reserved guest accepts a reserved invite
- **THEN** the answer is 403 and the invite stays open

### Requirement: A finished game can be rematched

`POST /api/games/{id}/rematch` SHALL be allowed only to a player of that game, only once it has ended, and not for a
game against the computer (400). The rematch is an invite whose id is the game's id, reserved for the other player,
with the same time control and the caller taking the colour the opponent had. The first call creates the invite
(the caller is its creator). A call by the reserved guest accepts it and starts the game. A repeated call by the
creator returns the open invite unchanged. The rematch invite SHALL follow the ordinary invite rules otherwise
(cancel by the creator, 24-hour lifetime, live on `invite:{id}`).

#### Scenario: Both players press Rematch

- **WHEN** White presses Rematch after the game ends and then Black presses Rematch
- **THEN** a new game starts with the previous Black as White, the same time control, and the `invite:{gameId}` frame
  names the new game

#### Scenario: A spectator asks for a rematch

- **WHEN** a user who did not play the game posts to its rematch
- **THEN** the answer is 403 and no invite exists

#### Scenario: The game is still on

- **WHEN** a player posts to the rematch of a game that is still playing
- **THEN** the answer is 409
