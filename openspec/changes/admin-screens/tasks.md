## 1. BFF

- [ ] 1.1 Failing vitest: `lib/server/admin.ts` builds the list path (limit, cursor, groupId) and maps replay 200 and
      409 to outcomes, 403 to an error outcome; `lib/admin.ts#isAdmin`, group and aggregate validation. Implement,
      plus `getDeadLetters` / `postReplayDeadLetters` in `api.ts`.

## 2. Page

- [ ] 2.1 Failing component tests (`components/admin.test.tsx`): `DeadLetterList` rows, empty state, the error
      `<details>`, Replay calling back with group and aggregate and showing the outcome.
- [ ] 2.2 `routes/_authenticated/admin.tsx` (`beforeLoad`: `notFound()` without `Admin`), filter chips, "Load more";
      Navigation takes `me` and shows Admin (`Shield` icon) to admins. `pnpm generate-routes`;
      `nx run-many -t lint test -p frontend`. Commit: `feat(frontend): dead letters for admins`.
- [ ] 2.3 🐳 Playwright `e2e/admin.spec.ts`: testuser sees the Admin entry and the page (empty state or rows); player
      gets the not-found page at `/admin`. `tools/e2e.sh`.

## 3. Docs

- [ ] 3.1 CLAUDE.md (admin page, keep `lib/admin.ts` groups in step with `IProjection`). Commit:
      `docs(repo): admin-screens`.
