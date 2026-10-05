## 1. Explorer counts in SQL (before any new data)

- [x] 1.1 Migration `./build_migration.sh "LibraryPositionNextMove"`: - `library_positions` gains `next_uci` (null), `result` and `source`, plus ply-0 rows. - The covering index `(position_key) include (next_uci, result, source, game_id, ply)`. - Backfill SQL from `library_games.moves_uci`.

      `LibraryImport.Prepare` writes ply 0 and the new columns. Failing unit test first: a 3-ply game yields 4
      positions, ply 0 with `next_uci` = move 1, the last one with null; today it yields 3 with no next move.

- [x] 1.2 The explorer endpoint counts with a first-visit (`NOT EXISTS` an earlier ply) + `group by next_uci` LINQ query
      (unit-tested in memory; the SQL runs in the existing `LibraryFlowTests`), and the games list
      is limited to 50 in SQL. The start-position special case is removed.
      🐳 Integration test (`nx integration-test backend`), red against the old in-memory code only through its new
      assertion: three games after 1.e4 give e7e5 2 (1/1/0) and c7c5 1 (0/0/1); the start position lists every first
      move; a repetition counts once. Commit: `perf(backend): the explorer counts in the database`.

## 2. Reading broadcast files

- [x] 2.1 Add `ZstdSharp.Port` (exact pin) and a decoding stream that steps over skippable frames. Failing unit test:
      a multi-frame file built in the test (pzstd's layout: skippable frame + zstd frame, twice) decodes to the whole
      text. ZstdSharp steps over skippable frames itself; checked on 2021-06 (6,629 games, as lichess counts).
- [x] 2.2 `Library/Pgn` reader (pure, one game at a time from a `TextReader`). Failing tests: - headers parsed; - `{ [%eval 0.19] [%clk 1:28:26] }`, `;` comments, `(…)` variations and `$1` NAGs skipped; - SAN turned to UCI through `ChessRules.TryApplySan`; - an illegal SAN refuses that game with its index and the next game still reads.
- [x] 2.3 `BroadcastFilter` + `LibraryBroadcastsOptions` (`AddSettings`, defaults in `Config/appsettings.json`,
      `SettingsTests` green). Failing table tests: - Elo 2450/2310 → out; Elo missing → out; - `3+2` → out; `90+30`, `90min/40moves + 30min + 30sec/move`, `1:30:30`, `5400+30` and no time control → in;
      `600` (seconds) → in; `5+0` → out; - Chess960, `FEN`, `*` → out.
- [x] 2.4 `LibraryImport.Prepare` takes `maxPositionPly`. Failing test: a 90-ply game capped at 40 keeps 41 positions
      and all 90 moves. Broadcast headers map as in the design: Event = BroadcastName, SourceRef = GameURL, WC false.
      Commit: `feat(backend): read lichess broadcast files`.

## 3. The month import

- [x] 3.1 `library_import_runs` (migration) and the `library-importer` cluster singleton (`ActorTracing` envelope, span
      and persist rules as for every actor; it persists nothing).
      Failing TestKit test with a fake fetcher: a run streams games in batches through `ILibraryService`, saves counts
      per batch, ends finished; a second start while running is refused; a fetch failure ends failed with the status.
- [x] 3.2 `WebApi/Admin/ImportBroadcasts/`: POST start (month validator: format, published range → 400; running → 409;
      `Roles(Admin)`) and GET runs. The URL is built from the month only. Commit:
      `feat(backend): import a month of lichess broadcasts`.
- [ ] 3.3 🐳 Integration test (`BroadcastImportFlowTests`, written; human-run): a synthetic month served in-process in place of lichess → the kept games are imported with
      source, licence and URL; a second run is all duplicates; a non-admin gets 403; "2019-13" gets 400.

## 4. Sources in the reads

- [x] 4.1 `source=all|wc|broadcasts` on `GET /api/library/positions` and `/api/library/games` (validator; unknown → 400) and the FusionCache entry per `(key, source)` (`Library:ExplorerCacheMinutes`).
      🐳 Integration test: one World Championship game and two broadcast games after 1.e4 → broadcasts counts 2, wc 1,
      all 3. Commit: `feat(backend): the explorer by source`.

## 5. Frontend

- [x] 5.1 `lib/library.ts`: the source type and its query param, the attribution lines per source (failing vitest
      first). `lib/server/library.ts` passes `source`, plus the admin runs and start server functions.
- [x] 5.2 `/admin` → Game library: a month picker (published range), Start, and the runs table polled every 2 s while a
      run is running (component test with a fake API). Commit: `feat(frontend): import lichess broadcasts`.
- [x] 5.3 The explorer panel's source switch (`?src=`, chips, 44 px under `pointer-coarse`), the attribution lines, and
      the "broadcast games are indexed for the first 20 moves" note.
      `/library` gets the source filter (a plain GET field). A broadcast game's attribution links to its lichess page.
      Component tests. Commit: `feat(frontend): the explorer counts lichess broadcasts`.
- [ ] 5.4 🐳 Playwright `e2e/library.spec.ts` (written; human-run): with a broadcast game seeded through the PGN import, the switch changes the counts and the
      credit line appears (`tools/e2e.sh`).

## 6. Docs and the real import

- [x] 6.1 `tools/library/SOURCES.md`: the broadcast row (how to import it on `/admin`, the default filter, removal by
      source). `apps/frontend/ATTRIBUTION.md`: lichess broadcasts, CC BY-SA 4.0. Commit:
      `docs(repo): lichess broadcasts as a library source`.
- [ ] 6.2 👤 Human-run on the live stack: import 2026-08, then check `/analysis` at the start position shows broadcast
      counts and the credit. Months to import beyond that are the owner's choice.
