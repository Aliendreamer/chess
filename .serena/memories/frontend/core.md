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
- `lib/auth/session.ts` — `login()/logout()` same-origin navigations.
- `components/` — presentational (`Dashboard`, `Tile`, `IdentityBar`); `data-testid`s used by e2e.
- Tests: `src/**/*.test.ts(x)`; e2e in `e2e/auth.spec.ts` (`playwright.config.ts`, `E2E_BASE_URL`).

## Invariants / gotchas

- **No `VITE_API_URL`**; only server-side `API_URL` (+ `COOKIE_SECURE=true` behind TLS). Verified: built
  client bundles contain no API host.
- `__Host-`/`Secure` gated on `COOKIE_SECURE`, not `NODE_ENV`.
- `vite.config.ts` imports `defineConfig` from `vitest/config` (needed for the `test` key); plugin order
  devtools → tailwind → tanstackStart → nitroV2 → react.
- tsconfig: no `baseUrl` (TS 6 deprecates it); aliases `@/*` and `#/*` → `src/*` via `paths` + vite alias.
- Run `pnpm generate-routes` after route-file changes (`routeTree.gen.ts` is generated, prettier/eslint-ignored).
- No jest-dom: assert with `.textContent`.
- Dev container runs `vite dev --port 3000 --host 0.0.0.0`; prod image copies only `.output/`.
- Quick local proof without Docker: run `.output/server/index.mjs` with `API_URL` pointing at any HTTP
  server implementing `/api/me`, `/health`, `/api/auth/*`.
