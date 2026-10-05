## Context

The opening trainer (`Trainer/`, `WebApi/Trainer/`, `lib/trainer.ts#useDrill`) drills lines given as UCI lists from the
standard start, keyed in `trainer_progress (UserId, LineKey, Color)` by the line's end `PositionKey`, on the pure
`TrainerSchedule`. Studies (`studies`, owned, `Tree` jsonb of `StudyMove(Uci, San, Fen, Children)`; the first child
continues the line, the rest are variations; `StartFen` any legal FEN; at most 2,000 moves) are plain rows on the
primary with `Version` as the concurrency token. The review's `mistake_drills` already reuse `TrainerSchedule`.

## Goals / Non-Goals

**Goals:** drill every line of a member's own study from either side with the opening drill's board, feedback and
schedule; keep progress across edits wherever a line did not change.

**Non-Goals:** others' studies, sub-trees, comments, profile entries, a combined "all my lines" drill.

## Decisions

1. **A line is a path from the study's start to a leaf.** `Trainer/StudyLines.Of(startFen, tree)` walks the tree depth
   first, main line first (child 0 before variations), and yields every root-to-leaf path as its UCI list. This one rule
   gives both kinds of branching: several replies for the other side become several lines (the board plays a different
   reply in each), and several moves for the member's side become several lines too. Order = tree order, which is the
   "never trained" order of `TrainerSchedule.Next`.
2. **Lines with nothing to play are skipped.** A path with no move for the chosen side (a study of just "1.e4" drilled
   as Black) is not a line for that side. A line may end on the other side's move; the board plays it and the line ends,
   as for named lines.
3. **A line is identified by its moves, not by its place.** `LineKey = "study:" + base64url(SHA-256(PositionKey.Of(
StartFen) + " " + uci path))` (≤ 60 chars, fits the existing PK). Alternatives considered: the leaf's tree path
   (indexes shift when a variation is inserted or promoted, so progress would jump to another line) and the leaf's
   `PositionKey` (transpositions merge lines, and editing the moves before it would silently keep progress for a
   different sequence). With the hash, progress follows exactly the same sequence of moves wherever it sits in the tree.
4. **What an edit does.** A line whose moves are unchanged keeps its progress (reordering or promoting variations does
   not touch it). Extending a line's end, or changing any move in it, makes a new line (box: new) — the member now has
   to know more, so being asked again is correct. `StudyService.UpdateAsync` deletes the owner's `trainer_progress` rows
   for that study whose key is no longer among its lines (both colours), in the same `SaveChanges`. A study deleted, or
   its owner changed, drops its progress: `StudyId` is a FK with `ON DELETE CASCADE`.
5. **One table, a source column.** `trainer_progress` gains `StudyId uuid NULL` (null = a named line). The opening
   queries already filter by the family's keys, so study rows never leak into them; `MineAsync` (profile) skips them
   explicitly by `StudyId is null`. Index `(UserId, StudyId, Color)` for a study's progress.
6. **The member's own studies only.** Every study endpoint loads the study with `OwnerId == userId` (404 otherwise,
   even when shared — the same rule as `StudyService.OwnedAsync`). Results are checked by recomputing the study's lines:
   a `lineKey` that is not a line of that study for that colour is a 404, so a stale tab after an edit cannot write a
   row for a line that no longer exists.
7. **The member's side branching.** When a line expects 3.Bb5 and the member plays 3.Bc4, which is the move of another
   line of the same study at the same position, the drill says "That is your other line here; this one goes 3.Bb5" and
   does not count a mistake; the member still plays 3.Bb5 to go on. Any other move is a mistake as today. The study
   detail carries, per line, nothing extra: the browser derives "other line" from the lines it already has (the line list
   is part of the drill page's data).
8. **Any start position.** `TrainerLine` gains `startFen` (the standard start for named lines). `fenAfter`, `sanAt`,
   `lineText` and `isMemberMove` take it: the side to move and the move numbers come from the FEN, so a study from a
   middlegame position drills from there.
9. **Line names.** A study line has no name in a list: it is shown as its moves from the first point where it leaves the
   study's main line ("main line" for the main line itself), e.g. "… 3...Nf6 4.O-O", built in the browser from `startFen`
   and the moves.
10. **Endpoints (SignedIn, `no-store`, `ApiOptions` page size).** `GET /api/trainer/studies?color=&cursor=` — the
    member's studies (keyset, newest first, as `/api/studies/mine`) with lines and learned for that colour;
    `GET /api/trainer/studies/{id}?color=` — title, start FEN, the lines with box and due;
    `GET /api/trainer/studies/{id}/next?color=` — the due line or 204 with the next due time;
    `POST /api/trainer/studies/{id}/results {lineKey, color, mistakes}` — same `TrainerSchedule.After` as named lines.
    Lines are computed per request from the study row (≤ 2,000 moves; no cache).
11. **Where it shows.** `/trainer` gets a two-way switch "Named openings | My studies" (a search param, so it works
    without JS); "My studies" lists the studies with progress bars and a "Train" link. `/trainer/study/$id?color=` is the
    drill page: the same board, feedback and "Next line" as `/trainer/$family`, and the study's lines with their state.
    The study page gets a "Train this study" link for its owner.

## Risks / Trade-offs

- [A small edit resets a line] → only lines whose moves changed; this is the price of never crediting a member for a
  sequence they did not play. The design says so on the drill page ("Changed lines start again").
- [A big study has hundreds of lines] → the next-due rule keeps sessions short, as with the Sicilian; the line list is
  shown collapsed after 50.
- [A study with transpositions repeats work] → two paths to one position are two lines; correct for a repertoire drilled
  as move sequences.
- [Hashing ties the key to `PositionKey.Of(StartFen)`] → changing the start position of a study (not possible in the UI
  today) would reset all its lines, which is right.
