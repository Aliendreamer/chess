## Why

On lichess you can see at a glance who is ahead in material, step back through the game with the arrow keys, and turn
the board around. Our game page has none of these: the move list is display-only and the board always faces your own
side. The owner accepted these parts of proposal P5 on 2026-10-01. The clock changes (tenths, low-time colour) were
declined.

Part 5 (look and feel), second change. Depends on `board-look` (piece images and the board wrapper).

## What Changes

For a player or spectator:

- **Captured pieces** are shown under each player's name (the opponent's pieces they have taken, as small images) with
  the material difference (`+3`) on the side that is ahead.
- **The move list is clickable.** Clicking a move, or using ← → Home End, shows that position. A bar under the board
  has start / back / forward / end buttons. While you look at an earlier position the board is read-only and a "Back
  to the game" button returns to the live position. A new move from the opponent does not pull you away. You return
  to the live position when you choose to, or automatically as soon as you try to move.
- **Flip board**: a button (and the `f` key) turns the board around for this page view.
- Out of scope: clocks (unchanged), sound, and analysis on the game page (finished games go to a study, as today).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `play-ui`: the game page adds material, move navigation and flip.

## Impact

- **Frontend:** `lib/games.ts` (pure `material(fen)`, `fensAfter(sans)`), `components/games.tsx` (`PlayerStrip` with
  captured pieces, `MoveList` with selection and clicks, `MoveNav` bar), `routes/_authenticated/games.$id.tsx`
  (viewed ply, keyboard handler, flip state).
- **Backend:** none. Positions are replayed from the SAN list the page already has, with chess.js.
- **Tests:** vitest for `material` and `fensAfter`, and component tests for the list and the bar; one Playwright
  check that ← shows the previous position.
