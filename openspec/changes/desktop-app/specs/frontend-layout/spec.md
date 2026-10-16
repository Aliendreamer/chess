## MODIFIED Requirements

### Requirement: One import alias

Imports across folders SHALL use the `#/…` alias, and code shared with the desktop app SHALL be imported from
`@chess/core` and `@chess/ui`, never copied into `src/`. The `@/…` alias MUST NOT exist, and deep relative imports
(`../../..`) MUST NOT be used inside `src/`.

#### Scenario: A route imports server code

- **WHEN** `routes/pgn/$id.ts` needs the PGN download handler
- **THEN** it imports `#/lib/server/games`

#### Scenario: A page uses the board

- **WHEN** the game page needs the board
- **THEN** it imports `Board` from `@chess/ui`, not from a file under `src/components/`
