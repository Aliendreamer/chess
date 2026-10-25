# Chess desktop

The standalone app for one player (OpenSpec change `desktop-app`): play Stockfish, analyse and review games, keep
studies, train openings and positions, keep a library of PGN games, and read the chess news. Everything is stored on the
machine; nothing needs a server. Windows, Linux and macOS.

## Toolchain

- Node ≥ 24 and the workspace's pnpm (`corepack enable`), from the repository root: `pnpm install`.
- Rust stable (`rustup`).
- Linux: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev
libayatana-appindicator3-dev librsvg2-dev pkg-config`. WSL shows the window through WSLg.
- Windows: the Microsoft C++ Build Tools and WebView2 (present on Windows 10/11). Build from a Windows-side clone, never
  over `\\wsl$`.
- macOS: the Xcode Command Line Tools (`xcode-select --install`; the full Xcode is not needed) and both Mac targets
  for Rust: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`. Only a Mac can build for macOS.

## Commands

```bash
pnpm desktop                       # from the root: the window with hot reload (= nx run desktop:dev)
pnpm exec nx run desktop:dev       # fetches Stockfish once, then the window with hot reload
pnpm exec nx run desktop:test      # vitest (data layer, engine client, pages) and the Stockfish fetch test
pnpm exec nx run desktop:lint      # typecheck, eslint, prettier
pnpm exec nx run desktop:build     # the web part only (dist/)
pnpm exec nx run desktop:bundle    # the installers of this machine (AppImage + .deb, or .exe + .msi)
pnpm exec nx run desktop:bundle-macos  # on a Mac: one universal .dmg for Apple Silicon and Intel
```

Stockfish is the pinned official `sf_19` build (`tools/desktop/stockfish.json`, SHA-256 checked) fetched into
`src-tauri/binaries/` (git-ignored) by `tools/desktop/fetch-stockfish.mjs`; its licence (`Copying.txt`) and source
notice (`SOURCE.txt`) ship with the installer.

The library ships with the club's games (`library/library.json.gz`: the World Championships and the 2026-08 lichess
broadcasts, with the positions the club mined for training), loaded once on the first start. To refresh it, start the
local stack's `postgres` and run `node tools/desktop/export-library.mjs`, then commit the file.

## Where things are

- `src/lib/data/` — the SQLite database (`db.ts`, migrations in `migrations/`) and one file per feature: `play`,
  `analysis`, `review`, `studies`, `library`, `bundled` (the shipped library), `trainer`, `training`, `news`,
  `openings`, `settings`.
- `src/lib/engine.ts` — the UCI client, the supervisor that restarts Stockfish, the analysis queue (board first).
- `src/lib/app.ts` — the services the pages use (database, engines, dialogs, links, fetching), created at start.
- `src/routes/` — the pages; the shared board, studies, trainer, review and news components are `@chess/ui`, the rules
  `@chess/core`.
- `src-tauri/` — the Rust shell (plugins only), `tauri.conf.json` (CSP, bundle), `capabilities/default.json` (what the
  window may reach: its database, the sidecar, the news hosts, files the player picks, links in the browser).

## Smoke list (before each release, on both machines)

With the network **off**:

1. Start the app: home opens, News says it has nothing yet (or shows what it kept).
2. Play Casual with 5 s: a move by drag and one by click; the engine answers; resign; the game shows "You lost" and
   its review starts; Save PGN writes a file.
3. Close the app in the middle of a game, start it again: the game is still in play at the same position.
4. Analysis: paste a PGN, step through it; the engine evaluates the position shown; Save as study opens the study.
5. Studies: import a PGN file with a broken game (reported by number); edit a study, Save, Save PGN.
6. Library: import a PGN collection; search a player; open a game on the analysis board, "In the library" shows.
7. Trainer: a family's line, then a study's line; Training: My games (after a review with a mistake).
8. Settings: Parchment and another board theme apply at once and are kept after a restart. About names Stockfish 19.

With the network **on**: News fills within a minute or so of the start; a headline opens in the browser, not the app.

## Release

See `openspec/changes/desktop-app/design.md` D8. In short: `pnpm exec nx release version <version> --projects desktop`
(changelog and tag), `pnpm exec nx run desktop:bundle` on each machine, then `tools/desktop/publish.sh <version>` on
each to put its installers on the GitHub Release `desktop@<version>`. Installers are not signed: Windows SmartScreen
asks once.

## Building on a Mac

For whoever builds the macOS version (design D13):

1. Install Node 24, then `corepack enable`; the Xcode Command Line Tools; Rust (`rustup`) and its two Mac targets
   (above).
2. Clone the repository, check out the release tag (`git checkout desktop@<version>`), and run `pnpm install`.
3. `pnpm exec nx run desktop:dev` to try it, then `pnpm exec nx run desktop:bundle-macos`. The disk image is
   `apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Chess_<version>_universal.dmg`.
4. With push rights, `tools/desktop/publish.sh <version>` adds it to the release; otherwise hand the file to the
   owner, who runs `gh release upload desktop@<version> Chess_<version>_universal.dmg`.

The app is signed ad hoc only (no Apple Developer account), so macOS refuses the first open: open it once, then System
Settings → Privacy & Security → "Open Anyway". It needs macOS 12 or later with current Safari updates.
