Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build` for the projects it
touches. 🐳 marks steps that need Docker or the live stack.

## 1. Audience enforced

- [x] 1.1 Realm export: add an `oidc-audience-mapper` (`included.client.audience: chess_api`,
      `access.token.claim: true`) to client `chess_api`. Set `Keycloak__Audience: chess_api` in compose and
      `"Audience": "chess_api"` in `appsettings.Development.json` and `appsettings.Production.json`.
- [x] 1.2 Failing unit test first (`BuilderExtension` JwtBearer options): with `Keycloak:Audience` set,
      `ValidateAudience` is true and `ValidAudience` is `chess_api`. With it empty, `ValidateAudience` is
      false. This proves the switch that exists today and guards against it being dropped.
- [x] 1.3 🐳 `stack.sh down -v && stack.sh up`, then `verify-auth.sh` green (login → `/me` → logout →
      revocation with `aud` validated). Decode one access token and confirm `aud` contains `chess_api`.
- [x] 1.4 Commit: `feat(backend): enforce chess_api audience on api tokens`.

## 2. Live topics on the backend

- [x] 2.1 Failing tests (`LiveTopicsTests`, `LiveTopicResolverTests`), which fail to compile until the types
      exist: - `Parse("ping:abc")` gives `(ping, abc)`; - `Parse` rejects `"abc"`, `":abc"`, `"ping:"`; - the resolver finds the source by kind and throws a named error for an unknown kind.
- [x] 2.2 Failing test (`PingLiveSourceTests`, Akka TestKit probe as the region): the snapshot is
      `LiveFrame("ping:abc", lastSeq, state)`, and an invalid id is rejected before any ask.
- [x] 2.3 Implement `LiveFrame`, `LiveTopics`, `ILiveTopicSource`, `LiveTopicResolver` and `PingLiveSource`.
      `PingActor` publishes a `LiveFrame` to topic `live`. `HubFanOutActor` subscribes to `live` and pushes to
      group `frame.Topic`. Update `PingActorTests` / `HubFanOutActor` tests to the envelope.
- [x] 2.4 Add `Constants.Roles.Relay` and `LiveHub` at `/hub/live` (`[Authorize(Roles = Relay)]`,
      `Subscribe`/`Unsubscribe` per design D2). Remove `PingsHub` and `HubGroups`, and map the new hub.
- [x] 2.5 🐳 Failing integration test (`LiveHubTests`, SignalR client over `TestServer`,
      `X-Test-Roles: Relay`): - `Subscribe("ping:{id}")` returns the state of a ping posted earlier; - a later ping pushes a frame with a higher `seq`; - `Subscribe("nope:x")` fails; - without `Relay` the connection is refused.
- [x] 2.6 Commit: `feat(backend): generic relay-only live hub with snapshot on subscribe`.

## 3. BFF service identity

- [x] 3.1 Failing vitest (`service-token.test.ts`, injected `fetch` and clock): - the first call fetches; - a call within lifetime reuses the token; - within 30 s of expiry it refetches; - concurrent calls share one fetch; - a non-2xx is a named error.
- [x] 3.2 Implement `ServiceToken` and the `config.ts` accessors. Extend the client-bundle guard to
      `RELAY_CLIENT_SECRET`.
      _As built:_ there was no client-bundle guard to extend, only a comment in `env.d.ts`. `config.test.ts`
      now adds one: it fails if any browser-reachable file under `src/` (anything outside `lib/server/`)
      names a server-only env var.
- [x] 3.3 Realm export: client `chess_bff` (confidential, service account, dev secret, the same audience
      mapper) and realm role `Relay`, granted only to its service account. Compose: the frontend gets the
      relay env vars and the backend's `extra_hosts`.
- [x] 3.4 Commit: `feat(frontend): relay service identity via client credentials`.

## 4. Frames and multiplexer (frontend)

- [x] 4.1 Failing vitest (`live.test.ts`): - `parseFrame` accepts `{topic, seq, payload}` and drops junk; - `applyFrame(undefined, f7)` gives f7, `(f7, f8)` gives f8, `(f8, f7)` keeps f8, `(f8, f8)` keeps
      current.
- [x] 4.2 Failing vitest (`hub-multiplexer.test.ts`, fake `HubPort`): - two sockets on one topic → one `start`, two `Subscribe` invokes, each snapshot to its own socket only; - a push reaches only that topic's sockets; - the last unsubscribe invokes `Unsubscribe` and keeps the connection; - reconnect re-subscribes every topic and snapshots all of its sockets; - a final close sends an error, closes the sockets with 1011, and the next subscribe restarts; - a failed start affects only the subscribing socket.
- [x] 4.3 Implement `live.ts`, `hub-multiplexer.ts` and `live-hub.ts` (the SignalR `HubPort` with
      `accessTokenFactory` from `ServiceToken`, WebSockets transport, automatic reconnect).
- [x] 4.4 Commit: `feat(frontend): one live hub connection per process`.

## 5. Relay hosts and the ping page

- [x] 5.1 Failing vitest (`live-relay.test.ts`): - `parseLiveUrl` accepts `/api/ws/live/ping/abc-1` and rejects an unknown kind or bad id; - `openRelay` with no cookie or `loadMe` null → 4401, no subscribe; - a valid session → subscribe; - re-validation turning invalid → 4401 and unsubscribe; - `close()` → unsubscribe and clear the timer; - an unknown kind → 4400.
- [x] 5.2 Implement `live-relay.ts`. Add the route `server/routes/api/ws/live/[kind]/[id].ts` and
      `dev-live-relay.ts`. Remove `ping-hub.ts`, `ping-relay.ts`, `dev-ping-relay.ts` and the old route.
      `PingFeed` uses `/api/ws/live/ping/{id}` and `applyFrame`, with a failing `PingFeed.test.tsx` case first:
      out-of-order snapshot and push render once, in seq order.
- [x] 5.3 Commit: `feat(frontend): generic live relay with session check before subscribe`.

## 6. End to end 🐳

- [x] 6.1 🐳 A fresh stack (`down -v`, `up --profile cluster`). `verify-auth.sh`, `verify-part0.sh` (hub check
      moved to `/hub/live`, plus "a user-session negotiate is 403") and `verify-part0.sh --cluster` are green.
- [x] 6.2 🐳 Playwright `e2e/pings.spec.ts`: a late subscriber sees the state from the socket snapshot, two
      tabs on one ping both receive a push, and an unknown kind closes with 4400.
- [x] 6.3 🐳 Connection count: 5 tabs on one ping → exactly 1 `/hub/live` connection from the frontend
      container (backend connection log or `ss`). Record it in an as-built note.
      _As built (2026-09-25):_ counted from the backend request log (relay negotiates use host
      `backend:8080`) and the frontend's SignalR log. - A cold frontend process opened exactly **1** `/hub/live` negotiate and **1** hub WebSocket. - Then **5 separate viewers** (5 browser contexts, logged in) on one ping all went live and all received
      the push, with **0** new negotiates and **0** new hub connections: the process's one connection
      carried them all. - Two measurement traps to avoid. Writing a script into `apps/frontend/` (mounted in the dev container)
      makes Vite full-reload every tab. And 5 tabs in one Chromium instance under `vite dev` starve the 5th
      tab's module loading (11 sockets to one host), which is a dev-server artifact, not the relay.
- [x] 6.4 Update `openspec/architecture.md` (§1 relay edge and service identity; §2 snapshot on subscribe;
      §7 audience), the CLAUDE.md BFF and auth notes, and `docs/superpowers/notes/part0-experiment.md` items
      2–3 as done.
      _As built:_ `docs/superpowers/` (with the Part 0 notes) was removed by the owner during this change, since
      docs now live only in `openspec/`. The notes update is replaced by the architecture and CLAUDE.md updates.
- [x] 6.5 Commit: `docs(repo): shared live relay and audience in architecture and notes`.
