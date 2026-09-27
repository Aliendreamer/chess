## MODIFIED Requirements

### Requirement: A player can list their own games

`GET /api/me/games` SHALL list every game the signed-in user plays or played, as either colour, newest first,
keyset-paged. Each item MUST show the user's colour, the opponent, the time control, the status and the result. With
`turn=mine` the list MUST hold only the games being played where it is the user's move, and each such item MUST show
the correspondence deadline when the game has one.

#### Scenario: Games as both colours

- **WHEN** a user played one game as White and one as Black
- **THEN** both appear, each with the user's colour, and no other user's games appear

#### Scenario: Only the games waiting for me

- **WHEN** a user has one game where it is their move and one where it is the opponent's, and asks with `turn=mine`
- **THEN** only the first appears, with its deadline if it is a correspondence game
