## Context

The club is a distributed system (Keycloak, Postgres primary + replica, Redpanda, Redis, an Akka cluster, the
Stockfish worker, the SSR BFF). Its one-player features — games against the computer, analysis, review, studies, the
trainer and training, the library and the news — need none of that machinery except Stockfish and storage. The owner
wants them as a standalone, offline desktop app (ROADMAP Part 7), decided on 2026-10-16:

- a new app in `apps/`, next to the club, which stays as it is;
- Tauri, reusing the React UI, with the logic in TypeScript and Stockfish as a sidecar;
- SQLite for local data;
- two shared Nx libraries, and the web frontend refactored to use them;
- Windows and Linux; versioned with Nx Release; built locally (Windows on a Windows-side clone, Linux in WSL) and
  published to a GitHub Release by hand — no CI;
- the first release is 1.0.0 with every feature;
- no lichess broadcast games; the news is the club's news part (feeds and the tournaments being played).

Today almost every module of `apps/frontend/src` imports TanStack Router (`Link`, navigation) or the server functions
(`lib/server/api.ts`); only a few (`lib/studies.ts`, `lib/board.ts`, `lib/moveInput.ts`) are free of both. About 3 800
lines of the logic the app needs live only in C# (`Review/GameReviewer`, `Trainer/*`, `Training/*`, `Studies/*`,
`News/*`, `Library/*`, `Analysis/PositionAnalysis`, the engine worker's UCI client).

## Goals / Non-Goals

**Goals:**

- Every one-player feature of the club, offline, for one local player, in 1.0.0.
- One copy of the board, move tree, trainer drill and the other UI both apps show, and of the pure logic both need.
- A release the owner builds and publishes from their own machines with three commands.
- The club's behaviour unchanged by the refactor.

**Non-Goals:**

- Play against people, accounts, sync with the club or between machines.
- macOS, an auto-updater, code signing (Windows SmartScreen will warn on an unsigned installer).
- Lichess broadcast games, the admin screens, observability, the e2e suite for the desktop app.
- Any change to `apps/backend` or `apps/engine`; their C# logic stays and is not generated from the TS.

## Decisions

### D1. Tauri 2 shell, thin Rust

`apps/desktop/src-tauri` holds the Rust crate: `main.rs` registers the plugins and nothing else of ours unless a
plugin cannot do it. Plugins: `sql` (SQLite), `shell` (the Stockfish sidecar), `http` (news), `dialog` + `fs` (PGN
import/export, open/save). Capabilities (`src-tauri/capabilities/default.json`) allow exactly: the `stockfish`
sidecar, HTTP GET to the feed and broadcast-list URLs, the app data directory, and files the player picks in a dialog.
A strict CSP in `tauri.conf.json` (`default-src 'self'`, no remote scripts, images only from `self`/`data:`).

_Alternatives_: Electron (bundles Chromium, ~100 MB more, Node in the app); a .NET host (Avalonia: UI rewrite;
Photino: thin packaging). Chosen by the owner.

### D2. The UI: Vite + React + TanStack Router as an SPA

The desktop app is a client-only Vite app with TanStack Router's file routes (familiar to the club's code) and no
Start, no SSR, no server functions. Routes mirror the club's where the feature is the same: `/` (home: play, recent
games, news), `/games/$id`, `/games`, `/analysis`, `/studies`, `/studies/$id`, `/trainer`, `/trainer/$family`,
`/trainer/study/$id`, `/training`, `/library`, `/news`, `/settings`. The Shell is the club's rail without the club's
items (members, admin, profiles, sign-out). Data comes from a `lib/data/` layer per feature over SQLite and the engine
(D4, D5), exposed to pages as hooks with the same shapes the club's loaders produce, so the shared components see the
same props.

### D3. Two shared libraries

- `libs/chess-core` (`@chess/core`): pure TypeScript, depends on `chess.js` and `@mliebelt/pgn-parser` only, no React,
  no DOM, no Tauri. Holds: move-tree operations and PGN import/export with variations (from `lib/studies.ts`), position
  keys (`lib/analysis.ts#positionKey`), board rules (`lib/board.ts`, `lib/moveInput.ts`), the opening-family grouping
  and kinds, study lines (port of `StudyLines`), the Leitner schedule (port of `TrainerSchedule`), the review (port of
  `GameReviewer`: winning chances, ?!/?/?? marks, book exit), the training judge and the miner's keep rule, the engine
  levels, the library PGN import with its dedupe key, and the feed and broadcast-list parsers (port of `FeedParser`,
  `BroadcastParser`: no DTDs, plain-text titles, https links only).
