Each group ends in one commit that passes the frontend gate (`pnpm typecheck && pnpm lint && pnpm check && pnpm test
&& pnpm build` in `apps/frontend`). 🐳 marks steps that need the live stack. Needs `board-look` first.

## 1. Pure helpers

- [x] 1.1 Failing tests for `material(fen)`: equal material, White +3, an uneven trade, a promoted queen (they fail with
      "material is not a function"). Implement in `lib/board.ts`.
- [x] 1.2 Failing tests for `replay(sans)`: an empty list gives the start, three moves give four positions with the
      move squares, and an unreadable move stops the replay. Implement. Commit: `feat(frontend): material and replayed positions`.

## 2. Components

- [x] 2.1 `PlayerStrip` shows the material surplus (`PieceImage`, small and overlapping) and `+N`. Write the component test
      first.
- [x] 2.2 `MoveList` takes `viewPly` and `onSelect`, makes each SAN a button and highlights the viewed one. `MoveNav`
      bar shared with the study page. Commit: `feat(frontend): material, clickable moves, nav bar`.

## 3. Game page

- [x] 3.1 `viewPly` state, read-only board while looking back, "Back to the game", the keydown listener, and flip
      (`f` and a button). Component test first: ← shows the previous FEN, and a frame does not move the view.
      Done: the parts are component-tested (`MoveList`, `MoveNav`, `PlayerStrip`) and the pure rules in
      `lib/board.test.ts`; the route wiring is covered by the 4.1 Playwright steps (route files have no vitest harness).
      Commit: `feat(frontend): move navigation and flip on the game page`.

## 4. Verify

- [ ] 4.1 🐳 Playwright (written, in `play.spec.ts`; needs the stack): after three moves, ← shows the previous position (`[data-square]` contents) and `f` flips the
      board. `tools/e2e.sh`.
