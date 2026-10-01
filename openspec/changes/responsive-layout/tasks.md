Each group ends in one commit that passes the frontend gate (`pnpm typecheck && pnpm lint && pnpm check && pnpm test
&& pnpm build`). 🐳 marks live-stack steps. Builds on `board-look` and `game-page-navigation`.

## 1. Measure first

- [x] 1.1 🐳 (written; running it needs the stack) Add the Playwright `mobile` project and the "no horizontal scroll on every route" spec. It fails today on
      the home and game pages (the rail takes 248 px). Commit: `test(frontend): mobile viewport project`.

## 2. Shell

- [x] 2.1 `--breakpoint-shell`, the top bar with the `<details>` menu, and the rail from 900 px up. Component test
      first: the menu contains every nav link and Log out. Commit: `feat(frontend): top bar on narrow screens`.

## 3. Pages

- [x] 3.1 Game page stacking and the `MoveList` `line` layout (test first: the latest move is the last child and is
      scrolled into view).
- [x] 3.2 Home, history (two-line rows), invites, studies (board above the tree). Commit:
      `feat(frontend): every page responsive`.

## 4. Touch

- [x] 4.1 `pointer: coarse` sizes for buttons, chips and inputs. Commit: `feat(frontend): touch-sized controls`.

## 5. Verify

- [ ] 5.1 🐳 (needs the stack and a phone) `tools/e2e.sh` with both projects green, and a manual check on a real phone through
      `app.chess.localhost` (human).
- [x] 5.2 CLAUDE.md UI note (breakpoint, top bar, mobile project). Commit: `docs(repo): responsive-layout`.
