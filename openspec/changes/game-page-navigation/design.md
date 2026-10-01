## Context

The game page holds the SAN list (`sans`, merged from frames by `mergeMoves`) and the live view's FEN. The study page
already has a navigation bar (`|◀ ◀ ▶ ▶|`). The pieces and the board come from `board-look`.

## Goals / Non-Goals

**Goals:** material, navigation and flip using only data the page already has.

**Non-Goals:** clock changes, analysis on the game page, saving the flip state (`user-preferences` could add it
later).

## Decisions

1. **Positions are replayed in the browser.** `fensAfter(sans)` replays the SAN list from the standard start with
   chess.js (all our games start there) and returns FENs indexed by ply. It is memoised on `sans`, and a new move
   appends one FEN instead of replaying. _Alternative:_ fetch FENs from `/moves`. Rejected: an extra request per
   page view, and the replica can lag behind the frame.
2. **`viewPly: number | null`** in the page state. `null` means "follow the live position". Every input
   (click, keys, bar) sets a number. "Back to the game" and any attempt to move set it back to `null`. The board is
   given `fensAfter[viewPly]` and no move handlers while `viewPly !== null`.
3. **Material from the shown FEN.** `material(fen)` counts the pieces against a full set and returns
   `{ white: { captured: Piece[], plus: number }, black: … }`. Promotions count naturally: a promoted queen makes
   the material count higher than the captured pieces explain, and that is what lichess shows as well.
4. **Keys** are handled by one `keydown` listener on the page that ignores events from inputs and text areas.
   `f` flips, ← → Home End navigate.
5. **Flip** is `flipped: boolean`, page-local state applied on top of `orientation(view, me)`. The strips render
   in board order, so they swap with it.
6. **One shared nav bar.** The study page's buttons move into `components/games.tsx#MoveNav` (`onStart/onBack/
onForward/onEnd`), used by both pages, so the bar is defined once.

## Risks / Trade-offs

- [Replay cost on long games] → One replay per page load, then one move per frame. Negligible.
- [A refetch (`mergeMoves` → `refetch`) replaces the list] → `fensAfter` recomputes from the new list. A `viewPly`
  beyond the new length is clamped.

## Open Questions

None. The owner accepted navigation during live games (lichess behaviour). If that turns out to be unwanted in
timed games, it can be limited later with one condition.
