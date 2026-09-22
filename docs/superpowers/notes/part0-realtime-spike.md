# Part 0 spike — SSR WebSocket relay (option A) vs edge upgrade (option B)

**Date:** 2026-09-22 · **Task:** Part 0 / Task 9 · **Decision: option A (SSR relay). Adopted.**

## The question

The browser may only ever talk to `app.`. Live ping state originates in the backend's SignalR hub
(`/hub/pings`, fed by `HubFanOutActor` off DistributedPubSub). Two ways to get it to the browser:

- **A — SSR relay:** the browser opens `wss://app./api/ws/pings/{id}`; the SSR server (Nitro
  node-server) holds a `@microsoft/signalr` client to the hub and forwards frames. One origin, the
  session cookie is re-attached exactly as the server functions do, the API host stays invisible.
- **B — edge upgrade:** the edge proxies `/hub/` straight to the backend and the browser runs the
  SignalR client itself. Fewer hops, but the browser then speaks the hub protocol directly and the
  cookie contract (`__Host-` re-homing in `lib/server/cookies.ts`) has to hold on a path the BFF no
  longer owns.

A's viability was the open risk: **does a WebSocket upgrade reach a Nitro-scanned route under the
`node-server` preset in this TanStack Start setup?** If it did not, the plan said to take B.

## Result: yes, and the whole path works

Measured locally against the built output (`pnpm build` → `node .output/server/index.mjs`), with a
purpose-built fake SignalR hub (negotiate + handshake + one `state` invocation) standing in for the
backend. No Docker involved.

| Probe                                       | Result                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Upgrade `/api/ws/pings/p1`, no cookie       | 101, then close `4401 unauthenticated` (our handler ran)                                                       |
| Upgrade with an id the backend would reject | 101, then close `4401` — no hub connection attempted                                                           |
| Upgrade with `mp_sid`, hub unreachable      | `{"kind":"error",...}` frame, then close `1011`                                                                |
| Upgrade with `mp_sid`, hub answering        | hub saw `cookie: mp_sid=…` on negotiate and `Subscribe("p1")`; browser received `{"kind":"state","state":{…}}` |

Latency, loopback, three runs: upgrade **15–37 ms**, first frame **23–146 ms** (7–110 ms after open;
the high numbers are the first connection, which pays the negotiate + module load). These are
loopback numbers with a trivial hub — they bound the relay's own overhead, nothing more. Real
ping→feed latency is a stack measurement and belongs in the Part 0 experiment note (Task 11).

## What it took (both were real bugs, not config taste)

1. **Nitro does not scan `server/` by default.** `srcDir` defaults to the Vite root, so scanned
   handlers would have to live in `<root>/routes`. Fixed with `scanDirs: ['server']` rather than the
   plan's `srcDir: 'server'`, which would also move the `~`/`@` aliases and the publicAssets base.
   The handler must also be registered by Nitro as a websocket route — it is, lazily
   (`{ route: '/api/ws/pings/:id', lazy: true }`), and crossws resolves lazy handlers fine.

2. **`@microsoft/signalr` breaks node-file-trace.** It reaches its Node transports through an
   indirect `requireFunc("ws")` / `("eventsource")` / `("fetch-cookie")` / `("tough-cookie")`, which
   neither rollup nor nft can see. The build succeeded and the server started; the _first relay
   socket_ then died with `Cannot find module 'ws'`. Because the runtime image copies only
   `.output`, this would have failed identically in the container — found here only because the
   spike drove a real socket. Fixed by pinning those four as frontend dependencies and passing
   resolved paths to `externals.traceInclude` (bare specifiers are resolved against the root and
   error out as `File …/ws does not exist`). Node ≥ 18 globals mean `node-fetch` and
   `abort-controller` are never reached.

3. **The prod edge swallowed the relay path.** `apps/proxy/files/nginx.conf` sent all of `/api/` to
   the backend and set no `Upgrade`/`Connection` headers. Added `^~ /api/ws/` (with upgrade headers,
   `proxy_buffering off` and a 3600s read timeout — the 24s default would drop idle relay sockets)
   and `^~ /api/auth/`, which was already mis-routed: the BFF's auth proxy, the thing that re-homes
   the session cookie, was being bypassed at the edge. Local dev never showed it because Traefik
   routes by Host. **Not yet validated** — `nx validate proxy` needs Docker (human gate).

## Consequences of choosing A

- The SSR server now holds one hub connection per open feed. Fine for Part 0; for Part 1 (real
  games, many watchers) the relay should multiplex — one hub connection per node, fanned out to
  local peers by topic — rather than one per socket. Flagged for the Part 1 design conversation.
- `vite dev` has no Nitro (the plugin only runs on `build`), so the scanned route does not exist in
  dev. That was not survivable: the compose frontend runs `vite dev`, so the live page sat on
  "connecting…" and the Playwright spec could not pass. `src/lib/server/dev-ping-relay.ts` is a
  dev-only Vite plugin serving the same path off the dev server's upgrade event, and
  `connectPingHub` holds the hub wiring both hosts share. Dev and prod now behave the same.
- Reconnect: `withAutomaticReconnect()` plus a re-`Subscribe` on `onreconnected`, since group
  membership lives on the hub connection. The browser socket itself does not auto-reconnect — a
  closed relay shows `disconnected` and a reload fixes it. Good enough for a spike page.

## Verified on the live stack (2026-09-22)

All three specs in `apps/frontend/e2e/pings.spec.ts` pass against the running stack — SSR-before-JS,
ping→feed through the relay, and "no API host in the browser" including the WebSocket URL — as does
the whole e2e suite (8 tests). `pnpm exec nx validate proxy` passes with the new `^~ /api/ws/` and
`^~ /api/auth/` locations.

Two things the spec itself had to learn, both real properties of the design rather than test noise:

- The hub pushes only to whoever is subscribed **at publish time**; there is no replay for a late
  subscriber. A test that pings before the relay reports `live` sees an empty feed. The page hides
  this by server-rendering current state on load — which will not be enough for a board (see the
  experiment note's Part 1 list).
- React splits `count {n}` with a comment marker in SSR HTML, so a raw-bytes assertion has to read
  `count <!-- -->1`. `PingFeed` now emits one interpolation instead, which is simpler markup anyway.
