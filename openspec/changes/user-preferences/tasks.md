Each group ends in one commit that passes the gate of the app it touches (backend: `dotnet build` with the sandbox
flags + `./build_test.sh`, `dotnet format --verify-no-changes` human-run; frontend: `pnpm typecheck && pnpm lint &&
pnpm check && pnpm test && pnpm build`). 🐳 marks Docker or live-stack steps. Needs `board-look` first.

## 1. Model and storage (backend)

- [x] 1.1 Failing unit tests for `Users/Preferences.cs`: the defaults, and `Preferences.Allowed` rejecting `neon`
      (they fail because the type does not exist). Implement the record, the allowed sets and the defaults.
- [x] 1.2 `User.Preferences` (jsonb, nullable), its configuration, and the migration `AddUserPreferences`
      (`./build_migration.sh`). Commit: `feat(backend): user preferences model`.

## 2. Endpoints (backend)

- [x] 2.1 `PreferencesService` (read through FusionCache, write, evict) with unit tests first. The TTL is
      `Cache:PreferencesMinutes` on the existing `CacheOptions` (in `appsettings.json`, `SettingsTests` updated).
- [x] 2.2 `WebApi/Me/{Get,Put}Preferences/` (`SignedIn`, validator, `no-store`). 🐳 Integration test (written,
      `PreferencesFlowTests`; needs Docker): PUT then GET
      round-trips, and a bad value is 400 and leaves the stored value unchanged. Commit:
      `feat(backend): preferences endpoints`.

## 3. BFF and apply on first paint (frontend)

- [ ] 3.1 `lib/preferences.ts` (types, defaults, allowed values, the drift test against the backend fixture),
      `lib/server/preferences.ts`, the `api.ts` server functions.
- [ ] 3.2 `_authenticated.beforeLoad` loads both. The Shell sets `data-board`/`data-theme`/`data-coords`, and `Board`
      reads the animation speed. Component test first: the Shell renders `data-board="blue"` for Blue preferences.
      Commit: `feat(frontend): preferences applied on the first paint`.

## 4. Settings page (frontend)

- [ ] 4.1 `routes/_authenticated/settings.tsx` + `components/settings.tsx` (theme swatches with a preview board,
      animation, coordinates, site theme) and a rail link. Test first: a failed save puts the control back.
      Commit: `feat(frontend): settings page`.

## 5. Verify

- [ ] 5.1 🐳 Playwright: choose Blue, reload, and the board's light square is #dee3e6. `tools/e2e.sh`.
- [ ] 5.2 CLAUDE.md (preferences note) and Serena memory. Commit: `docs(repo): user-preferences`.
