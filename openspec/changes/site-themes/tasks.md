Each group ends in one commit that passes the frontend gate (`pnpm typecheck && pnpm lint && pnpm check && pnpm test
&& pnpm build`) or, for the backend step, `dotnet build` + `./build_test.sh`. 🐳 marks live-stack steps. Needs
`user-preferences` first.

## 1. Game-type colours

- [x] 1.1 Failing test for `categoryOf`: `1+0` → bullet, `3+2` → blitz, `10+0` → rapid, `30+0` → classical,
      `7d` → correspondence, `untimed` → computer. Implement, with `category()` built on it.
- [x] 1.2 `--color-tc-*` tokens, the `OptionTile` colour bar, and the markers on history, "Your turn" and the game header.
      Commit: `feat(frontend): a colour per game type`.

## 2. Icons

- [ ] 2.1 Add `lucide-react` 1.49.0 (exact). Rail, tiles and game actions get icons. A component test checks that
      every icon-only button has an `aria-label`. Commit: `feat(frontend): icons on navigation and actions`.

## 3. Light theme

- [ ] 3.1 Failing contrast test (it fails because the light block does not exist yet). Then the
      `[data-theme=light]` block and `color-scheme`.
- [ ] 3.2 Backend: `Preferences` accepts `light` (unit test first). Frontend: the Light option on `/settings`.
      Commits: `feat(backend): light site theme preference`, `feat(frontend): light site theme`.

## 4. Verify

- [ ] 4.1 🐳 Playwright: choose Light, reload, and the page background is the parchment value. `tools/e2e.sh`.
- [ ] 4.2 CLAUDE.md UI note: "dark by default, light optional; game-type tokens; lucide icons". Commit:
      `docs(repo): site-themes`.
