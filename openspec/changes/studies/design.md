## Context

Games are event-sourced actors; studies are not games — nothing is timed, nobody else reacts, and the only writer is
the owner. ROADMAP Part 4 says "no actor needed". `ChessRules` (Gera.Chess) can start from any FEN (`FromFen`) and
reports SAN and FEN for each applied move. chess.js loads PGN but drops variations.

## Goals / Non-Goals

**Goals:** import (paste and upload, several games), a board with a saved variation tree, sharing by link, a study from
a finished game, PGN export.

**Non-Goals:** engine analysis (next change `engine-analysis`), comments and annotation glyphs (dropped on import for now;
a later change), collaboration or edits by others, the openings explorer, NAGs, clocks in PGN.

## Decisions

### D1 — A study is one row with its tree as JSON

`studies(Id, OwnerId, Title, StartFen, Tree jsonb, Shared, CreatedAt, UpdatedAt, Version)`. `Id` is a random Guid v4
(the link is a bearer secret for shared studies, as for invites). `Tree` is the list of top-level moves, each
`{ uci, san, fen, children[] }`; a node's first child continues its line (the main line is the chain of first
children), the others are variations. Limits: 2 000 nodes, 1 000 plies deep, 200-character titles, and at most 20 games
per import. Reads and writes go to the primary (the owner's own data, read-your-write);
`Version` is the concurrency token, so two tabs saving over each other get a 409 instead of a silent loss.

### D2 — The server is the referee

Clients send moves as UCI only. `StudyTree.Validate(startFen, tree)` replays every path with `ChessRules` from the
start position and returns the tree with the server's own SAN and FEN, or the first illegal move and its path. An
unparseable FEN, a tree over the limits or an illegal move is a 400. So SAN in a stored study is always ours.

### D3 — PGN in, PGN out

**Import** (browser): `@mliebelt/pgn-parser` parses the text (all games, variations nested); each game is walked with
chess.js from its start position (standard, or the `FEN` tag) to turn SAN into UCI; comments, NAGs and clocks are
dropped. Games that fail to parse are reported by number and the rest imported. **Export** (server):
`StudyPgn.Build` writes the seven-tag roster (Event = title, the PGN's players/result/date when it had them, else `?`),
`SetUp`/`FEN` for a custom start, and movetext with `( … )` for variations.

### D4 — Sharing

`Shared` is off by default. The owner turns it on or off; the link is the study's URL. Anyone signed in may read a
shared study (the API answers 404, not 403, for a private one that is not yours, so ids do not leak existence).

### D5 — From a game

`POST /api/games/{id}/study` (signed in, the game ended) reads `rm_moves` from the primary and creates a study titled
"{white} – {black}, {date}" owned by the caller; it answers the new study.

### D6 — API

`POST /api/studies` (create one or import up to 20: `{ studies: [{ title, startFen, tree, headers }] }` → ids),
`GET /api/studies` (mine, keyset), `GET /api/studies/{id}`, `PUT /api/studies/{id}` (title + tree, with `version`),
`POST /api/studies/{id}/share` (`{ shared }`), `DELETE /api/studies/{id}`, `GET /api/studies/{id}/pgn`. WebApi
folder rules as for every endpoint.

### D7 — UI

`/studies`: import (paste box + file input) and my studies. `/studies/$id`: the board (reusing `Board`), a move tree
component (main line inline, variations indented and clickable), navigation (◀ ▶, arrow keys, start/end), moves played
on the board go into the tree (an existing child is followed, else a variation is added), promote/delete on the
current move, title edit, Save (with an unsaved-changes marker), Share toggle with the link, PGN download. Read-only
for non-owners. The game page gets "Analyse" on finished games. chess.js is feedback only, as on the game page: the
server's validated tree is what is kept.

## Risks / Trade-offs

- Big imports are bounded by the limits; a 2 000-node study is still a small JSON document.
- Comments are dropped on import; they come back with annotations later.
- Parsing PGN in the browser means an API client could skip the parser — which is fine, because the server validates
  the tree it gets, whatever produced it.
