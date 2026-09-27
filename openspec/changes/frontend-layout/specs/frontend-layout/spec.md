## ADDED Requirements

### Requirement: No tiny files; code grouped by feature

Frontend source files SHALL NOT be tiny single-purpose files. Small related components MUST share one file
(`components/ui.tsx` for the design primitives, `components/games.tsx` for the board, clocks, move list and game
lists), and client-safe types MUST live with the helpers that use them. Code SHALL be grouped by feature. A folder MUST
hold a real group, never a single file. `routes/` is exempt: TanStack Router needs one file per route.

#### Scenario: A new small component

- **WHEN** a 30-line `Tooltip` primitive is needed
- **THEN** it goes into `components/ui.tsx`, not a new `components/core/Tooltip.tsx`

#### Scenario: A test helper

- **WHEN** a vitest fake is shared by two test files
- **THEN** it goes into `src/testing.ts`, not a new one-file folder

### Requirement: Server code by feature, shared plumbing once

`lib/server/` SHALL hold one file per feature (`auth.ts`, `games.ts`, `play.ts`, `pings.ts`, `live-relay.ts`,
`live-hub.ts`), plus `api.ts` (the server functions and their input validation), `cookies.ts` (the cookie contract)
and `upstream.ts` (environment config and the helpers every read and command uses). A helper used by more than one
feature, such as the login redirect, the GUID check or the problem-details message, MUST be defined once in
`upstream.ts` and never copied.

#### Scenario: A new game command

- **WHEN** a `takeback` command is added
- **THEN** its API call goes into `lib/server/games.ts` using `postCommand` from `upstream.ts`, and its server function
  goes into `api.ts`

### Requirement: Nothing under lib/server reaches the browser

Types and helpers that client components need (for example `Me`, `GameView`, `PingState`, live frames) SHALL live
outside `lib/server/`. Components and client code MUST NOT import from `lib/server/`, except through the server
functions in `lib/server/api.ts`.

#### Scenario: The layout shows who is signed in

- **WHEN** `components/layout.tsx` needs the `Me` type
- **THEN** it imports it from `lib/auth.ts`, not from a file under `lib/server/`

### Requirement: One import alias

Imports across folders SHALL use the `#/…` alias. The `@/…` alias MUST NOT exist, and deep relative imports
(`../../..`) MUST NOT be used inside `src/`.

#### Scenario: A route imports server code

- **WHEN** `routes/pgn/$id.ts` needs the PGN download handler
- **THEN** it imports `#/lib/server/games`
