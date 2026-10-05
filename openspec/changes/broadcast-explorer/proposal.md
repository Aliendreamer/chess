## Why

The explorer (`library-explorer`) answers "what was played here" from about a thousand World Championship games: deep
in a line it soon runs dry. The owner agreed on 2026-10-05 to add lichess's broadcast games as a second source, "if we
can use them free". We can: database.lichess.org says "Broadcast games are released under the Creative Commons
Attribution-ShareAlike 4.0 license" (checked 2026-10-05), so the club may store and show them with attribution. There
are 1,263,913 games from 2020 onwards, in one `lichess_db_broadcast_YYYY-MM.pgn.zst` per month (18–31 MB, 28–49k games
a month in 2026).

## What Changes

For a member:

- The explorer on the analysis board counts games from the lichess broadcasts as well as from the World
  Championships. A source switch (All · World Championships · Broadcasts) picks which games count. Every move's game
  count and its white/draw/black bar follow the switch.
- The panel credits its sources: "World Championship games 1886–2024 (PGN Mentor)" and "Lichess broadcasts,
  CC BY-SA 4.0". A broadcast game opened from the panel or the library says the same and links to its page on lichess.
- `/library` search gains a source filter. Broadcast games can be found by player, event, year and opening like the
  others.

For an admin:

- **Import a month of broadcasts** on `/admin` → Game library: pick a month and the server fetches that month's file
  from database.lichess.org, keeps the games that pass the filter, and imports them in the background. Progress
  (read, kept, imported, duplicate, refused) shows on the page. Running a month again imports nothing twice.
- What the filter keeps by default (the owner may change it): standard chess from the standard start, a finished
  result, both players rated 2400 or more, and not blitz or bullet when the time control says so. A game without a time
  control is kept. These are settings, not code.

In the code: the backend learns to read PGN and zstd (until now the browser parsed every import). `library_positions`
gains the move played next, the result and the source, so the explorer counts in SQL instead of loading every game at
a position into memory. That memory load is fine for 1,000 games and not for 100,000. Broadcast games store positions
only for their first 40 plies.

Part: 6 (analysis, the library), follow-up to `game-library` and `library-explorer`. It settles the ROADMAP Part 6
note "Later: lichess broadcast master games (CC BY-SA) as a second explorer source".

Out of scope:

- The full lichess games database (online games, 30 GB a month).
- Fetching new months on a schedule (an admin imports a month when they want it).
- Removing duplicates across sources: a World Championship game that is also in a broadcast is stored under both
  sources, because the two sources spell names differently.
- Statistics by rating or year.
- Any annotation, clock or evaluation from the broadcast files (they carry `[%eval]` and `[%clk]`; both are dropped,
  like every other annotation).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `game-library`: admins import a month of lichess broadcasts on the server, filtered. The explorer and the position
  panel count by source, and search filters by source.

## Impact

- Backend:
  - New: `Library/` PGN reader (headers + SAN movetext, comments and variations skipped), the broadcast filter, the
    month import job (a cluster singleton, like `news-fetcher`) and its run rows (`library_import_runs`).
  - Changed: `LibraryImport.Prepare` caps the positions it writes.
  - Migration: `library_positions` gains `next_uci`, `result` and `source`, plus ply-0 rows; existing rows are
    backfilled.
  - The explorer endpoint counts with one `GROUP BY` and takes a `source` parameter.
  - New: `WebApi/Admin/ImportBroadcasts/` (start a month, list runs).
  - New dependency: `ZstdSharp.Port` (MIT, exact pin).
  - Settings: `LibraryBroadcasts:*` (minimum Elo, fast games out, position plies, batch size).
- Frontend:
  - `/admin`: a broadcasts month picker with run progress.
  - Explorer panel: the source switch and the attribution lines.
  - `/library`: a source filter.
  - Broadcast game pages: the lichess link.
- Data: about 120,000 games and about 5M position rows if every month from 2020 is imported at the default filter (see
  design). A source is removed with one statement, as `tools/library/SOURCES.md` already says.
- Docs: `tools/library/SOURCES.md` (the broadcast row: how to import it, the filter), `apps/frontend/ATTRIBUTION.md`.
