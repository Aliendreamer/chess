# apps/frontend — chess-frontend (the BFF)

Loaded when working under `apps/frontend`. Cross-app rules live in the root `CLAUDE.md`. The endpoints, rules and
read models behind each page (games, engine play, members, studies, library, trainer, review, training, news, engine
analysis) are described per feature in `apps/backend/CLAUDE.md` — read the matching section before changing a page
that talks to one.

## Commands (run in apps/frontend)

```bash
# frontend (apps/frontend)
pnpm generate-routes                           # after adding/renaming route files
pnpm typecheck && pnpm lint && pnpm check      # = nx lint frontend
pnpm test / pnpm test:watch                    # vitest;  `pnpm vitest run src/lib/server/cookies.test.ts` for one file
pnpm build && API_URL=http://127.0.0.1:8080 pnpm start   # prod SSR server on :3000
```

## Architecture

- **BFF (frontend)** — `lib/server/cookies.ts` is the whole cookie contract: outbound `rehomeSetCookie`
  strips `Domain`, keeps lifetime, forces `Path=/; HttpOnly; SameSite=Lax`, adds `__Host-` + `Secure` when
  `COOKIE_SECURE=true` (never `NODE_ENV`); inbound `forwardCookieHeader` forwards only `mp_sid`/`mp_pkce`,
  mapping `__Host-` names back. `routes/api/auth/$.ts` is the public proxy route (outside `_authenticated`).
  `_authenticated.tsx#beforeLoad` calls `getMe()` and 302s anonymous users to `/api/auth/login?returnTo=`;
  route loaders call server functions (`lib/server/api.ts`) that re-attach the cookie and hit `API_URL`
  server-side. Components are presentational. **No `VITE_API_URL` ever** — the client bundle must not
  mention the API host. Layout (`frontend-layout` spec): files by feature, no tiny files, no one-file folders —
  `components/{layout,games,pings}.tsx` (the primitives, board and move list are `@chess/ui`); client-safe types and helpers in `lib/{auth,live,games,play,pings}.ts`;
  `lib/server/` = `api.ts` (server functions + input checks), `cookies.ts`, `upstream.ts` (env, `LOGIN_REDIRECT`,
  `isGuid`, `readJson`, `postCommand` — defined once, never copied), and one file per feature (`auth`, `games`, `play`,
  `pings`, `live-relay`, `live-hub`). Client code never imports `lib/server/` except `api.ts`; imports use `#/` only. Pages run commands through
  `useCommand()` + `<ErrorText>` (`@chess/ui`), name the connection with `liveStatusText()`, give `useLiveTopic`
  `initial: { seq, payload }`, and keep markup in `components/` (route files = state and wiring).
- **Live relay (frontend + backend)** — browsers open `/api/ws/live/{kind}/{id}` on `app.`; `lib/server/live-relay.ts`
  checks the kind allow-list, validates the session with `GET /api/me` (4400/4401 otherwise, re-checked every
  `RELAY_REVALIDATE_MS`) and subscribes through `lib/server/live-hub.ts`: ONE SignalR connection per SSR process to
  `/hub/live`, authenticated as the `chess_bff` service account (service token in the same file, client credentials,
  `KEYCLOAK_TOKEN_URL` must be the PUBLIC issuer). `Messaging/LiveRelay.cs`: `LiveHub` admits only role `Relay`; `Subscribe(topic)` joins
  the group, then returns the kind's snapshot (`ILiveTopicSource`). Actors publish `LiveFrame(topic, seq,
