## 1. Titles and router screens

- [x] 1.1 Failing vitest: `pageTitle('History')` is "History · Chess", `pageTitle()` is "Chess". Implement in
      `lib/feedback.ts`; `head` on every authenticated route.
- [x] 1.2 Failing component tests: `RouteError` shows the message, "Try again" calls back, a Home link; `NotFound` has a
      Home link; `PendingBar` renders a progressbar. Implement in `components/layout.tsx`; wire as router defaults
      (`defaultPendingMs` 300). Commit: `feat(frontend): page titles, error and not-found screens`.

## 2. Lists and home

- [x] 2.1 Failing vitest for `useLoadMore` (appends, `busy`, error keeps items). Implement in `lib/`; use on History
      (built with live-home's Watch page; Studies loads its list at once and has no "Load more").
- [x] 2.2 Home: "View all" on Recent games; `RecentGames` empty state with a quick-pairing hint (component test).
      Commit: `feat(frontend): load-more states and a way on from recent games`.

## 3. Defects from the audit

- [x] 3.1 Component tests then fixes: OptionTile `figureSize`; study header drops `*`; reason capitalised in
      `GameResultPanel` (shared `reasonLabel`); styled PGN file picker; `ErrorText` `role="alert"`; `BoardPlaceholder`
      `role="group"`; Escape closes the TopBar menu; avatar on site tokens; `NavItem exact`. Commit:
      `fix(frontend): audit fixes`.
- [ ] 3.2 `nx run-many -t lint test -p frontend` green; screenshots again at 1366 and 390 px to confirm.
- [ ] 3.3 🐳 Playwright: History's title, `/nowhere` shows the not-found panel inside the shell (`e2e/responsive.spec.ts`
      or a new `e2e/shell.spec.ts`). `tools/e2e.sh`.

## 4. Docs

- [ ] 4.1 CLAUDE.md UI note (titles via `pageTitle`, router defaults, `useLoadMore`). Commit: `docs(repo): ui-polish`.
