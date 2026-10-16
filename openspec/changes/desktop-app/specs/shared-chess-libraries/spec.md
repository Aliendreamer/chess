## ADDED Requirements

### Requirement: Pure chess logic lives in `@chess/core`

`libs/chess-core` SHALL hold the TypeScript logic both apps need — move-tree operations, PGN import and export, position
keys, board and move-input rules, opening families, study lines, the Leitner schedule, the review, the training judge,
the engine levels, the library import and the feed parsers — and MUST NOT depend on React, the DOM, a router, Tauri or
a server function. Logic ported from the backend SHALL be tested with the backend tests' cases.

#### Scenario: The schedule matches the club

- **WHEN** a line in box 2 is trained without a mistake in `@chess/core`
- **THEN** it moves to box 3, due in 7 days, as `TrainerSchedule` answers in the backend

#### Scenario: A forbidden import

- **WHEN** a file in `libs/chess-core` imports `react` or `@tauri-apps/api`
- **THEN** the library's lint fails

### Requirement: Shared UI lives in `@chess/ui`

`libs/chess-ui` SHALL hold the presentational React both apps show — the board, move list and tree, evaluation graph,
review and analysis panels, drill and answer boards, design primitives, the Club tokens and themes, and the pieces. It
MUST take data and commands through props and navigation through a context each app provides, and MUST NOT import a
router, a server function or Tauri.

#### Scenario: A link in a shared component

- **WHEN** the move list links a library game
- **THEN** it renders the app's `Link` from the context, a TanStack Start link in the club and the SPA's link on the
  desktop

### Requirement: The club is unchanged by the move

Moving code into the libraries SHALL NOT change what a club member sees or can do; the frontend's unit tests and the
Playwright suite MUST pass before and after.

#### Scenario: After the refactor

- **WHEN** the board, studies and trainer have moved to the libraries
- **THEN** the club's Playwright suite passes unchanged
