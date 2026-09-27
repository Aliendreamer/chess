## Why

The frontend has the same problems the backend had before `backend-layout`:

- **Tiny files.** Five 30–54 line design primitives each have their own file, and so do three chess widgets, a
  16-line session helper and a 21-line ping type.
- **One-file folders.** `lib/auth/`, `components/navigation/`, `components/play/` and `src/test/` each hold a
  single file.
- **Server code split by history, not by feature.** Reads live in `api-loaders.ts`, `game-loaders.ts` and
  `play-loaders.ts`, the live hub is spread over three files, and the same login redirect is copied three times.

There is also dead code left over from the scaffold. This change applies the backend's two rules to the frontend
and cleans up as it goes.

## What Changes

Target tree under `apps/frontend/src/`. Only files that change are listed; tests follow their source (`x.ts` →
`x.test.ts`).

```text
components/
  ui.tsx          ← core/Button, Chip, OptionTile, Panel (+SectionHeading)      Badge.tsx deleted (unused)
  layout.tsx      ← Shell.tsx + navigation/Navigation.tsx                      unused Wordmark `version` and
                                                                               NavItem `badge` props dropped
  games.tsx       ← chess/Board (+PromotionPicker), chess/Clock (+PlayerStrip),
                    chess/MoveList, play/RecentGames
  pings.tsx       ← PingFeed.tsx                                               `relayUrl` wrapper dropped
lib/
  auth.ts         ← auth/session.ts + the `Me` type (moved out of lib/server)  unused login()/logout()
                                                                               dropped; one `loginHref()`
  live.ts         ← live.ts + useLiveTopic.ts (frames, applyFrame, the hook)
  games.ts, play.ts, pings.ts, moveInput.ts                                    unchanged
lib/server/
  api.ts          server functions + input validation                         unchanged role; its GUID
                                                                               check shared, not copied
  upstream.ts     ← config.ts (env) + the shared fetch helpers from game-loaders (problemMessage, readJson,
                    postCommand, the login redirect and GUID check that are copied today)
  cookies.ts      unchanged (the whole cookie contract, as CLAUDE.md says)
  auth.ts         ← auth-proxy.ts + loadMe (from api-loaders)
  games.ts        ← game-loaders.ts + pgn-download.ts
  play.ts         ← play-loaders.ts
  pings.ts        ← the ping reads from api-loaders.ts
  live-relay.ts   ← live-relay.ts + dev-live-relay.ts (the relay and its `vite dev` host)
  live-hub.ts     ← hub-multiplexer.ts + live-hub.ts + service-token.ts (one SignalR connection per process)
testing.ts        ← test/live-fakes.ts
```

- **Unchanged:** `routes/` (one page per file is already one feature per file), `styles.css`, `router.tsx`,
  `e2e/` (Playwright needs `auth.setup.ts` as its own file). Route imports switch to `#/…`; the two relative
  `../../../lib/server/…` imports go.
- **Removed as unused:** `components/core/Badge.tsx`, `hasRole`/`ADMIN_ROLE` (tests only), the `/forbidden` route
  (nothing links or redirects to it), and the `@/*` path alias (nothing uses it; `#/*` is the one alias).
- No behaviour change: same pages, same URLs, same cookies, same live frames.

## Owner decisions (confirmed 2026-09-27: keep the ping page; remove the unused scaffolding)

1. **The ping page (`/pings/$id`).** It is the Part 0 demo: a route, `components/pings.tsx`, `lib/pings.ts`,
   `lib/server/pings.ts`, and `e2e/pings.spec.ts`. Keep it as above, or remove it from the frontend? The backend
   ping stays either way, because `verify-part0.sh` and the integration tests use it. Recommendation: keep it
   for now. It is the only e2e check of a plain live topic, and removing it is a product decision, not tidying.
2. **The removals above** (`/forbidden`, `hasRole`/`ADMIN_ROLE`, `Badge`). They are scaffold for an admin UI that
   does not exist. Recommendation: remove them; bring them back with the first admin page.

## Capabilities

### New Capabilities

- `frontend-layout`: how the frontend is organised (no tiny files, grouping by feature, no one-file folders, the
  client/server boundary under `lib/server/`, a single import alias).

### Modified Capabilities

None. No behaviour changes.

## Impact

- **Code:** `apps/frontend/src/**`, `apps/frontend/server/routes/api/ws/live/[kind]/[id].ts` (import path),
  `apps/frontend/vite.config.ts` (the dev relay import), and `tsconfig.json` (drop `@/*`).
- **Docs:** CLAUDE.md's BFF, live relay and UI notes name the old files and are updated.
- **Tests:** vitest files merge along with their sources; e2e specs are unchanged.
