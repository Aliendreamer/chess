## Context

Checked on 2026-10-05:

- **Licence.** database.lichess.org, Broadcasts tab: "1,263,913 games in PGN format, from the official Lichess
  broadcasts. Broadcast games are released under the Creative Commons Attribution-ShareAlike 4.0 license." This is
  free to use, including commercially, if we credit "lichess broadcasts" and pass the games on under the same
  licence. The site's other exports (the online games) are CC0. Not legal advice.
- **Files.** `https://database.lichess.org/broadcast/lichess_db_broadcast_YYYY-MM.pgn.zst`, one per month, 2020-01 to
  2026-09 (81 months). 2021-06 is 3.2 MB with 6,629 games; 2026-08 is 31 MB with 48,940 games.
- **Compression.** The files are written by `pzstd`: a skippable frame (magic `0x184D2A5?`), then several zstd
  frames. A plain one-frame decoder stops at the skippable frame. Node's `zlib.zstdDecompressSync` did, and the files
  decoded only once the skippable frames were stepped over.
- **Headers** (counted in the two months above):
  - Every game has `Event`, `White`, `Black`, `Result`, `Variant`, `ECO`, `Opening`, `BroadcastName`, `BroadcastURL`
    and `GameURL`.
  - In 2026-08: `WhiteElo`/`BlackElo` 93 %, `WhiteFideId` 94 %, `TimeControl` 73 %, `Date` 100 %, `FEN` 360 games
    (0.7 %), `Variant` 99.3 % Standard (329 Chess960/Fischerandom), `Result "*"` 1,100 games.
  - In 2021-06: Elo 62 %, `TimeControl` 0.4 %.
  - `Event` is often the round ("Round 6: Postny - Bjerre"); `BroadcastName` is the tournament.
- **TimeControl is free text**, mostly minutes: `90+30`, `15+10`, `3+2`, `90min/40moves + 30min + 30sec/move`,
  `1:30:30`, `10'+5`, and sometimes seconds (`600`, `5400+30`). Among the 2026-08 games with both players at 2400 or
  more:
  - classical (base 60 min or more): 526
  - rapid (10–59 min): 334
  - blitz (under 10 min): 362
  - no time control: 876
  - seconds-style or unreadable: about 240

  Rapid and classical cannot be told apart reliably, but blitz and bullet mostly can.

- **Filter yield.** Finished standard games from the standard start, both players rated 2400 or more:
  - 2026-08: 2,340 of 48,940 (both 2200 or more: 8,478; both 2000 or more: 17,335).
  - 2021-06: 532 of 6,629.
  - Kept games average about 90 plies.
- **Moves.** SAN with `{ [%eval …] [%clk …] }` comments after each move. Comments, NAGs and variations are skipped.
- **The current explorer** (`WebApi/Library/LibraryPosition/LibraryPositionEndpoint`) loads every game at the
  position, including its full `MovesUci`, into memory, and groups the next move in C#. At the start position that
  means every game in the library. That is fine at about 1,000 games and not at 120,000.
- The app already has:
  - `ChessRules.TryApplySan` (used by the openings seed).
  - `LibraryImport.Prepare`, which replays, finds the opening and builds the dedupe key.
  - `LibraryService.ImportAsync`: one transaction per batch, skips a dedupe key it already holds.
  - The `news-fetcher` singleton as the pattern for server-side fetches with settings.

## Goals / Non-Goals

**Goals:**

- The explorer can draw on strong, recent games.
- A month is imported by an admin with one click, can be re-run safely, and its rows say where they came from.
- Explorer reads stay fast as the library grows a hundredfold.

**Non-Goals:**

- Every broadcast game: rating and speed filters keep the explorer master-level.
- Scheduled imports.
- Removing duplicates across sources.
- A rating or year breakdown in the explorer.
- Storing evaluations or clocks from the files.

## Decisions

1. **The server imports from lichess, not the browser.**
   - `POST /api/admin/library/broadcasts { month: "YYYY-MM" }` (Admin role) creates a `library_import_runs` row and
     asks the `library-importer` cluster singleton to run it.
   - The singleton downloads from a URL built from the month only: fixed host and path, month checked against
     `^20\d\d-(0[1-9]|1[0-2])$` and against the range of published months. No URL is taken from input, so there is
     no server-side request forgery.
   - It streams the download through the decompressor and the PGN reader, filters game by game, and imports batches
     of `LibraryBroadcasts:BatchSize` (500) through the existing `LibraryService`. It saves the run's counts after
     each batch.
   - Only one run at a time. A second request while one runs is answered 409.
   - A run that dies (node lost, network) is marked failed. Running the month again is safe: the dedupe key skips
     what is already stored.
   - Rejected alternatives:
     - The browser: 30 MB downloads and 50k games through the 100-game endpoint, kept alive by an open tab.
     - A CLI with an admin cookie: another tool to run and keep working, and it bypasses the admin page.
   - `GET /api/admin/library/broadcasts` lists runs: month, state, read, kept, imported, duplicate, refused, started,
     finished.
