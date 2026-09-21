# FE — TanStack Start SSR BFF frontend

A reusable build playbook for the **frontend half** of the SSR BFF stack: a TanStack Start (SSR) app that is itself the
BFF. The browser only ever talks to `app.<slug>.localhost`; this server proxies `/api/auth/*` to an internal API and
fetches page data **server-to-server** via server functions. No API host, no token, no `VITE_API_URL` in the client
bundle.

Pairs with a cookie-session .NET API — see `dotnet-webapi`, and build it in its
**private behind an SSR BFF** mode. Both apps drop into the `nx-monorepo` workspace skeleton, which supplies the
Nx wiring, the local-dev stack and the nginx proxy that fronts them in production. Follow this top to bottom.

## Architecture — the organizing rule

> **The always-on SSR server is the BFF. The browser has exactly one origin (`app.`). The .NET API still owns the
> tokens but is unreachable from the internet — only the SSR server (same network) calls it.**

```text
                         app.<slug>.localhost  (the ONLY browser origin)
Browser ──app-host cookie──► SSR server (TanStack Start) ──server-to-server──► .NET API ──► Keycloak
   │                          │  • /api/auth/$ proxy (re-homes cookies)        (internal   (exchange +
   │                          │  • server fns fetch data w/ forwarded cookie    only)        refresh)
   └── login form ◄───────────┴──► keycloak.<slug>.localhost (302s relayed by the proxy)
```

