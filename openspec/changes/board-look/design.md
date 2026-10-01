## Context

`components/games.tsx#Board` is a 64-button CSS grid with Unicode glyphs, used by the game page and the study page.
Click-to-move goes through `lib/moveInput.ts#clickSquare`, and every move is sent to the server and shown at once with
chess.js (`applyOptimistic`); the server's answer or the next frame always wins (play-ui). The e2e helpers click
`[data-square=…]`. The owner chose react-chessboard over our own board and over chessground (GPL-3.0 conflicts with
the planned MIT licence), on condition that it is maintained. It is: 5.12.1 was released on 2026-08-16, it is MIT,
it peers on React 19, and it has about 48k weekly downloads.

## Goals / Non-Goals

**Goals:** the lichess look (Cburnett pieces, Brown board, lichess highlights) and feel (slide, drag, premove, arrows)
on every board, with no change to the server contract.

**Non-Goals:** choosing themes or piece sets in the UI (`user-preferences`), captured pieces, navigation and flip
(`game-page-navigation`), sound, image boards.

## Decisions

1. **react-chessboard behind our own `Board` wrapper.** The pages keep calling `<Board fen orientation lastMove …>`.
   The wrapper maps our props onto `ChessboardOptions`: `position` (FEN), `boardOrientation`, `pieces` (Cburnett
   `<img>` renderers), `squareStyles` (highlights), `onSquareClick`, `onPieceDrop`, `canDragPiece`,
   `allowDrawingArrows`, `clearArrowsOnPositionChange`, `animationDurationInMs: 200` (0 under
   `prefers-reduced-motion`). If we ever swap the library again, only the wrapper changes.
   _Alternative:_ extend our own grid (FLIP animation, pointer drag). Rejected by the owner in favour of a maintained
   library.
2. **Browser-only rendering with a same-size placeholder.** The wrapper renders `BoardPlaceholder` (the 8×8 grid in
   theme colours, no pieces, `data-square` kept) until mounted (`useHydrated` pattern: a `useEffect` flips a flag).
   The owner finds the SSR-then-hydrate board odd, and dnd-kit needs the DOM anyway. The placeholder keeps the page
   from shifting.
3. **Highlights are data, computed in `lib/board.ts`.** `squareStyles({ lastMove, selected, targets, check, premove,
pieces })` returns a `Record<square, CSSProperties>` that uses theme variables (`var(--board-last)`, …). The king in
   check comes from chess.js (`isCheck()` plus the side to move's king square). This is pure and unit-tested.
4. **One move path for click and drag.** `onPieceDrop` and `onSquareClick` both end in the page's
   `move(from, to)`, which keeps today's promotion check, optimistic FEN and POST. `onPieceDrop` returns `false` for
   an illegal target, so the library puts the piece back.
5. **Premove lives in the game page, its rules in `lib/board.ts`.** While it is not my turn, `canDragPiece` allows my
   pieces, and a drop or click-click stores `{ from, to }` (one only). An effect keyed on the view's `seq` calls
   `resolvePremove(fen, premove)`, which returns the move if it is legal now, otherwise null, then clears the
   premove. Disabled for studies, `7d` and engine games (no waiting worth premoving). A promotion premove promotes to
   a queen.
6. **Theme tokens.** `styles.css` gets `--board-light`, `--board-dark`, `--board-last`, `--board-selected`,
   `--board-target`, `--board-premove`, with a `[data-board=…]` block per theme. Brown is the root default. The
   existing `--color-board-*` tokens are replaced. `user-preferences` will set `data-board` on `<html>`.
7. **Pieces as static files.** The 12 SVGs total about 15 KB and are served from `public/pieces/cburnett/` as
   `<img draggable=false alt="">`. The square keeps the accessible name, not the image.

## Risks / Trade-offs

- [The library's squares are `div`s, not buttons, so keyboard play is lost] → The board gets `aria-label` and a
  visually hidden `aria-live` line naming the last move. Keyboard move entry is a follow-up if anyone needs it (it
  does not work today either: the buttons are only clickable).
- [jsdom and dnd-kit in vitest] → Unit tests cover `lib/board.ts` and the wrapper's prop mapping. Drag is covered by
  one Playwright spec (`page.dragTo`).
- [A library re-render could fight our optimistic FEN] → `position` is always our `fen` prop. The library animates
  the diff between consecutive positions, so a refused move snaps back with an animation, which is fine.
- [Premove sent on a stale view] → The server refuses it as an ordinary illegal or out-of-turn move, and the board
  snaps back (unchanged rule).

## Migration Plan

Frontend only: deploy, and roll back by redeploying the previous image tag.

## Open Questions

None. The theme choice is delivered by `user-preferences`.
