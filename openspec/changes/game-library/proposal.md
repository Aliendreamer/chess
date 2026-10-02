## Why

The owner wants the club to hold the games of chess history — every World Championship match game and the famous
classics — searchable and analysable (2026-10-02: "infos for old famous parties or wc games to allow search and
analyzing of them"). Nothing in the app holds games other than the members' own. Research the same day found sources
the club may store (see design: moves are facts; collections carry database rights in the EU/UK).

## What Changes

For a member:

- A **Library** page (`/library`) searching famous games by **details** (player as either colour, event, year range,
  result, World Championship only), by **opening** (ECO code or name — every game shows its opening, e.g. "C67 Ruy
  Lopez: Berlin Defense"), page by page.
- Each library game opens on the **analysis board** (`analysis-board`) with its moves, players, event, date and an
  attribution line (its source and licence).
- The analysis board gets an **In the library** panel: the library games that reached the current position, with how
  they ended (white wins / draws / black wins), each opening at that move. The current position's opening name shows
  above the board.

For an admin:

- **Import to library** on the admin page: a PGN file with its source and licence; the browser parses it, the server
  replays every game with the rules library, rejects illegal ones (reported by game), skips duplicates, and stores
  each game, its positions and its opening.

In the code: three tables (`library_games`, `library_positions`, `openings`), an opening list loaded from lichess's
`chess-openings` (CC0), endpoints under `/api/library`, the admin import, and two pages' worth of frontend.

Part: 4 (study & analysis), follow-up. Out of scope: the full broadcast or online databases (millions of games — a
different design), annotations from any source, members adding games (admin only), statistics beyond W/D/L per
position, bulk-copying TWIC, chessgames.com or ChessBase (database rights; their terms forbid it).

## Capabilities

### New Capabilities

- `game-library`: the library's games, their sources and licences, search by details and opening, position search,
  opening names, and the admin import.

### Modified Capabilities

(none — the analysis board's library panel, opening line and `?library=` start are requirements of `game-library`,
so this change does not depend on `analysis-board` being archived first)

## Impact

- Backend: migration for `library_games`, `library_positions`, `openings`; `Library/` (replay, position keys via
  `Analysis/PositionKey`, opening match, duplicate check, `LibraryService`); `WebApi/Library/` (search, game, position,
  opening) and `WebApi/Admin/ImportLibrary/` (batch import, Admin role); an openings seed from the lichess TSV files
  (CC0, small, committed and embedded from `apps/backend/Library/Openings/`).
- Frontend: `lib/library.ts`, `lib/server/library.ts`, `routes/_authenticated/library.tsx`, the admin import form,
  the analysis board's panel and opening line; `parsePgn` passes through Event, Site, Round, ECO.
- Data: PGN files are fetched by an admin and **never committed** (like the Stockfish archive): the repo does not
  redistribute anyone's collection. A list of the planned first imports, with URLs and licences, lives in
  `tools/library/SOURCES.md`.
- Depends on `analysis-board`, `engine-analysis` (`PositionKey`), `studies` (PGN parsing), `admin-screens`.