- `libs/chess-ui` (`@chess/ui`): presentational React (+ `react-chessboard`, `lucide-react`): `Board` and
  `BoardPlaceholder`, the move list and move tree, `EvalGraph`, `ReviewPanel`, `AnalysisBoard`/`AnalysisPanel`, the
  drill and answer boards, `ui.tsx` primitives, `CategoryMark`, the Club tokens (`styles.css` `@theme` + the Parchment
  block), the Cburnett pieces and board themes. Navigation comes from a `LinkContext` (`{ Link, navigate }`) each app
  provides, data and commands from props. Nothing imports a router or a server function.

Both are Nx projects with `lint` (typecheck, ESLint with a `no-restricted-imports` ban, prettier) and `test` (vitest),
and pnpm workspace packages whose `exports` point at their TS source: an app depends on them with `workspace:*` and
compiles them itself (no build step, no path aliases), so a change there is in the next app build. `chess-core`'s
tsconfig has no DOM lib, so a DOM global fails its typecheck. `chess.js` is feedback only in the
club and the rules in the desktop app — the same library, used differently by each app.

_Alternative_: copy the code into `apps/desktop` (fast, but two boards and trainers drifting). Rejected by the owner.

### D4. Storage: SQLite through `tauri-plugin-sql`

One database file in the app data directory (`chess.db`). Migrations are numbered SQL files in
`src-tauri/migrations/`, registered with the plugin and run at start. Tables mirror the club's where the shape is the
same, minus users and ownership: `games` + `moves` (one local player; the engine side and level per game), `studies`
(tree as JSON, `version`), `position_evaluations` (`position_key`, `think_ms`, lines), `reviews`, `trainer_progress`
(line, colour, box, due), `mistake_drills`, `training_positions`, `training_candidates`, `training_progress`,
`library_games`, `library_positions`, `openings`, `news_items`, `chess_events`, `settings`. Ids are UUID v7 strings.
The explorer's counts are SQL over `library_positions`, as in the club. The openings TSVs are embedded in the bundle and
loaded once (a version row in `settings` reloads them when the embedded set changes).

Single writer: all writes go through `lib/data/db.ts`, which serialises them on one connection; WAL mode for reads
during writes.

_Alternatives_: IndexedDB (no SQL for the explorer), a Rust-side ORM (more Rust).

### D5. Stockfish as a sidecar, UCI from TypeScript

