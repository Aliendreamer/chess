## Why

`board-look` defines five board themes, and `site-themes` will add a light site theme, but nothing lets a player pick
one. Settings kept in `localStorage` would flash the default theme on every server-rendered page and would not follow
the player to another device. The owner accepted proposal P9 on 2026-10-01.

Part 5 (look and feel), fourth change. Depends on `board-look` (board themes). `site-themes` adds its own value to the
site-theme setting defined here.

## What Changes

For a player:

- A **Settings** page (`/settings`, linked from the rail under the user's name) with: board theme (Brown, Blue,
  Green, Slate, Club walnut, with a live preview board), piece animation (off, fast 120 ms, normal 200 ms), coordinates
  on/off, and site theme (Dark for now; `site-themes` adds Light). Each change is saved at once and applies at once.
- The choices **follow the account**: any device, and the first server-rendered paint, already use them.

In the code:

- A nullable `preferences` jsonb column on `users`, migrated with defaults applied in code when it is null.
- `GET /api/me/preferences` and `PUT /api/me/preferences` (the whole object, validated: unknown values are 400),
  cached per user in FusionCache and evicted on PUT.
- The BFF loads preferences together with `getMe()` in `_authenticated.beforeLoad`. The Shell root gets
  `data-board`, `data-theme` and `data-coords`, and the board reads the animation speed from the router context.
- Out of scope: piece-set choice (only Cburnett for now; the field exists with one value), sound (declined),
  per-device overrides.

## Capabilities

### New Capabilities

- `user-preferences`: what a user can set, where it is stored, and that it is applied on the first paint.

### Modified Capabilities

None.

## Impact

- **Backend:** `Data/Models/User.cs` (+ `Preferences`), its configuration, an EF migration
  (`./build_migration.sh "AddUserPreferences"`), `WebApi/Me/{Get,Put}Preferences/` (endpoints, validator),
  `Authentication/Preferences.cs` (the record, its allowed values, and `PreferencesService`: read through the cache,
  write, evict).
- **Frontend:** `lib/auth.ts` (types, defaults, `PreferencesContext`), `lib/server/auth.ts` + `api.ts`, `_authenticated.tsx`,
  `components/layout.tsx` (attributes, Settings link), new route `routes/_authenticated/settings.tsx`, and
  `components/settings.tsx`.
- **Tests:** validator and service unit tests, an integration round-trip, vitest for the settings form, and one
  Playwright check that a chosen theme survives a reload.
