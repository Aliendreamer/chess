## MODIFIED Requirements

### Requirement: A player can list their own games

`GET /api/me/games` SHALL list every game the signed-in user plays or played, as either colour, newest first,
keyset-paged. Each item MUST show the user's colour, the opponent, the time control, the status and the result.

#### Scenario: Games as both colours

- **WHEN** a user played one game as White and one as Black
- **THEN** both appear, each with the user's colour, and no other user's games appear
