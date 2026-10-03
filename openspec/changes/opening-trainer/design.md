## Context

`apps/backend/Library/Openings/{a..e}.tsv` (lichess `chess-openings`, CC0, ~3,800 rows of eco, name, pgn) are embedded
and replayed at startup into `openings(PositionKey, Eco, Name, Ply)`, one row per position (the first name the list
gives it). Names follow "Family: Variation, Subvariation". The analysis board's `AnalysisBoard` + `useMoveTree` handle
input; `ChessRules` is the server's rules adapter; per-user rows and keyset lists have well-worn patterns.

## Goals / Non-Goals

**Goals:** drill every named line of a family from either side, remember per member what is known, and bring back
what is not.

**Non-Goals:** repertoires, engine play off the book, competitive scoring, anything shown to other members.

## Decisions

1. **The tree lives on the server.** `openings` gains `MovesUci` (text[]); the seed fills it. Rows seeded before this
   change have none: the seed re-runs once (clears and refills under the same advisory lock) when any row lacks moves.
   Families and trees are built from these rows in memory (≈3,800 rows; cached per process, the list never changes at
   runtime).
2. **Families are name prefixes.** The family list is the distinct text before the first ':' (≈150 families), each with
   its line count; a member may also open any longer prefix ("Sicilian Defense: Najdorf Variation"). Search matches part
   of a name, any case.
3. **Lines are the leaves.** A family's lines are its named entries that are not a prefix of another entry in the same
   family: "Ruy Lopez" (1.e4 e5 2.Nf3 Nc6 3.Bb5) is covered by every deeper Ruy Lopez line and is not drilled on its own.
   A line's id is its end position's `PositionKey` (unique in `openings`).
4. **Scheduling is a Leitner box, pure.** `trainer_progress(UserId, LineKey, Color, Box 0–5, DueAt, LastResult,
UpdatedAt)`, PK `(UserId, LineKey, Color)`. A clean run moves the line up one box and sets `DueAt = now + [0, 1, 3, 7,
14, 30] days[box]`; a run with a mistake sets box 0, due now. The next line is: due lines with the lowest box first,
   then the oldest due, then lines never seen (in tree order). Learned = box ≥ 3. A pure `TrainerSchedule` holds all of
   it and is unit-tested.
5. **The browser checks moves.** The drill gets the line's moves and plays the other side's itself; the member's move
   is compared with the line's (UCI, promotion included). It is a quiz, not a game: no actor, no events, no clock. One
   result per finished line is posted (`mistakes` count); the server never trusts more than "clean or not".
6. **Which side moves first.** As White the member plays move 1; as Black the board plays White's first move. A line
   that ends on the other side's move ends after the board plays it.
7. **Endpoints (SignedIn, the member's own progress only).** `GET /api/trainer/families?q=` (name, lines, learned for
   the member — the counts from one grouped query); `GET /api/trainer/families/{family}?color=` (the lines: key, name,
   eco, moves, box, due); `GET …/{family}/next?color=` (the due line or 204 when the family is done for now);
   `POST /api/trainer/results {lineKey, color, mistakes}` (validated: the line exists, color white|black). `no-store`.
8. **Where it shows.** `/trainer` (families, search, progress bars), `/trainer/$family?color=` (the drill board, the
   line's name and ECO, "Try again" feedback, "Next line", the family's lines with their state), a "Trainer" nav entry,
   and "Openings trained" on the member's own profile (learned / lines per family trained).

## Risks / Trade-offs

- [Lines that share their end position keep one name] → the first name wins, as for the opening names today; a family
  may show slightly fewer lines than the list has rows.
- [A long family (Sicilian: hundreds of lines)] → the next-due rule keeps a session short; the family page lists lines
  page by page.
- [Progress rows grow with members × lines] → one row per line actually trained; a few thousand per active member at
  most.
