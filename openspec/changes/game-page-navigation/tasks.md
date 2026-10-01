Each group ends in one commit that passes the frontend gate (`pnpm typecheck && pnpm lint && pnpm check && pnpm test
&& pnpm build` in `apps/frontend`). 🐳 marks steps that need the live stack. Needs `board-look` first.

## 1. Pure helpers

- [ ] 1.1 Failing tests for `material(fen)`: equal material, White +3, a promoted queen (they fail with "material is
      not a function"). Implement in `lib/games.ts`.
- [ ] 1.2 Failing tests for `fensAfter(sans)`: an empty list gives `[start]`, `['e4','e5']` gives 3 FENs, and an
      appended move extends the result. Implement. Commit: `feat(frontend): material and replayed positions`.

## 2. Components

- [ ] 2.1 `PlayerStrip` shows captured pieces (`PieceImage`, small and overlapping) and `+N`. Write the component test
      first.
- [ ] 2.2 `MoveList` takes `viewPly` and `onSelect`, makes each SAN a button and highlights the viewed one. `MoveNav`
      bar shared with the study page. Commit: `feat(frontend): captured pieces, clickable moves, nav bar`.

## 3. Game page

- [ ] 3.1 `viewPly` state, read-only board while looking back, "Back to the game", the keydown listener, and flip
      (`f` and a button). Component test first: ← shows the previous FEN, and a frame does not move the view.
      Commit: `feat(frontend): move navigation and flip on the game page`.

## 4. Verify

- [ ] 4.1 🐳 Playwright: after three moves, ← shows the previous position (`[data-square]` contents) and `f` flips the
      board. `tools/e2e.sh`.
