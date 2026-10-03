## Context

Research on 2026-10-02 (sources fetched that day; not legal advice):

- **Moves are facts**, generally not copyrightable; annotations and an original selection can be. The **EU/UK
  database right** protects substantial investment in a collection against extracting a substantial part, so the club
  stores moves as its own records and never bulk-copies a protected database.
- **PGN Mentor** (pgnmentor.com/files.html): every World Championship match 1886–2024 and Candidates as plain PGN,
  "free", no explicit licence → moves and the factual headers only, its notes dropped, attributed. Missing: 1993–2004
  (split title, FIDE knockouts).
- **Lichess broadcasts** (database.lichess.org): 2020 onwards incl. the 2021/2023/2024 matches and the 2026 match
  (Gukesh–Sindarov, Geneva, 25 Nov–15 Dec), **CC BY-SA 4.0** → stored with attribution.
- **Caissabase** (said CC0, could not be verified: the site blocks bots) → 1993–2004 waits for a human check.
- **TWIC, chessgames.com, ChessBase**: personal use / proprietary → not used.
- **lichess `chess-openings`**: ECO, name and moves for ~3,500 named positions, **CC0** (verified in its README).

The app already has: `Analysis/PositionKey.Of(fen)` (FEN's first four fields, en passant only when a pawn can take)
and its TypeScript mirror; `ChessRules.ForStudy` (any FEN, no automatic endings) used by `StudyTree` to replay and
store server SAN/FEN; `parsePgn` (browser, per game, SAN → UCI); keyset paging helpers; admin pages behind the Admin
role.

## Goals / Non-Goals

**Goals:**

- A curated library of a few thousand games, searchable by details, opening and position, with every row's source and
  licence known.
- Import that never stores an illegal game and never duplicates one.

**Non-Goals:**

- Millions of games; full-text search of annotations; opening statistics like an explorer beyond W/D/L counts; members
  importing to the library.

## Decisions

1. **Curated size → plain tables.** ~3,000 games × ~80 plies ≈ 250k `library_positions` rows. Postgres with B-tree
   indexes answers every query here in milliseconds; no search engine, no explorer service. If the library ever grows
   past ~100k games, position search gets its own design (aggregated counts per key).
2. **Tables** (primary, read from the replica):
   - `library_games(id uuid v7, white, black, event, site, round, date_text, year int null, result, eco, opening_name,
moves_uci text[], ply int, source text, licence text, source_ref text, dedupe_key text unique, created_at)`.
     `date_text` keeps PGN's partial dates (`1886.??.??`); `year` is what search filters on.
   - `library_positions(position_key text, game_id uuid, ply int)` PK `(position_key, game_id, ply)`; the PK's leading
     column is the lookup. The start position is not stored (every game has it).
   - `openings(position_key text PK, eco, name, ply)` — the deepest named position a game reaches is its opening.
   - Indexes for details search: `(year, id)`, `(eco)`, and `pg_trgm` GIN indexes on `white`, `black` and `event`
     (the extension ships with Postgres contrib and is available in the stack's image; the migration enables it with
     `HasPostgresExtension("pg_trgm")`), so "part of the name, any case" is an index lookup, not a scan.
3. **Who parses what.** The browser parses PGN (existing `parsePgn`, extended to pass Event/Site/Round/ECO through)
   and sends batches of ≤100 games as headers + UCI moves to `POST /api/admin/library/import` with `source` and
   `licence`. The server replays each with `ChessRules` (standard start only — a library game with a FEN tag is
   refused: famous games start from the start), computes every position key, matches the opening, builds the dedupe
   key (`lower(white)|lower(black)|year|moves hash`) and inserts game + positions in one transaction per batch. The
   answer lists `{ index, status: imported | duplicate | refused, error? }`.
4. **Openings seed.** `apps/backend/Library/Openings/{a..e}.tsv` (CC0, committed — small, public domain, attributed
   in `apps/frontend/ATTRIBUTION.md`) are embedded in the backend and replayed (SAN through `ChessRules.TryApplySan`)
   into `openings` at startup when the table is empty, under an advisory lock so two nodes never seed together. Rows
   that do not replay are skipped. Position keys make transpositions land on the same name.
5. **Reads.** `GET /api/library/games?player&event&from&to&result&wc&eco&opening&cursor&limit` (keyset by `(year desc,
id)`), `GET /api/library/games/{id}` (moves + headers + attribution), `GET /api/library/positions/{key}` (games at
   that position with the ply, plus W/D/B counts, first 50 by year), `GET /api/library/openings/{key}` (name for the
   current position, walking back is the browser's job: it asks for the deepest key it has). All SignedIn, replica,
   `private, max-age=3600` (the library changes only on import).
6. **World Championship flag.** A game is WC when its import says so (`kind: "wc"` on the batch) — event names vary too
   much to infer. Candidates and classics import with `kind` null.
7. **Attribution.** Every game page shows "Source: PGN Mentor — moves only" / "Lichess broadcasts, CC BY-SA 4.0" from
   its row; `/library` has an About section listing sources with links.
8. **Fields typed before hydration.** The import form adopts them (`useAdoptTyped`); the library search is a plain GET
   form with named fields, so it works before hydration too. Found by `e2e/library.spec.ts`.
9. **PGN files are not committed.** `tools/library/SOURCES.md` lists the planned imports (URL, licence, kind) so an
   admin can fetch and import them; the data lives only in the database.

## Risks / Trade-offs

- [PGN Mentor has no explicit licence] → moves and factual headers only, attributed, notes dropped; owner may ask them
  for permission; rows are removable by `source`.
- [CC BY-SA on broadcast games] → share-alike applies to the game data we pass on (e.g. a PGN export of a library
  game carries the licence line); our code stays MIT.
- [Name spellings differ across sources (Kasparov, G / Garry Kasparov)] → search matches substrings case-insensitively;
  a name-normalisation table is a later step if needed.
- [A big import blocks the request] → batches of 100, one transaction each; the admin page shows progress.

## Open Questions

- (settled 2026-10-03) PGN Mentor: the owner accepts its free files as a factual source. Caissabase: gone since 2025,
  not used. 1993–2004: Lumbra's GigaBase (CC BY-NC-SA 4.0) approved by the owner, to import as a follow-up — only
  those events, attributed, removed if the club ever becomes commercial.