`tools/desktop/fetch-stockfish.mjs` downloads the pinned `sf_19` builds for Linux and Windows (URLs and SHA-256 in
`tools/desktop/stockfish.json`, checked like the engine image's `ADD --checksum`) into
`src-tauri/binaries/stockfish-<target-triple>[.exe]` (git-ignored), as Tauri's `externalBin` expects. Its licence
(`Copying.txt`) and a source notice ship as bundle resources.

`lib/engine/` (desktop) ports the worker's UCI client (`apps/engine/Stockfish.cs`): `uci`/`isready` handshake,
`setoption`, `position fen … moves …`, `go movetime`, `info … multipv … score` parsing, `bestmove`. Two processes:

- **play** — the level as `UCI_LimitStrength` + `UCI_Elo` (or Skill Level 20 for Maximum), and the think time the player
  chose for the game: 5, 10 or 20 s a move (owner, 2026-10-16; the last choice is remembered, 5 s at first);
- **analysis** — full strength, MultiPV `Analysis:Lines` (3); serves the board (quick/normal/deep = 1/3/10 s) and, at
  low priority, the review queue (800 ms a position) and the training miner. Board requests pre-empt (`stop`) queued
  background work; answers are stored in `position_evaluations`, a longer think answering a shorter request, as in the
  club.

A crashed process is restarted and its request asked again; the game page shows "engine restarting".

### D6. The game against the computer runs in the app

`lib/data/play.ts` owns a game: chess.js is the rules (legal moves, check/mate, stalemate, threefold, fifty moves,
insufficient material — all on, as the club's adapter turns `All` on), moves are written to SQLite as they are made, a
game in play is resumed after a restart, the engine move is asked whenever it is the engine's turn. Resign ends a game;
untimed games, no clocks, no draw offers (as in the club). On the end, the PGN is built and the review queued (D5),
then its mistakes enter the training pool (`mistake_drills`) once.

### D7. News fetched by the app

`lib/data/news.ts` fetches the club's four feeds (with TWIC's `Accept` header) every `fetchMinutes` (60) and the
lichess broadcast list (names and links of the tournaments being played, not games) every `eventsMinutes` (10), only
while the app runs and the machine is online; a failed round leaves the stored items. Items are kept (title, link,
source, date) and pruned after `keepDays` (90); events are replaced whole per round, a 429 pauses the next round 60 s.
Links open in the system browser (`shell.open`), never inside the app; no article text, no images. Settings can turn
each source off. Fetching goes through `tauri-plugin-http` (no browser CORS), on the capability allow-list.

### D8. Release, versions, scopes

- Nx Release group `desktop`, `conventionalCommits: true`, tag `desktop@{version}`. The version lives in
  `apps/desktop/package.json`; `tauri.conf.json` reads it (`"version": "../package.json"`), and `Cargo.toml`'s version
  is not used for the bundle. The first release is cut as 1.0.0 (`nx release version 1.0.0 --projects desktop`).
- Commits touching `libs/` use scope `libs`; Nx Release counts a library change for the apps that depend on it
  through the project graph: verified (task 1.3, 2026-10-16) — after a tag `desktop@0.0.0`, a lone `fix(libs)` commit to
  `libs/chess-ui` made `nx release version --dry-run --projects desktop` propose 0.0.1. The club frontend depends on the
  libraries too, so the same should hold for it (not probed).
- `nx run desktop:bundle` = fetch Stockfish → `vite build` → `tauri build`; on Linux it makes `.AppImage` and `.deb`,
  on Windows NSIS `.exe` and `.msi`. `tools/desktop/publish.sh <version>` collects the installers of the current
  machine and runs `gh release create desktop@<version>` (or `gh release upload` when the release exists, so the
  second machine adds its files), with the version's section of `apps/desktop/CHANGELOG.md` as notes. Releasing and
  publishing stay the owner's to run.

### D9. Tests

`libs/*` and `apps/desktop` use vitest (jsdom) with the 75 % gate. The ported logic gets the C# tests' cases as TS
tests (same inputs, same answers), so both copies are held to the same behaviour. The UCI client is tested against a
fake engine (as `Chess.Engine.Tests` does), the data layer against an in-memory SQLite (`better-sqlite3` behind the
same `db.ts` interface, test only). The club's vitest and Playwright suites must stay green through the refactor; no
Playwright for the desktop app in 1.0.0 (a manual smoke list in `apps/desktop/README.md` instead).

## Risks / Trade-offs

- [Two copies of the logic, C# and TS, drift] → the TS tests replay the C# tests' cases; a change to a rule changes
  both, and the backend layout spec names the pairs.
- [The refactor breaks the club] → it lands first, in small moves, each with the club's unit tests and the full
  Playwright suite green before the desktop app uses it (Playwright needs the stack: run by the owner).
- [WebKitGTK on Linux renders or performs differently from Chromium/WebView2] → the Linux build is smoke-tested in WSLg
  and on the owner's machine before each release; no Chromium-only CSS.
- [Unsigned Windows installer: SmartScreen warns] → documented in the release notes; signing is a later decision.
- [Stockfish binary needs CPU features] → the `universal`/x86-64 builds are used, not avx2-only.
- [Nx Release does not bump the desktop app for a `libs` change] → verified in task 1; if not, the release group
  includes the libraries' files as inputs.
- [The miner and review keep a CPU busy] → one background process at low priority, paused while the board or a game
  needs the engine, and a setting to turn the miner off.
- [A corrupted database] → SQLite WAL + a backup copy on each start before migrations run.

### D10. Backup and restore

Settings → Backup writes the whole database to one file the player picks (`VACUUM INTO`, so a consistent copy while
the app runs; extension `.chessbackup`). Restore takes such a file, checks it is one of ours (a `settings` row naming
the app and a schema version no newer than this build's), asks for confirmation, keeps the current database as
`chess.db.before-restore`, swaps the file in, runs the migrations and reloads. Restore replaces; it does not merge.

### D11. Licence

The app's code — `apps/desktop` and `libs/` — is MIT (`LICENSE` in each, the owner's choice of 2026-10-16). Stockfish
stays a separate GPLv3 program the app starts as a process, shipped unmodified with its licence and a source link, so
the MIT code and the GPLv3 binary sit side by side in the installer (aggregation) without the app becoming GPL. The
installer's licence page shows the MIT text, and About lists every third-party licence.

## Migration Plan

Nothing to migrate: a new app and a refactor with no behaviour change. Order: shared libraries + club refactor →
desktop shell, storage and engine → features → release tooling → 1.0.0. Rollback of the refactor is a revert; a bad
desktop release is replaced by the next version (old releases stay on GitHub).

## Open Questions

None left. Settled by the owner on 2026-10-16: the think time is the player's choice of 5, 10 or 20 s a move (D5);
backup and restore are in 1.0.0 (D10); the app's code is MIT (D11).
