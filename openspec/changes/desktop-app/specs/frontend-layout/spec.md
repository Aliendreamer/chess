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

### Requirement: No tiny files; code grouped by feature

Frontend source files SHALL NOT be tiny single-purpose files. Small related components MUST share one file (the design
primitives in `@chess/ui`'s `ui.tsx`, the board in its `board.tsx`, the move list and game-type marks in its
`game.tsx`, the club's own game components in `components/games.tsx`), and client-safe types MUST live with the
helpers that use them. Code SHALL be grouped by feature. A folder MUST hold a real group, never a single file.
`routes/` is exempt: TanStack Router needs one file per route.

#### Scenario: A new small component

- **WHEN** a 30-line `Tooltip` primitive is needed
- **THEN** it goes into `libs/chess-ui/src/ui.tsx`, not a new `components/core/Tooltip.tsx`

#### Scenario: A test helper

- **WHEN** a vitest fake is shared by two test files
- **THEN** it goes into `src/testing.ts`, not a new one-file folder

### Requirement: Shared page plumbing is defined once

A page SHALL run its commands through `useCommand()` (`@chess/ui`: `busy`, `error`, `run`), show refusals with
`<ErrorText>`, name its live connection with `liveStatusText()` (`lib/live.ts`), and hand `useLiveTopic` its loader
state as `initial: { seq, payload }`. A page MUST NOT re-implement the busy/error state, the error line, the status
text or the initial frame.

#### Scenario: A new command button

- **WHEN** a page adds a "takeback" button
- **THEN** it calls `run(() => postGameCommand(...))` from the page's `useCommand()` and shows `error` with
  `<ErrorText>`, with no `useState` for busy or error of its own
