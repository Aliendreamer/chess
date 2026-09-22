# Frontend — apps/frontend (chess-frontend, TanStack Start SSR BFF)

TanStack Start 1.168 / Router 1.170 (file-based), React 19, Vite 8, Tailwind v4, Vitest 4 + RTL,
Playwright e2e, TS 6 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint
`@tanstack/eslint-config`, Prettier (no semis, single quotes). Nitro `node-server` output → `.output/server/index.mjs`.
Built from the `fe-ssr-tanstack` prompt. No i18n/TanStack Store/Query (dropped as optional).

## Layout (`src/`)

- `router.tsx` — `getRouter()` with `context: { me: null }`.
- `routes/__root.tsx` — `createRootRouteWithContext<RouterContext>`, `shellComponent` HTML document.
- `routes/_authenticated.tsx` — pathless layout: `beforeLoad` → `getMe()`; null ⇒ `redirect` to
  `/api/auth/login?returnTo=<location.href>`; renders `IdentityBar` + `Outlet`.
- `routes/_authenticated/index.tsx` — loader `settle(getHealth())` → `<Dashboard>`; `forbidden.tsx`.
- `routes/api/auth/$.ts` — PUBLIC proxy route (`server.handlers` GET/POST → `proxyAuth`); needs
  `import type {} from '@tanstack/react-start'` for tsc.
- `lib/server/cookies.ts` (pure, tested), `auth-proxy.ts` (`proxyAuth(request, splat, fetchImpl, env)`),
  `api-loaders.ts` (pure: `loadMe` 401→null, `loadHealth` 401→redirect, `settle` rethrows redirects),
  `api.ts` (`createServerFn` `getMe`/`getHealth` using `serverFetch()` which re-attaches the cookie and
  prefixes `API_URL`), `config.ts` (`apiUrl()` throws without `API_URL`).
- `server/routes/api/ws/pings/[id].ts` — Nitro-scanned WebSocket relay: cookie → SignalR client → backend
  `/hub/pings`, frames back to the browser. Needs `scanDirs: ['server']` + `experimental.websocket` in
  `nitroV2Plugin`, and `externals.traceInclude` with resolved paths for ws/eventsource/fetch-cookie/
  tough-cookie (signalr loads them through an indirect `requireFunc`, invisible to node-file-trace — without
  it the built server throws "Cannot find module 'ws'" on the first socket).
- `lib/pings.ts` — wire types + `parseFrame`, deliberately OUTSIDE `lib/server/` because the browser
  component imports it. `lib/server/ping-relay.ts` = `mapHubMessage` + `pingIdFromUrl` (validates against the
  backend's `^[a-z0-9-]{1,64}$`). `components/PingFeed.tsx` owns the browser socket;
  `routes/_authenticated/pings.$id.tsx` SSRs from the actor.
- `lib/auth/session.ts` — `login()/logout()` same-origin navigations.
- `components/` — presentational (`Dashboard`, `Tile`, `IdentityBar`); `data-testid`s used by e2e.
- Tests: `src/**/*.test.ts(x)`; e2e in `e2e/{auth,pings}.spec.ts` (`playwright.config.ts`, `E2E_BASE_URL`).
  `pnpm test:coverage` = vitest v8 with 75% line/statement thresholds; routes, router, `api.ts` and the
  relay hosts are excluded because Playwright exercises them (same rule as the backend runsettings).

## Invariants / gotchas

- **No `VITE_API_URL`**; only server-side `API_URL` (+ `COOKIE_SECURE=true` behind TLS). Verified: built
  client bundles contain no API host.
- `__Host-`/`Secure` gated on `COOKIE_SECURE`, not `NODE_ENV`.
- `vite.config.ts` imports `defineConfig` from `vitest/config` (needed for the `test` key); plugin order
  devtools → tailwind → tanstackStart → nitroV2 → react.
- tsconfig: no `baseUrl` (TS 6 deprecates it); aliases `@/*` and `#/*` → `src/*` via `paths` + vite alias.
- Run `pnpm generate-routes` after route-file changes (`routeTree.gen.ts` is generated, prettier/eslint-ignored).
- No jest-dom: assert with `.textContent`.
- Dev container runs `vite dev --port 3000 --host 0.0.0.0`; prod image copies only `.output/`. The nitro
  plugin only runs on `build`, so **there is no relay (and no Nitro server routes) under `vite dev`**.
- The edge must route `/api/auth/` and `/api/ws/` to the frontend, not the API — nginx `location /api/`
  otherwise swallows both (fixed in `apps/proxy/files/nginx.conf` with `^~` locations + upgrade headers).
- `.prettierignore` exists per package: `pnpm check` runs prettier with cwd=apps/frontend, so the root one
  does not apply (Playwright's `test-results/` needs ignoring there).
- Quick local proof without Docker: run `.output/server/index.mjs` with `API_URL` pointing at any HTTP
  server implementing `/api/me`, `/health`, `/api/auth/*`.
