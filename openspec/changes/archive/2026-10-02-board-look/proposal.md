## Why

The board is the screen players look at most, and ours looks dated next to lichess: the pieces are Unicode glyphs
whose shape depends on the viewer's fonts, pieces jump instead of moving, there is no drag, no premove, no arrows,
and a king in check is not marked at all. The owner reviewed lichess.org on 2026-10-01 (proposals P1–P3) and chose
its look and its board behaviour for ours.

Part 5 (look and feel), first of its six changes. Settles the Part 1 open point "board UI library to evaluate
(react-chessboard) vs own".

## What Changes

For a player:

- **Pieces** are the Cburnett set (lichess's default), drawn the same on every device.
- **The board** uses lichess **Brown** colours by default. Blue, Green, Slate and Club walnut are defined too, and
  `user-preferences` will let players choose one.
- **Highlights** follow lichess: a translucent last-move tint, a selected-square tint, dots on empty targets, rings
  on captures, and a red glow on a king in check.
- **Moving** pieces slide (200 ms), for your moves and your opponent's. You can drag or click-click. While your
  opponent thinks you can **premove** once: the move is played as soon as it is your turn, if it is still legal.
- **Arrows and circles**: right-drag draws an arrow, right-click a circle. They clear when the position changes.

In the code:

- `react-chessboard` 5.12.1 (MIT, React 19, last release 2026-08-16) replaces the hand-written grid in
  `components/games.tsx`. The board is rendered in the browser only. The server renders an empty board of the same
  size and colours, so the layout does not shift.
- The 12 Cburnett SVGs go into `apps/frontend/public/pieces/cburnett/`, taken from Wikimedia Commons under their
  3-clause BSD option, with an attribution in `apps/frontend/ATTRIBUTION.md`.
- The promotion picker uses the same piece images.
- Out of scope: other piece sets, choosing a theme (`user-preferences`), captured pieces and move navigation
  (`game-page-navigation`), sound (rejected by the owner), and image boards (lichess's are AGPL).

## Capabilities

### New Capabilities

- `chessboard`: how the board looks (pieces, theme, highlights) and how a player moves on it (click, drag, premove,
  arrows), on the game page and the study page.

### Modified Capabilities

- `play-ui`: the game page's board requirement gains premove and the check highlight; the server still decides every
  move (unchanged).

## Impact

- **Frontend:** `components/games.tsx` (`Board`, `PromotionPicker`, a shared `PieceImage`), new `lib/board.ts`
  (pure helpers: square styles, premove), `styles.css` (board theme tokens), `routes/_authenticated/games.$id.tsx`
  and `studies.$id.tsx` (drop and premove wiring), `public/pieces/cburnett/*.svg`, `ATTRIBUTION.md`.
- **Dependency:** `react-chessboard` 5.12.1, exact pin (it brings `@dnd-kit/core` and `@dnd-kit/modifiers`).
- **Tests:** vitest for `lib/board.ts` and the board wrapper. The e2e helpers keep using `[data-square=…]`, which
  react-chessboard renders on every square.
- **Backend:** none.
