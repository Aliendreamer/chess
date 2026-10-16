## Why

The club needs its whole server stack running to play the computer, train or analyse a game, and some of that is
one-player work that needs nobody else. The owner wants a standalone, offline desktop app for exactly that part:
learning, analysis, games against Stockfish and the chess news, installed from a GitHub Release, with no server of
ours behind it. This is ROADMAP Part 7, the "everything standalone" option reduced to one player.

## What Changes

For a player:

- A desktop app for **Windows and Linux**, installed from a versioned GitHub Release (`desktop@1.0.0` first), that
  works with no account, no login and no server. One local player; everything is stored on the machine.
- **Play the computer**: the five levels (Casual … Maximum), untimed, resign and a new game, PGN of every game, the
  game list.
- **Analyse**: the analysis board on any FEN/PGN or a finished game, local Stockfish evaluating the position shown
  (MultiPV lines, scores in the move tree), the opening name and "In the library" per position.
- **Review**: every finished game is reviewed automatically (mistakes, evaluation graph, book exit, better lines).
- **Studies**: create, edit with variations, import and export PGN, start from a game.
- **Learn**: the opening trainer (families, Leitner schedule), study lines from the player's own studies, and
  training sessions from their own mistakes and from critical moments of the games in their library.
- **Library**: the player imports PGN collections; search, the explorer (next moves with W/D/B) and the openings
  list (lichess `chess-openings`, embedded).
- **News**: the club's feeds (FIDE, ChessBase, Lichess blog, TWIC) and the tournaments being played, fetched by the
  app itself whenever the machine is online, kept locally so a missed tournament or article is still there later.
- **Settings**: site theme (Club dark / Parchment light), board theme, animation, coordinates.

In the code:

- Two new Nx libraries shared by the web club and the desktop app: `libs/chess-core` (pure TypeScript: tree
  operations, PGN, position keys, review, Leitner scheduling, drill rules, feed parsing) and `libs/chess-ui`
  (presentational React: board, move tree, evaluation graph, drill and answer boards, Club tokens and themes, pieces).
  They take data and navigation through props and context, never from a router or a server function.
- `apps/frontend` is refactored to use them, with no change for a club member (**no behaviour change; layout rules
  extended**).
- A new app `apps/desktop`: Tauri 2 shell, React + TanStack Router as a plain SPA (no Start, no SSR), SQLite through
  `tauri-plugin-sql`, Stockfish 19 as a sidecar spoken to over UCI from TypeScript, news fetched through
  `tauri-plugin-http` on an allow-list.
- Logic that lives only in the backend today is ported to TypeScript in `libs/chess-core` (`GameReviewer`,
  `TrainerSchedule`, `OpeningFamilies`, `StudyLines`, the training judge and miner rules, `FeedParser`, the broadcast
  list parser, the library PGN import and dedupe, the engine levels). The backend keeps its C# copies.
- Release: an Nx Release group `desktop` (version in `apps/desktop/package.json`, read by `tauri.conf.json`), a local
  `bundle` target (`tauri build`) and a `publish` script that uploads the installers with `gh release create`. Windows
  is built on the owner's Windows-side clone, Linux in WSL. **No CI** — nothing runs in a pipeline.
- Commit scopes gain `desktop` and `libs`.

Out of scope: play against people (matchmaking, rematches, challenges, members, presence), accounts and login,
lichess broadcast games in the library, sync between machines or with the club, macOS, an auto-updater, code signing,
the admin screens, observability, and any change to the backend or the engine worker.

## Capabilities

### New Capabilities

- `desktop-app`: the standalone app for one player — local data, the bundled Stockfish, play against the computer,
  analysis, review, studies, the trainer and training, the library, news and settings, all offline.
- `desktop-release`: how the app is versioned, built locally for Windows and Linux and published to GitHub Releases,
  with the licences it ships.
- `shared-chess-libraries`: the two libraries both apps use, what belongs in each, and what they may not depend on.

### Modified Capabilities

- `frontend-layout`: imports may also use the two shared libraries (`@chess/core`, `@chess/ui`); code both apps need
  lives there, not in `apps/frontend/src`.
- `chessboard`: the pieces and board themes live in `@chess/ui` (pieces bundled as assets, not served from
  `/pieces/cburnett/`).

## Impact

- New: `apps/desktop/` (Vite + React + TanStack Router, `src-tauri/` with Rust shell and capabilities), `libs/chess-core/`,
  `libs/chess-ui/`, `tools/desktop/` (Stockfish fetch, publish script).
- Changed: `apps/frontend/src` (components and pure helpers move to the libraries; imports change), `pnpm-workspace.yaml`
  (`libs/*`), `nx.json` (release group `desktop`), `commitlint.config.*` and `openspec/config.yaml` (scopes),
  `.gitignore` (Tauri `target/`, sidecar binaries), CLAUDE.md.
- New dependencies (exact pins): `@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-sql`, `-shell`, `-http`,
  `-dialog`, `-fs`; Rust crates `tauri`, `tauri-plugin-*`. Toolchain: Rust stable, Linux WebKitGTK 4.1 dev packages,
  WebView2 on Windows; `gh` for publishing.
- Settles ROADMAP Part 7 (standalone, one player; Tauri) and its open question on packaging a desktop app. Depends on
  D6's rules only through chess.js on the TS side (Gera.Chess stays the backend's).
- Stockfish is GPLv3: the installers carry its licence and source notice, as the engine image does.