payload)` to DistributedPubSub `live`; `HubFanOutActor` pushes it to the topic's group. The browser applies a
  frame only if its seq is newer (`lib/live.ts#applyFrame`). A new live kind = one `ILiveTopicSource` + one
  entry in the BFF's `KINDS`. Both relay hosts (Nitro route, `devLiveRelay` in `live-relay.ts`) only adapt sockets.
  Pages use `useLiveTopic` from `lib/live.ts` (initial = the loader's state as a frame; it is the baseline at subscribe only).
- **UI (frontend)** — the Club design (`Design/`, untracked, never committed) as TS: tokens are CSS variables in
  `libs/chess-ui/src/theme.css`'s `@theme` (use `bg-surface-*`, `text-fg-*`, `border-line-*`, `font-display`, `rounded-card`; no zinc,
  never a raw ramp like `bg-brass-800` in a component), fonts via `@fontsource` (no third-party requests). **Site
  themes (site-themes)**: dark (Club) is the default; light (Parchment) is a `[data-theme='light']` block that
  redefines the semantic tokens only (`libs/chess-ui/src/theme.test.ts` checks AA contrast for both). Each game type has a
  `--color-tc-*` token (`categoryOf`, `CategoryMark`, `CategoryIcon`), always next to its name; icons are
  `lucide-react`, decorative beside a label or inside a button with an `aria-label`. **Responsive (responsive-layout)**: one
  breakpoint, `--breakpoint-shell` (900px, `shell:`/`max-shell:` variants): the rail from there up, a top bar with a
  `<details>` menu below (works without JS; the rail keeps the only `identity-name`); game and study pages stack, the
  move list becomes one scrolling line, history rows take two lines, grids use `minmax(min(Npx,100%),1fr)`, and
  buttons/chips are 44px tall under `pointer-coarse`. The Playwright `mobile` project (390×844) runs
  `e2e/responsive.spec.ts` only: two-browser specs open their own contexts, which ignore a project's viewport. Screens: `/` (quick pairing, the computer, recent
  games, news), `/games/$id`, `/games`, and the `/pgn/$id` download route. **Lobby
  (live-home)**: `GET /api/lobby` (`WebApi/Lobby/`, one FusionCache answer for `Lobby:CacheSeconds`; queue sizes from
  `GetQueues` on the matchmaking singleton, null on a timeout) is polled by home every 10 s while visible (`useLobby`)
  for the "n waiting" on the quick-pairing tiles; there is no Club TV or Watch page (remove-watch-tv: a club, not a
  public site; a game is still opened by its link).
  Page width/height opt-in (`data-layout` on the page root, read by the Shell via `has-[]`): `wide` = `--content-wide`;
  `fill` = exactly the screen's height from `shell:` up, lists scroll inside (`min-h-0 flex-1 overflow-y-auto`), the
  page never does — news (a column per source), library, profiles. Home is a container-query dashboard (`@4xl` two
  columns, `@7xl` three: play | your games | events + news), sized to fit 1920×960 unscrolled. Paged lists use `useLoadMore` + `<LoadMore>`. **Page shell (ui-polish)**: every route sets `head` with
  `lib/feedback.ts#pageTitle` ("History · Chess"); `router.tsx` has the default pending bar, error panel (`RouterError`)
  and not-found page from `components/layout.tsx`, and `_authenticated/$.tsx` keeps unknown addresses inside the shell;
  `useTabSignals` never resets the title on the way out (the next page set it). **Profiles
  (player-profiles)**: `GET /api/players/{id}` (name, member since, record per time control; aborted games do not count)
  and `…/games` (`WebApi/Players/`, replica). The replica reads `users` only as `Data/ReadModels/PlayerIdentity` (id,
  username, created at), which `ProjectDbContext`'s configuration scan skips; never add private columns to it. Names
  render through `components/games.tsx#PlayerLink`; `/players/$id` groups the record into game types (`lib/players.ts`). **chess.js is feedback only**
  (`@chess/core` `board.ts`): the server's answer/frame always wins. **Board (board-look)**: `@chess/ui#Board` wraps
  `react-chessboard` (MIT), drawn in the browser only (`BoardPlaceholder` is the SSR stand-in, same size, every square
  keeps `data-square`); pieces are Cburnett SVGs in `libs/chess-ui/src/pieces/`, bundled as assets (Wikimedia, BSD-3, see
  `apps/frontend/ATTRIBUTION.md`; never the lichess GPL copy, never Unicode glyphs); board themes are `--board-*`
  variables picked by `data-board` (Brown default); square highlights are `lib/board.ts`; premove rules and
  click-premove are pure in `@chess/core`. Premoves only in timed games against a person; no sounds anywhere (owner decision). **Preferences
  (user-preferences)**: `users.preferences` jsonb (null = defaults) behind `GET|PUT /api/me/preferences`
  (`Authentication/Preferences.cs`, cached `Cache:PreferencesMinutes`, evicted on save); `_authenticated.beforeLoad`
  loads them with `getMe()`, the Shell root carries `data-board`/`data-theme` and `PreferencesContext` (the board
  reads animation and coordinates from it), and `/settings` saves each change then `router.invalidate()`s. Commands return `CommandOutcome` (4xx is shown, 401
  redirects, 5xx throws); server functions validate path inputs. e2e signs each user in once (`e2e/auth.setup.ts` →
  gitignored `e2e/.auth/*.json`) and reuses the session: Keycloak's quick-login check locks a user logged in twice
  within a second, so specs never log in again except the signed-out ones in `auth.spec.ts`.
