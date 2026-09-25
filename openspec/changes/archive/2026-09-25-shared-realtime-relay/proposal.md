## Why

For a player, the live board has two problems that grow with every viewer:

- **Opening a game shows nothing live until the next move.** The hub only pushes to connections that were
  subscribed when an event was published, so a browser that connects a moment later waits. Today the page
  hides this by server-rendering the state on load, which won't survive a real board with clocks.
- **Every viewer costs the backend a connection.** The SSR relay opens one SignalR connection per browser
  socket. A game with 1,000 spectators means 1,000 backend hub connections, all fanning out the same frames.

The relay is also **ping-specific** (`PingsHub`, `/api/ws/pings/{id}`, `PingState` frames), although pings
exist only to prove the spine. Part 1 would have to copy it or unpick it.

A third issue sits beside these: **the backend doesn't check token audience.** `Keycloak:Audience` is empty
everywhere and `chess_api` has no audience mapper, so any token from the realm is accepted, whichever client
it was issued to. Adding a second client (the relay's) makes that worth closing now rather than later.

ROADMAP D5 (settled 2026-09-25) fixes the shape of the relay: one connection per SSR node, a snapshot on
subscribe, and `seq` on every frame.

## What Changes

For a player:

- Opening a live page shows the current state **immediately over the socket**, then every change after it,
  never out of order or twice.
- The live socket URL becomes `/api/ws/live/{kind}/{id}`. Pages change with it, and nothing visible changes.

In the code:

- **A generic live hub.** `LiveHub` at `/hub/live` replaces `PingsHub`. Topics are `"{kind}:{id}"`. Each kind
  registers an `ILiveTopicSource` that supplies the current snapshot. Pings are the first kind
  (`PingLiveSource`); Part 1 adds `game`. The fan-out actor pushes a kind-agnostic `LiveFrame(topic, seq,
payload)`, so neither the hub nor the relay knows payload types. **BREAKING**: `/hub/pings` and
  `/api/ws/pings/{id}` are removed.
- **Snapshot on subscribe.** `Subscribe(topic)` joins the group, then returns the kind's current `LiveFrame`.
- **The relay authenticates as a service.** A new confidential Keycloak client `chess_bff` holds realm role
  `Relay`, and the SSR server gets its token by client credentials. `LiveHub` requires `Relay`, so browser
  sessions can't reach the hub directly (the one-origin rule already forbade it).
- **One hub connection per SSR process.** `HubMultiplexer` reference-counts topics, joins a backend group on
  the first local subscriber and leaves after the last, and fans frames out to local sockets. Both relay
  hosts (the Nitro route and the Vite dev plugin) use it.
- **The BFF authorizes each browser socket.** It validates the session cookie against `GET /api/me` before
  subscribing, then re-validates every 5 minutes. It accepts only kinds on its allow-list.
- **The browser orders frames by `seq`** and drops anything not newer than what it shows.
- **Audience enforced now.** An audience mapper adds `chess_api` to tokens from both clients, `chess_api`
  (user login) and `chess_bff` (relay). `Keycloak:Audience = chess_api` is set in compose and in the
  Development and Production appsettings, so JwtBearer validates `aud` everywhere. **BREAKING** for any token
  without that audience.

**Part**: 0 (carry-over items 2 and 3 in `docs/superpowers/notes/part0-experiment.md`), plus the relay
groundwork Part 1 builds on.

**Out of scope**:

- The `game` kind itself (Part 1).
- Per-user private streams, which keep a per-session connection when they arrive.
- Backpressure for slow sockets.
- Sharing one connection across several SSR processes.

**ROADMAP decisions**: implements D5. Depends on D10 (actor identity). Audience enforcement is a security
default and needs no new decision.

## Capabilities

### New Capabilities

- `realtime-relay`: how a browser gets live state through the BFF. It covers topics and kinds, the shared hub
  connection and its service identity, browser authorization at the BFF, the snapshot on subscribe, and `seq`
  ordering.
- `api-token-validation`: which tokens the backend accepts. That means the issuer (already enforced), the
  audience `chess_api` (new), and the roles that gate the hub.

### Modified Capabilities

_None._

## Impact

- **Backend**: `WebApi/Live/` (`LiveHub`, `ILiveTopicSource`, `LiveFrame`, `LiveTopics`) and
  `Akka/Ping/PingLiveSource`. `HubFanOutActor` publishes `LiveFrame`s. `PingActor` publishes a `LiveFrame`
  instead of a raw `PingState`. `WebApi/Hubs/PingsHub` and `HubGroups` are removed. There's a new
  `Constants.Roles.Relay`, and the audience config lives in `Config/appsettings.{Development,Production}.json`.
- **Frontend**: `src/lib/server/` gets `hub-multiplexer.ts`, `service-token.ts`, `live-relay.ts` (topic
  parsing, kind allow-list, `openRelay`) and `live-hub.ts` (the SignalR adapter). `src/lib/live.ts` holds the
  shared frame type and `applyFrame`. The server route moves to `server/routes/api/ws/live/[kind]/[id].ts`,
  and `dev-ping-relay.ts` becomes `dev-live-relay.ts`. `PingFeed` uses the new URL and `applyFrame`. The old
  `ping-hub.ts` and `ping-relay.ts` are removed. There are new server-only env vars `KEYCLOAK_TOKEN_URL`,
  `RELAY_CLIENT_ID`, `RELAY_CLIENT_SECRET` and `RELAY_REVALIDATE_MS`.
- **Local stack**: the realm export gains client `chess_bff`, role `Relay`, and audience mappers on both
  clients. Compose sets `Keycloak__Audience: chess_api`, and the frontend gets the relay env vars and
  `extra_hosts`. A fresh realm needs `stack.sh down -v`.
- **Scripts and tests**: `verify-part0.sh` moves its hub check to `/hub/live` and adds "a user session is
  refused". `verify-auth.sh` must stay green with audience on. Vitest covers the multiplexer, token cache,
  relay and `applyFrame`. A backend integration test covers `LiveHub`. The Playwright ping spec gets a late
  subscriber and two tabs.
