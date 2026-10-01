Each group ends in one commit that passes the frontend gate: `pnpm typecheck && pnpm lint && pnpm check && pnpm test
&& pnpm build` (from `apps/frontend`). 🐳 marks steps that need the live stack.

## 1. Pieces and theme tokens

- [ ] 1.1 Add the 12 Cburnett SVGs (Wikimedia Commons `Chess_{k,q,r,b,n,p}{l,d}t45.svg`) as
      `public/pieces/cburnett/{w,b}{K,Q,R,B,N,P}.svg` and `ATTRIBUTION.md` (author, source URL, BSD-3 text).
- [ ] 1.2 Write a failing test first: `PieceImage` renders `/pieces/cburnett/wN.svg` with `alt=""` (it fails because
      the component does not exist). Add `PieceImage` to `components/games.tsx` and use it in `PromotionPicker`.
      Remove `GLYPH`/`TEXT`.
- [ ] 1.3 Board theme tokens in `styles.css` (`--board-*`, five `[data-board]` blocks, Brown as the default).
      Commit: `feat(frontend): cburnett pieces and lichess board themes`.

## 2. Highlights as data

- [ ] 2.1 Failing tests for `lib/board.ts#squareStyles`: last move, selection, dot vs ring targets, the check square
      after 4.Qxf7+ (they fail with "squareStyles is not a function"). Then implement `squareStyles` and
      `checkSquare(fen)`.
- [ ] 2.2 Failing tests for `resolvePremove(fen, premove)`: legal now → the move, blocked → null, promotion → `q`.
      Implement. Commit: `feat(frontend): board highlights and premove rules`.

## 3. react-chessboard behind Board

- [ ] 3.1 Add `react-chessboard` 5.12.1 (exact pin). Write a failing wrapper test: before mount the placeholder has 64
      `[data-square]` cells and no images; after mount the library board is present. Then rewrite `Board` (same
      props plus `onMove`, `canDrag`, `premove`, `arrows`), `BoardPlaceholder` and the reduced-motion duration.
- [ ] 3.2 Game page: click and drop share `move()`. Studies page likewise. The e2e helper `support.ts` still clicks
      `[data-square]`. Commit: `feat(frontend): react-chessboard board with slide, drag and arrows`.

## 4. Premove

- [ ] 4.1 Game page premove state: queue it while the opponent is to move (timed games only), highlight it, resolve it
      on each new `seq`, cancel it on an empty-square click or a right-click. Write the component test first: a
      frame that makes it my turn triggers exactly one POST. Commit: `feat(frontend): premove`.

## 5. Verify

- [ ] 5.1 🐳 Playwright: add a drag spec (`dragTo` e2→e4) and a premove spec (two browsers); run all specs with
      `tools/e2e.sh`. Run `tools/localdev/verify-part1.sh` to confirm the server contract is unchanged.
- [ ] 5.2 Update CLAUDE.md's UI note (react-chessboard, Cburnett and attribution, Brown default, browser-only board)
      and `.serena/memories/frontend/core.md`. Commit: `docs(repo): board-look`.