2. **zstd with `ZstdSharp.Port`** (MIT, pure C#, streaming), pinned exactly.
   - The reader skips skippable frames itself, if the library does not.
   - A unit test decodes a small committed multi-frame fixture: a few hundred bytes made from a synthetic PGN, never
     lichess data.
3. **`Library/Pgn` reader, pure.** It reads headers and SAN movetext from a `TextReader`, one game at a time, and skips
   `{…}` comments, `;` comments, `(…)` variations, `$n` NAGs and move numbers. Each SAN is turned into UCI with
   `ChessRules.TryApplySan` while replaying. An unreadable game is refused with its index, and the run goes on.
4. **The filter (`BroadcastFilter`, pure, settings `LibraryBroadcasts:*`)**, all **default** (the owner may change
   them):
   - `Variant` is Standard or missing.
   - No `FEN`/`SetUp`.
   - `Result` is not `*`.
   - Both `WhiteElo` and `BlackElo` are at least `MinElo` (2400). A missing Elo fails.
   - With `ExcludeFast` (true), the game is dropped when its `TimeControl` reads as under 10 minutes base. Readings:
     `N` or `N+M` with N < 180 counts as minutes, N ≥ 180 as seconds (180+2 is blitz; no game starts with three hours); `H:MM:SS` and `Nmin…` are understood.
     Anything else, or no time control, counts as unknown and is kept.

   At the defaults that keeps about 2,300 games a month in 2026 and about 500 in 2021, roughly 120,000 over 81
   months.

5. **What a broadcast row stores.**
   - `Source` = "lichess broadcasts", `Licence` = "CC BY-SA 4.0", `SourceRef` = `GameURL` (the attribution links to
     the game on lichess).
   - `Event` = `BroadcastName` (the tournament, not "Round 6: …"), `Round` = `Round`, `DateText` = `Date`, ECO from
     the header.
   - `WorldChampionship` = false: the World Championship flag stays a PGN Mentor import decision.
   - Elo and FIDE ids are not stored: the library stores the game, not ratings.
6. **Explorer counts in SQL.**
   - `library_positions` gains:
     - `next_uci text null`: the move played from this position, null where the game ended.
     - `result text`, copied from the game.
     - `source text`, copied from the game.
   - It also gains ply-0 rows (the start position) for every game. The "every game" special case in the endpoint
     goes away.
   - A covering index `(position_key) include (next_uci, result, source, game_id, ply)` serves the explorer as an
     index-only scan:

     ```sql
     select next_uci, count(*), count(*) filter (where result = '1-0'), …
     from (select distinct on (game_id) * from library_positions
           where position_key = $1 [and source = $2]
           order by game_id, ply) first_visit
     where next_uci is not null
     group by next_uci
     ```

   - The games list is a join limited to 50 in SQL, newest year first.
   - The migration backfills the new columns and the ply-0 rows from `library_games.moves_uci` in SQL. The existing
     library is about 1,000 games.
   - Copying the result and source onto positions is acceptable because library games never change after import.
     Deleting a source still cascades.
   - `LibraryReads.Explore` stays as the pure grouping for tests, or is replaced by a test of the SQL in the
     integration suite (see tasks).

7. **Positions are capped for broadcasts.** `LibraryImport.Prepare` takes a `maxPositionPly`:
   - `LibraryBroadcasts:PositionPlies` (40, **default**) for broadcasts, unlimited for PGN Mentor and admin uploads.
   - At the defaults that is about 120,000 × 41 ≈ 5M rows (around 1 GB with the covering index), against about 11M
     for full games.
   - Cost: "In the library" past move 20 finds only the uncapped sources. The explorer is opening theory, so that is
     the right trade. The panel says "broadcast games are indexed for the first 20 moves".
8. **Source switch.**
   - `GET /api/library/positions?key=&source=all|wc|broadcasts` (default all). It maps to a `source` value list in
     `LibraryReads`, so a later source is one entry.
   - The panel keeps the choice in the URL (`?src=`) like the other analysis-board state, and shows one attribution
     line per source counted.
   - `/library` search takes the same `source`.
9. **Caching.** Position answers already carry `private, max-age=3600`. A FusionCache entry per `(key, source)` for
   `Library:ExplorerCacheMinutes` (10) is added, because the start position and the first few plies are asked for by
   every visitor and each one groups up to 120,000 rows.

## Risks / Trade-offs

- [CC BY-SA share-alike] → we credit "lichess broadcasts" with the licence on every broadcast game and in the panel.
  Anything we hand out from these games (a PGN download of a library game) carries the licence line. The club's code
  is unaffected.
- [lichess changes the file layout or URL] → the run fails with the HTTP status in its row; the month range and URL
  pattern are settings.
- [A large month blocks a node] → the singleton streams (constant memory) and commits per batch. A run of 49k games
  takes minutes, not hours (replay is about 0.2 ms a move).
- [Elo is missing in early months (62 % in 2021)] → those games are dropped at the default filter. Lowering `MinElo`
  or allowing a missing Elo is a settings change.
- [Duplicates across sources] → under All, a 2023/2024 title-match game may count twice (PGN Mentor and broadcast).
  This is known and small. The source switch shows each alone.
- [The migration touches every position row] → the library holds about 1,000 games today, so the backfill is seconds.

## Open Questions

- (default) `MinElo` 2400, fast games out, unknown time controls kept, 40 plies of positions. The owner may change
  any of them.
- Which months to import first: all 81, or 2023 onwards (the richest Elo and time-control headers)? The admin decides
  per run. The design does not need the answer.
