Every task ends at a commit where `pnpm exec nx run-many -t lint test build` passes. "Test first" names the failing
test written before the code and how it fails. **[human]** marks a gate the owner runs (Docker, a GUI, a Windows
machine, a release), with the command that proves it.

## 1. Workspace

- [x] 1.1 Add `libs/*` to `pnpm-workspace.yaml`, scopes `desktop` and `libs` to commitlint and `openspec/config.yaml`,
      Tauri `target/` and `src-tauri/binaries/` to `.gitignore`. Test first: `echo "feat(libs): x" | pnpm commitlint`
      fails with `scope-enum`.
- [x] 1.2 Create `libs/chess-core` and `libs/chess-ui` as Nx projects (`lint`, `test`, `typecheck`; vitest; TS source,
      no build) as pnpm workspace packages `@chess/core` / `@chess/ui` (apps depend on them with `workspace:*`), and an
      ESLint `no-restricted-imports` rule (core: no react/DOM/router/tauri; ui: no router/tauri/`lib/server`). Test first: a
      fixture file importing `react` in core makes `nx lint chess-core` fail.
- [x] 1.3 Prove Nx Release counts a `libs` change for a dependent app: once 4.1 has made the `desktop` project, run
      `pnpm exec nx release version --dry-run --projects desktop` after a `fix(libs)` commit and expect a patch bump.
      Record the result in `design.md` D8; if there is none, add the libraries to the `desktop` group's inputs.

## 2. Shared core (ports, each with the C# tests' cases)

- [x] 2.1 Move `lib/studies.ts` tree ops + PGN import/export, `lib/board.ts`, `lib/moveInput.ts` and
      `lib/analysis.ts#positionKey` into `@chess/core`; the club imports them from there. Test first: the moved tests,
      run from `libs/chess-core`, fail with "module not found" until the code moves.
- [x] 2.2 Port `TrainerSchedule`, `OpeningFamilies` (with `lib/trainer.ts#openingKind`) and `StudyLines`. Test first:
      `TrainerScheduleTests`/`OpeningFamiliesTests`/`StudyLinesTests` cases as vitest, red on missing exports.
- [x] 2.3 Port `GameReviewer` (winning chances, ?!/?/??, engine move never marked, board ending from the result, book
      exit). Test first: `GameReviewerTests` cases, red.
- [x] 2.4 Port the training judge (master / engine / both / none), the miner's keep rule (`MinGap`, `MinPly`,
      `PerGame`, two legal moves) and `EngineLevel`. Test first: the matching `TrainingServiceTests` /
      `TrainingMinerTests` cases, red.
- [x] 2.5 Port the library PGN import (replay from the start, illegal refused, `DedupeKey`, factual headers only) and
      the openings TSV reader. Test first: `LibraryImportTests` cases, red.
- [x] 2.6 Port `FeedParser` and `BroadcastParser` (no DTDs, plain-text titles, https links only). Test first: the C#
      fixtures (including a DTD feed) as vitest, red.

## 3. Shared UI and the club refactor

- [x] 3.1 Move the Club tokens (`styles.css` `@theme` + Parchment), fonts and Cburnett pieces into `@chess/ui`; the
      club imports the stylesheet from there. Test first: `styles.test.ts` (AA contrast) moved to the library, red until
      the file moves.
- [x] 3.2 Add `LinkContext` and move `components/ui.tsx` primitives, `Board`/`BoardPlaceholder`, move list/tree and
      `CategoryMark` into `@chess/ui`; the club provides its `Link`. Test first: the moved component tests render with a
      test `LinkContext` and fail on missing exports.
