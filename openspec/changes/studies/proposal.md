## Why

Part 4 of the ROADMAP, first half (owner decision 2026-09-28: two changes, this one first, then `engine-analysis`).
Players want to keep games to study: import a PGN, step through it on a board, try and save their own variations,
and share a study with a link. A finished game on the site should open as a study too.

## What Changes

- **Studies**: a study is a title, a start position and a **move tree** (a main line with variations, any depth). It
  belongs to its owner; the owner can **share** it, and then anyone signed in with the link can open it read-only.
  Plain rows in Postgres (no actor, no events: nothing else reacts to a study), read and written on the primary.
- **Import**: paste PGN text or upload a `.pgn` file. Each game in it (up to 20) becomes one study with its
  variations. The browser parses the PGN (`@mliebelt/pgn-parser`, Apache-2.0, which keeps variations — chess.js
  drops them) and sends a tree of UCI moves; **the server replays every line with `ChessRules`** from the start
  position (a PGN `FEN` tag is honoured) and stores SAN and FEN it computed itself, so a stored study is always legal.
- **The board** (`/studies/{id}`): step through moves (buttons and arrow keys), jump anywhere in the tree, play a move
  to start a variation, promote a variation to main line or delete it, rename, save. Owners edit; others read.
- **"Analyse" on a finished game**: makes a study from the game's moves (anyone signed in may, as games are public to
  watch) and opens it.
- **PGN export** of a study, with its variations.
- **Lists**: `/studies` shows my studies (newest first, keyset-paged) with the import form; a "Studies" item in the
  navigation.

## Owner decisions (design conversation, 2026-09-28)

1. Import by pasting or uploading — both.
2. Variations are saved.
3. Studies can be shared with a link (read-only for others).
4. "Analyse" on a finished game: my recommendation, accepted with the plan.
5. The openings explorer comes later; engine analysis is the next change.

## Capabilities

### New Capabilities

- `studies`: importing, storing, editing, sharing and exporting studies, and making one from a game.

### Modified Capabilities

None.

## Impact

- Backend: `Data/Models/Study.cs` + migration, `Studies/` (tree validation and PGN export), `WebApi/Studies/`
  endpoints, `POST /api/games/{id}/study`.
- Frontend: `lib/studies.ts` (tree, PGN parse), `components/studies.tsx` (move tree), routes `/studies`,
  `/studies/$id`, the nav item, the "Analyse" button; new dependency `@mliebelt/pgn-parser`.
- Tests: unit (tree validation, PGN export, parsing), integration (import → edit → share → read), Playwright
  (import, add a variation, save, share link read-only), `verify-part4a.sh`.
- Docs: CLAUDE.md, architecture, ROADMAP.
