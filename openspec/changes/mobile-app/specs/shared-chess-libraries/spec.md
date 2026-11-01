## ADDED Requirements

### Requirement: The local data layer lives in `@chess/local`

`libs/chess-local` SHALL hold the offline apps' storage and engine code: the database with its migrations, play,
analysis, review, studies, trainer, training, library, bundled library, openings, news, settings, backup, the UCI
client and the engine scheduler. It SHALL reach the platform only through interfaces the app provides (`Sql`,
`UciChannel`, `FetchText`, `LocalAssets`), and MUST NOT depend on React, the DOM, Tauri, React Native, Expo or a
bundler-only import.

#### Scenario: A forbidden import

- **WHEN** a file in `libs/chess-local` imports `@tauri-apps/plugin-sql`, `expo-sqlite` or a `?raw` module
- **THEN** the library's lint fails

#### Scenario: Desktop on the shared layer

- **WHEN** the desktop app's data code has moved to `@chess/local`
- **THEN** the desktop app's tests and its smoke list pass unchanged

### Requirement: View state lives in `@chess/view`

`libs/chess-view` SHALL hold the React hooks that turn the data layer's shapes into screen state, used by both
`@chess/ui` and the mobile app. It MUST NOT use DOM globals, `react-dom` or a router; what it needs from the platform
(keys, visibility) SHALL be passed in. The shapes themselves SHALL live in `@chess/core`.

#### Scenario: A DOM global in a hook

- **WHEN** a hook in `libs/chess-view` reads `window` or `document`
- **THEN** the library's typecheck or lint fails

### Requirement: The club and desktop are unchanged by the split

Moving hooks, shapes and the data layer SHALL NOT change what a club member or a desktop player sees or can do. The
frontend's and desktop's unit tests, and the club's Playwright suite, MUST pass before and after.

#### Scenario: After the split

- **WHEN** the hooks have moved from `@chess/ui` to `@chess/view`
- **THEN** the club's Playwright suite and the desktop's tests pass unchanged