- [x] 3.3 Move `EvalGraph`, `ReviewPanel`, `AnalysisBoard`/`AnalysisPanel`, the drill board (`useDrill`'s view) and the
      training answer board, taking data and commands as props. Test first: the moved tests, red.
- [ ] 3.4 Club regression gate. **[human]** `tools/e2e.sh` (Docker) passes unchanged; `nx run-many -t test` and the
      frontend coverage gate (75 %) pass.

## 4. Desktop shell, storage and engine

- [ ] 4.1 Scaffold `apps/desktop` (Vite + React + TanStack Router SPA, Tauri 2 `src-tauri/`, plugins sql/shell/http/
      dialog/fs, capabilities allow-list, CSP) as an Nx project (`dev`, `build`, `bundle`, `lint`, `test`), exact pins.
      Test first: a vitest that renders the root route with the Shell, red until the app exists. **[human]**
      `pnpm exec nx run desktop:dev` opens the window in WSLg.
- [x] 4.2 `tools/desktop/stockfish.json` + `fetch-stockfish.mjs` (pinned `sf_19` Linux and Windows builds, SHA-256
      checked, into `src-tauri/binaries/stockfish-<triple>`), licence and source notice as bundle resources. Test first:
      the script run with a wrong hash in a fixture exits non-zero and leaves no binary.
- [x] 4.3 `lib/data/db.ts`: migrations in `src/lib/data/migrations/` (all tables of design D4), one serialised writer,
      WAL, a backup copy before migrating; a `node:sqlite` adapter for tests. Test first: a migration test on an
      empty database expects every table, red.
- [x] 4.4 Load the embedded openings once (version row reloads a changed set). Test first: a second start loads
      nothing; a changed version reloads, red.
- [x] 4.5 `lib/engine/`: UCI client ported from `apps/engine/Stockfish.cs` (handshake, options, `go movetime`,
      `info`/MultiPV parsing, `bestmove`), the play and analysis processes, pre-emption of background work, restart on
      exit. Test first: the client against a fake engine script (as `Chess.Engine.Tests`), red; a fake that exits
      mid-search is restarted and asked again.

## 5. Features

- [x] 5.1 Play the computer: new game (level, colour, think time 5/10/20 s, the last choice remembered), chess.js rules
      with every draw rule, moves persisted, resume after restart, resign, PGN, the game list, home's play tile and
      recent games. Test first: a data-layer test playing fool's mate against a fake engine ends 0-1 by checkmate and
      lists the game, red.
- [x] 5.2 Evaluations: `position_evaluations` cache (a longer think answers a shorter one), the analysis board
      (`?fen=`, `?game=`, pasted FEN/PGN), auto-evaluate after 300 ms, scores in the tree, opening name, library games
      at the position. Test first: a stored deep evaluation answers a normal request without asking the engine, red.
- [ ] 5.3 Review: queue on game end (≥ 2 plies, not aborted) at 800 ms a position at low priority, `GameReviewer` on
      read, `ReviewPanel` and move marks on the finished game page; mistakes into `mistake_drills` once. Test first: a
      finished game with a scripted blunder yields one drill for the player and none for the engine, red.
- [ ] 5.4 Studies: list, create, edit with variations and comments, `version` check, PGN import (broken game reported
      by number) and export, from a game. Test first: importing a five-game file with a broken third makes four studies
      and reports game 3, red.
- [ ] 5.5 Library and explorer: PGN import into `library_games` + `library_positions`, duplicates skipped, search by
      player/event/year, explorer counts in SQL. Test first: importing a file twice adds nothing the second time; the
      explorer at the start position counts each game once, red.
- [ ] 5.6 Opening trainer and study lines: families by kind, a family's lines, drill, Leitner progress, study lines of
      the player's studies (lines dropped when the tree loses them). Test first: a clean drill of a box-2 line stores
      box 3 due in 7 days, red.
- [ ] 5.7 Training: the miner over library positions (candidates, keep rule, paused while the engine is busy for the
      board or a game, a setting to turn it off), sessions in My games / Master games with filters, sets of 10 or
      endless, the judge and Leitner scheduling. Test first: a candidate with gap 0.05 is dropped and never asked again;
      one with 0.4 is kept with the master's move, red.
- [ ] 5.8 News: the four feeds and the tournament list on their intervals while online, stored with `keepDays`
      pruning, events replaced whole, 429 pause, sources switchable, links opened in the system browser, home's News and
      Events and `/news`. Test first: a failing source leaves its stored items and the others are fetched, red.
- [ ] 5.9 Settings and About: site theme, board theme, animation, coordinates (applied at once, kept); About with the
      version and the credits (Stockfish GPLv3 + source, Cburnett BSD-3, openings CC0). Test first: picking Parchment
      sets `data-theme='light'` and survives a reload of settings, red.
- [ ] 5.10 Offline check: no request leaves the app except to the news hosts (the capability allow-list and CSP), and
      every page works with the network off. Test first: a test over the capability file fails on any host outside the
      news list. **[human]** the smoke list in `apps/desktop/README.md` with the network off in WSLg.
- [ ] 5.11 Backup and restore: Settings → Backup (`VACUUM INTO` to a picked file), Restore (check the app marker and
      schema version, confirm, keep `chess.db.before-restore`, swap, migrate, reload). Test first: restoring a file from
      a newer schema version is refused and the database is unchanged, red.

## 6. Release

- [ ] 6.1 MIT `LICENSE` in `apps/desktop` and `libs/*` (and the installer's licence page); Nx Release group `desktop`
      (version in `apps/desktop/package.json`, `tauri.conf.json` reads it, `CHANGELOG.md`), `bundle` target (fetch
      Stockfish → `vite build` → `tauri build`). **[human]** `pnpm exec nx run desktop:bundle` in WSL makes the AppImage
      and .deb; on the Windows-side clone it makes the .exe and .msi.
- [ ] 6.2 `tools/desktop/publish.sh <version>`: `gh release create desktop@<version>` with the changelog section as
      notes, or `gh release upload` when it exists; installers of the current machine only. Test first: a dry-run mode
      prints the `gh` commands for an existing and a new release, checked by a shell test.
- [ ] 6.3 CLAUDE.md, ROADMAP Part 7 and the project memory updated; `apps/desktop/README.md` (toolchain: Rust,
      WebKitGTK 4.1 on Linux, WebView2 on Windows; smoke list; how to release).
- [ ] 6.4 **[human]** First release: `pnpm exec nx release version 1.0.0 --projects desktop`, changelog, tag; bundle
      on both machines; `tools/desktop/publish.sh 1.0.0` on each. Proof: `gh release view desktop@1.0.0` lists four
      installers.