- **Auth proxy**: `app./api/auth/{login,callback,logout}` → SSR route forwards to `API/api/auth/*` server-to-server,
  **re-homes** each `Set-Cookie` (strip the API's `Domain`; app host-only; `__Host-`+`Secure` in prod) and relays
  status + `Location`.
- **Data**: route loaders call **server functions** (`createServerFn`) that run on the SSR server, re-attach the
  session cookie, and fetch the internal API. Pages render **with data** (SSR-with-data).
- **Gate**: an `_authenticated` pathless layout route's `beforeLoad` calls `getMe()` server-side and redirects
  anonymous requests to the login proxy; `me` goes into router context for every child route. **No client `/me`
  probe, no `AuthProvider`.**

The cookie is **app-host-only** (not shared across subdomains), because the browser never needs to send it to the
API — only to `app.`, which forwards it inward. That single origin with `Path=/` and no `Domain` is exactly what
lets prod use the `__Host-` prefix.

## How Claude must work on this

- **Ask me for one thing first** (STEP 0), then build everything.
- **Use Serena** for ALL code search/reading/editing (`get_symbols_overview`, `find_symbol`, `read_file`, `list_dir`,
  symbol edits) — never raw grep/sed/cat for code.
- **Use OpenSpec** if the repo uses it: `/opsx:propose` → `/opsx:apply` → `openspec validate <name> --strict` → archive.
  Otherwise implement directly.
- Conventional commits, **lowercase subject** (commitlint `subject-case`). Don't push or open PRs unless asked.
- Verify with real builds/tests before claiming done.

## STEP 0 — ask, then stop and wait

Ask me for **exactly one value**: the **FE project name** → pnpm package `<fe-name>` (kebab-case). Derive a lowercase
`<slug>` for hosts (`app.<slug>.localhost`). The only API config is the **server-side** `API_URL` (e.g.
`http://<be-service>:8080`); it is never exposed to the client.

## Outcome (what exists when done)

- Anonymous visit to `app.<slug>.localhost` → SSR guard 302s to `/api/auth/login`.
- After Keycloak login → app renders **server-side, with data** ("Hello, …" + roles + live tiles), no client "Loading…".
- The browser only ever opens `app.` (and `keycloak.`); the API host is never referenced in the client.
  Logout/revocation bounce back to login.

## Stack (pin exact versions; bump to current at build time)

TanStack Start (SSR) + TanStack Router (file-based) + TypeScript strict + Tailwind v4 + native `fetch` (no axios) +
(optional) react-i18next/TanStack Store. Vitest + RTL. pnpm, `save-exact`. Prod served by **srvx** (or Nitro
`node-server`). **Two SSR deltas vs a plain SPA baseline:** drop the browser API client (data comes from server
functions, so TanStack Query is optional), and **never add `VITE_API_URL`** — the only API config is the server-side
`API_URL`.

### `package.json` (baseline; drop Query if you don't use it client-side)

```jsonc
{
  "name": "<fe-name>",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@11.5.2",
  "imports": { "#/*": "./src/*" },
  "scripts": {
    "dev": "vite dev --port 3000",
    "generate-routes": "tsr generate",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint",
    "format": "prettier --write . && eslint --fix",
    "check": "prettier --check .",
    "prepare": "husky",
  },
  "dependencies": {
    "@tailwindcss/vite": "4.3.0",
    "tailwindcss": "4.3.0",
    "@tanstack/react-start": "1.168.25",
    "@tanstack/react-router": "1.170.15",
    "@tanstack/react-router-ssr-query": "1.167.1",
    "@tanstack/router-plugin": "1.168.18",
    "@tanstack/react-store": "0.11.0",
    "@tanstack/store": "0.11.0",
    "i18next": "26.3.1",
    "i18next-browser-languagedetector": "8.2.1",
    "react-i18next": "17.0.8",
    "lucide-react": "1.17.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
  },
  "devDependencies": {
    "@commitlint/cli": "21.0.2",
    "@commitlint/config-conventional": "21.0.2",
    "@tailwindcss/typography": "0.5.20",
    "@tanstack/devtools-vite": "0.7.0",
    "@tanstack/eslint-config": "0.4.0",
    "@tanstack/nitro-v2-vite-plugin": "1.155.0",
    "@tanstack/router-cli": "1.167.17",
    "@testing-library/dom": "10.4.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "25.9.2",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    "cspell": "10.0.1",
    "eslint": "10.4.1",
    "husky": "9.1.7",
    "jsdom": "29.1.1",
    "lint-staged": "17.0.7",
    "prettier": "3.8.4",
    "typescript": "6.0.3",
    "vite": "8.0.16",
    "vitest": "4.1.8",
  },
}
```

- `.npmrc`: `save-exact=true` + empty `save-prefix=`.
- `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (supply-chain cooldown),
  `onlyBuiltDependencies: [esbuild, lightningcss, unrs-resolver, '@parcel/watcher']`.
- `vite.config.ts` plugin order: `devtools()`, `tailwindcss()`, `tanstackStart()`,
  `nitroV2Plugin({ preset: 'node-server' })`, `viteReact()`; path alias `@/* → src/*`.
- Tooling: ESLint (`@tanstack/eslint-config`), Prettier, cspell, husky + lint-staged + commitlint.

## Components to build (`<fe-name>`)

```text
src/
  router.tsx                      ← createRouter({ context: { me: null }, … })
  routeTree.gen.ts (generated)    ← run `pnpm generate-routes` after route changes
  styles.css, env.d.ts
  routes/
    __root.tsx                    ← createRootRouteWithContext<RouterContext>()
    _authenticated.tsx            ← beforeLoad guard + identity chip + Outlet
    _authenticated/
      index.tsx                   ← dashboard loader (server fns) → presentational tiles
      <page>.tsx …                ← per-feature loaders
      forbidden.tsx
    api/auth/$.ts                 ← PUBLIC auth proxy (NOT under _authenticated)
  lib/
    server/cookies.ts             ← rehomeSetCookie / forwardCookieHeader / cookiesAreSecure
    server/auth-proxy.ts          ← proxyAuth(request, splat)
    server/api-loaders.ts         ← Me, hasRole, load*(fetchImpl), settle()  (PURE, unit-tested)
    server/api.ts                 ← createServerFn getMe/get*… wrapping the loaders w/ serverFetch
    auth/session.ts               ← login(returnTo)/logout() → same-origin /api/auth/*
  components/…                    ← PRESENTATIONAL (data via props from loaders)
```

### `lib/server/cookies.ts` — pure cookie re-homing (unit-tested)

- `rehomeSetCookie(setCookie, secure)`: rewrite a `Set-Cookie` from the API into an app-scoped cookie — **strip
  `Domain`**, force `Path=/`/`HttpOnly`/`SameSite=Lax`, **preserve the lifetime** (`Max-Age`/`Expires`), and when
  `secure` add the **`__Host-` prefix + `Secure`**.
- `forwardCookieHeader(cookieHeader, secure)`: build the `Cookie` header sent to the API from the browser's incoming
  `Cookie` — keep **only** the auth cookies (`mp_sid`/`mp_pkce`) and map `__Host-…` names back to the bare API names.
- `cookiesAreSecure()`: `process.env.COOKIE_SECURE === 'true'` (see gotcha #4 — **not** `NODE_ENV`).

### `lib/server/auth-proxy.ts` — `proxyAuth(request, splat)`

Server-to-server proxy for `/api/auth/<splat>`:

1. `secure = cookiesAreSecure()`; `cookie = forwardCookieHeader(request cookie, secure)`.
2. `fetch(`${API_URL}/api/auth/${splat}${search}`, { method, headers: cookie?{cookie}:{}, redirect: 'manual' })`.
3. Build the browser response: relay `status`; copy `Location`; for each upstream `Set-Cookie` append
   `rehomeSetCookie(sc, secure)`; copy `content-type`; pass the body. `API_URL` is **server-side only**
   (`http://<be-service>:8080`).

### `routes/api/auth/$.ts` — the PUBLIC proxy route

```ts
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start"; // activates the `server` route-option augmentation for tsc
import { proxyAuth } from "../../../lib/server/auth-proxy";
const handler = ({
  request,
  params,
}: {
  request: Request;
  params: { _splat?: string };
}) => proxyAuth(request, params._splat ?? "");
export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handler, POST: handler } },
});
```

Keep this route **outside** `_authenticated` — login must be reachable while anonymous.

### `lib/server/api-loaders.ts` — pure loaders (unit-tested with a mock fetch)

- `Me {id, subject, email?, roles[]}` + `hasRole(me, role)` + `ADMIN_ROLE`.
- `loadMe(fetchImpl)`: `GET /api/me` → `401` ⇒ **`null`** (the guard redirects); other non-2xx ⇒ throw.
- `load<Resource>(fetchImpl)`: `GET /api/<resource>` → `401` ⇒
  **`throw redirect({ href: '/api/auth/login?returnTo=/' })`**; other non-2xx ⇒ throw `Error`.
- `settle(promise)`: wrap into `{data}` / `{error:true}` so one source's outage degrades only its tile — but **re-throw
  redirects** (`isRedirect(e)`) so a revoked session still bounces to login.

### `lib/server/api.ts` — server functions

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
function serverFetch(): typeof fetch {            // re-attach the session cookie, mapped back to the API name
  const secure = cookiesAreSecure()
  const cookie = forwardCookieHeader(getRequestHeader('cookie'), secure)
  return (input, init) => {
    const headers = new Headers(init?.headers)
    if (cookie) headers.set('cookie', cookie)
    return fetch(input, { ...init, headers })
  }
}
export const getMe       = createServerFn({ method: 'GET' }).handler(() => loadMe(serverFetch()))
export const get<Things> = createServerFn({ method: 'GET' }).handler(() => load<Things>(serverFetch()))
```

These run on the SSR server during SSR, and via RPC **to the same SSR server** on client navigation — so the
browser→app-only invariant holds even on in-app navigation.

### Routing — guard + context + SSR-with-data

- **`router.tsx`**: `createRouter({ routeTree, context: { me: null }, … })`.
- **`__root.tsx`**: `export interface RouterContext { me: Me | null }` +
  `createRootRouteWithContext<RouterContext>()({ … })`. No `AuthProvider`.
- **`_authenticated.tsx`** (pathless layout):

  ```ts
  beforeLoad: async ({ location }) => {
    const me = await getMe();
    if (!me)
      throw redirect({
        href: `/api/auth/login?returnTo=${encodeURIComponent(location.href)}`,
      });
    return { me };
  };
  ```

  Its component renders the identity chip + a Logout button (`logout()` from `lib/auth/session.ts`) and an `<Outlet/>`.
  Children read `me` via `Route.useRouteContext()`.

- **`_authenticated/index.tsx`** (and feature pages): a `loader` that
  `Promise.all([settle(getThis()), settle(getThat())])` and a component that reads `Route.useLoaderData()` and renders
  **presentational** components (data via props).
- **`lib/auth/session.ts`**: `login(returnTo)` →
  `window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`)`; `logout()` →
  `assign('/api/auth/logout')`. **Same origin** — no API host in the client.
- **Components are presentational**: they take resolved data + an `error` flag as props and render a degraded state when
  `error || !data`. No `useEffect` fetching, no loading state (SSR provides the data).

### Env, build, prod

- **No `VITE_API_URL`.** The only API config is the **server-side** `API_URL` (`http://<be-service>:8080`), read by the
  proxy + server functions. Never expose it to the client bundle. `env.d.ts` declares no API URL.
- **Prod serve**: the SSR server must actually **run** (it handles `/api/auth/*` + server-function RPC + SSR). With
  **srvx**: `srvx --prod -s ../client dist/server/server.js` (gotcha #2). With Nitro: `node .output/server/index.mjs`.
- **Dockerfile**: multi-stage; build with `pnpm --filter <fe-name> build`; runtime needs production deps present (the
  SSR entry imports framework code at runtime). Pass `API_URL` (and `COOKIE_SECURE=true` in real prod) as **runtime**
  env, not build args. `.dockerignore` excludes `dist`/`.output`/`.nitro`/`.tanstack`/`node_modules`/`.git`/`.env*`.

## Harness — `docker-compose.yml` + `harness/keycloak/<Realm>-realm.json`

A standalone harness for running this FE against a real API and a real Keycloak. **If you are in an `nx-monorepo`
workspace, use its `tools/localdev/` stack instead** — it already wires Postgres, Redis, Keycloak and every app
together, and this section is redundant.

Services; **only the proxy publishes a port**, and there is **no `api.` router**:

- `proxy` (Traefik v3): `ports: ["80:80"]`. Routing via the provider you can negotiate with — **docker labels** if the
  daemon allows, else the **file provider** (`harness/traefik/dynamic.yml`); see gotcha #8. Routes: `app.→<fe>:3000`,
  `keycloak.→keycloak:8080`. **Define no `api.` route.**
- `postgres` (17-alpine): healthcheck.
- `keycloak` (26): `start-dev --import-realm`; `KC_HOSTNAME=http://keycloak.<slug>.localhost`,
  `KC_HOSTNAME_STRICT=false`, `KC_HTTP_ENABLED=true`, `KC_PROXY_HEADERS=xforwarded`; mount `./harness/keycloak`.
- `<be-service>` (build the BE — see `dotnet-webapi`): Authority
  `http://keycloak.<slug>.localhost/realms/<Realm>`, ClientId `<slug>_api`, secret,
  **`CallbackUri=http://app.<slug>.localhost/api/auth/callback`**, AppBaseUrl/PostLogout
  `http://app.<slug>.localhost`, `SessionCookies__Domain=.<slug>.localhost`, Postgres conn;
  **`extra_hosts: ["keycloak.<slug>.localhost:host-gateway"]`**. **No Traefik route** — internal only.
- `<fe>` (build this app): env **`API_URL=http://<be-service>:8080`** (server-side), optionally `COOKIE_SECURE=true`
  in real prod; Traefik route `Host(app.<slug>.localhost)` → :3000. `depends_on: <be-service>`.

Realm import JSON: realm `<Realm>`; roles `Admin`,`User`; **confidential** client `<slug>_api` (`publicClient:false`,
secret, **`redirectUris:[http://app.<slug>.localhost/api/auth/callback]`**, `attributes.post.logout.redirect.uris`
`##`-separated = `http://app.<slug>.localhost`, `pkce.code.challenge.method:S256`); test user `testuser`/`Test123!`
with realm roles `Admin`,`User`.

## CRITICAL gotchas (each cost real debugging — bake them in)

1. **`server` route-option doesn't typecheck alone.** `createFileRoute(...).server` needs the TanStack Start type
   augmentation in the TS program. Any module importing `@tanstack/react-start` activates it globally; the standalone
   proxy route adds `import type {} from '@tanstack/react-start'`.
2. **srvx `--static` is resolved relative to the server-entry directory**, not the cwd. Use `-s ../client` (sibling of
   `dist/server`); `-s dist/client` silently disables static serving and every `/assets/*` 404s → the SSR shell loads
   but is unstyled.
3. **The SSR server must RUN in prod** — it is the BFF, not a static host. A static-only serve breaks `/api/auth/*` and
   every server function. Run the server entry (srvx/Nitro).
4. **`__Host-`/`Secure` are gated on `COOKIE_SECURE`, NOT `NODE_ENV`.** A prod build over plain HTTP would drop `Secure`
   cookies and lock you out. `__Host-` also **requires** `Path=/` and **no `Domain`** — which the re-homing already
   enforces.
5. **Re-home AND forward back.** Outbound: strip the API's `Domain`, app-scope, add `__Host-` in prod. Inbound: map the
   app cookie name back to the API name and forward **only** the auth cookies. Forget either half and the session
   silently never reaches the API.
6. **Callback still redirects to the ABSOLUTE app URL** `{AppBaseUrl}{returnTo}`. The browser hits
   `app./api/auth/callback`; the proxy forwards `?code&state` + the PKCE cookie inward; the BE exchanges and 302s to
   `{AppBaseUrl}{returnTo}`, which the proxy relays. Keep `returnTo` sanitized (relative, single leading `/`) — no
   open redirect.
7. **Keycloak issuer must match from BOTH the browser and the BE container** or `iss` validation 401s.
   `KC_HOSTNAME=http://keycloak.<slug>.localhost` **plus** the BE's
   `extra_hosts: ["keycloak.<slug>.localhost:host-gateway"]`, so the same URL resolves inside the container.
8. **Traefik provider negotiation.** If the docker daemon's min API version rejects Traefik's docker provider (e.g.
   min API 1.40), the docker labels are inert — switch to the **file provider**
   (`--providers.file.directory`, `harness/traefik/dynamic.yml`) and define routes there. Either way: **define no
   `api.` route.**
9. **Realm import**: post-logout redirects go in the client `attributes` as `post.logout.redirect.uris`
   (`##`-separated); a top-level `postLogoutRedirectUris` aborts the Keycloak 26 import → discovery 404 → login 500.
   Import only happens into a **fresh** Keycloak state (`--import-realm` skips existing realms) — recreate the
   container after changing the realm JSON.
10. **Route guards do NOT protect server functions.** A `beforeLoad` gate is UX; the real boundary is the API's
    `[Authorize]`. Server functions must forward the cookie and let the API decide.
11. **`*.localhost` resolution**: browsers auto-resolve to loopback (RFC 6761) — no `/etc/hosts`. `curl` needs
    `-H "Host: app.<slug>.localhost" http://127.0.0.1/`. Assert the API is internal-only with
    `curl -H "Host: api.<slug>.localhost" http://127.0.0.1/...` → **404/unreachable**.

## Verify before claiming done

- `pnpm generate-routes`, `typecheck`+`lint`+`test`+`build` clean. **Unit-test the pure pieces**: `cookies.ts` (re-home
  dev/prod/clearing; forward dev/prod/empty) and `api-loaders.ts` (`loadMe` 401→null; data loaders 401→redirect,
  5xx→throw; `settle` data/error/redirect-passthrough).
- Against a running backend: anonymous `app./` → **302/307** to `/api/auth/login`; `app./api/auth/login` → **302** to
  Keycloak with a **re-homed PKCE cookie** (no `Domain`).
- **End-to-end (Playwright)** — the browser only ever opens `app.` and `keycloak.`:
  1. Anonymous `app./` → Keycloak login form. 2. Log in → identity chip + nav render.
  2. **SSR-with-data**: the raw server HTML (no JS) already contains the identity **and** live tile data, with **no
     "Loading…"**. 4. **Revocation**: present a revoked cookie to the SSR guard (`maxRedirects: 0`) → **302/307** to
     `/api/auth/login`.

## Suggested build order

1. (If OpenSpec) propose the spec. 2. FE data layer: `cookies.ts` (+tests) → `auth-proxy.ts` + `routes/api/auth/$.ts` →
   `api-loaders.ts` (+tests) → `api.ts` server functions. 3. FE routing: `createRootRouteWithContext` + router `context`
   → `_authenticated` guard → pages under `_authenticated/` as **loaders** feeding presentational components; no browser
   API client, no `AuthProvider`, no `VITE_API_URL`. 4. Point `API_URL` at the backend and verify SSR-with-data +
   revocation.
