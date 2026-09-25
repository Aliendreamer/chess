## Context

The relay today is ping-shaped end to end:

- The browser opens `/api/ws/pings/{id}`.
- The SSR server builds a new `HubConnection` per socket, authenticated by that user's forwarded cookie, and
  calls `Subscribe(id)` on `PingsHub`, which joins the group `ping:{id}`.
- `PingActor` publishes its `PingState` to DistributedPubSub.
- `HubFanOutActor`, one per node, pushes it to that group on its own node.
- `PingFeed.tsx` appends every `state` frame.

Nothing returns current state on subscribe. `GetPingState` exists and `/live` uses it.

The relay has two hosts: the Nitro route in the built server and a Vite plugin in `vite dev`, which Playwright
runs against. Both call `connectPingHub`.

Keycloak has one confidential client, `chess_api`, with no audience mapper, and realm roles `Admin` and
`User`. JwtBearer validates the issuer. It validates audience only when `Keycloak:Audience` is non-empty,
and today that value is empty in compose and in all three appsettings files. `KeycloakRolesClaimsTransformation`
flattens `realm_access.roles` into `ClaimTypes.Role`.

## Goals / Non-Goals

**Goals:**

- One hub connection per SSR process, however many viewers.
- A relay that knows nothing about pings or games: adding a kind means one backend source and one BFF
  allow-list entry.
- Current state as soon as a socket opens, and a view that never goes backwards.
- The backend accepts only tokens issued for it, in every environment.

**Non-Goals:**

- The `game` kind, per-user private streams, spectator limits, and backpressure.
- Sharing one connection across SSR processes.

## Decisions

### D1. Topics, kinds and `LiveFrame`

A topic is `"{kind}:{id}"`. `LiveTopics.Parse` splits it and rejects anything without exactly one kind prefix.
The wire unit is `LiveFrame(string Topic, long Seq, JsonElement Payload)` on the backend and
`{ topic, seq, payload }` in TypeScript. The payload is kind-specific and opaque to the hub, fan-out,
multiplexer and relay.

A kind registers `ILiveTopicSource { string Kind; Task<LiveFrame?> SnapshotAsync(string id, CancellationToken) }`
in DI. `PingLiveSource` asks the ping region `GetPingState` (5 s) and wraps it as
`LiveFrame("ping:{id}", state.LastSeq, state)`. Actors publish `LiveFrame`s to one DistributedPubSub topic,
`live`. `HubFanOutActor` pushes each frame to the SignalR group named by `frame.Topic`.

Id rules stay per kind (`PingIds.Validate` for ping). The source validates, so the hub never interprets ids.

_Alternative:_ one hub per kind (`PingsHub`, later `GamesHub`), each with its own multiplexer. Rejected: that
means N connections per process and duplicated relay code. The kind prefix costs a string split.

_As built:_ `LiveFrame.Payload` is `object`, not `JsonElement`. Frames cross nodes over Akka remoting, which
already carried `PingState` records, and SignalR's System.Text.Json writes an `object` by its runtime type, so
the browser still gets the kind's JSON. The kind-agnostic types (`LiveFrame`, `LiveTopics`,
`ILiveTopicSource`, `LiveTopicResolver`) live in `Chess.Backend.Live`, so actors publish without depending on
`WebApi`. `LiveHub` and `HubFanOutActor` are in `WebApi/Live`. `ILiveTopicSource` also has `IsValidId`, so a bad
id is refused before any group join.

### D2. `LiveHub`: Relay-only, snapshot after join

`LiveHub` at `/hub/live` is `[Authorize(Roles = Constants.Roles.Relay)]`. It has two methods:

- `Task<LiveFrame?> Subscribe(string topic)`: parse the topic, resolve the source by kind (throwing a
  `HubException` for an unknown kind), call `AddToGroupAsync(topic)`, then return `SnapshotAsync(id)`.
  Joining first means nothing published after the join can be missed. At worst the snapshot and a push share
  a `seq`, and D6 drops one of them.
- `Task Unsubscribe(string topic)`.

The hub stays thin and `[ExcludeFromCodeCoverage]`. Topic parsing and source lookup live in a tested
`LiveTopicResolver`.

### D3. BFF service identity: `chess_bff` + `Relay`

The BFF gets a new confidential client, `chess_bff`, with a service account whose only realm role is `Relay`.
It fetches tokens by `client_credentials` from `KEYCLOAK_TOKEN_URL`, the **public** issuer's token endpoint,
so `iss` matches `Keycloak:Authority`. The frontend container gets the backend's `extra_hosts` entry.

`ServiceToken` caches `{token, expiresAt}`, refreshes when fewer than 30 s remain, and shares one in-flight
fetch. SignalR's `accessTokenFactory` calls it on every (re)connect.

_Alternatives:_

- Reusing `chess_api`: rejected. Its service account holds realm-management roles.
- A shared secret header: rejected. It's bespoke auth outside JwtBearer, with no expiry or rotation.
- mTLS: rejected as overkill for one internal hop.

### D4. Audience enforced now, in every environment

Both clients get an `oidc-audience-mapper` with `included.client.audience = chess_api` and
`access.token.claim = true`. `Keycloak:Audience = chess_api` is set in compose (`Keycloak__Audience`) and in
`appsettings.Development.json` and `appsettings.Production.json`. The base `appsettings.json` stays empty:
integration tests run under the `IntegrationTest` environment with a test auth scheme, and an empty audience
there still means "not validated".

Why now: with two clients in the realm, an unvalidated audience means any realm token, including tokens issued
to future clients, is a valid API credential. The user login flow is covered by `verify-auth.sh`, so turning
it on is safe to prove on the live stack.

### D5. `HubMultiplexer`: one per process, transport-injected

The multiplexer lives in `src/lib/server/hub-multiplexer.ts` and takes a `connect()` factory returning a small
`HubPort` (`start`, `invoke`, `on`, `onreconnected`, `onclose`, `stop`). `live-hub.ts` wires
`@microsoft/signalr`, and tests wire a fake. The state is `Map<topic, Set<LocalSocket>>`.

- `subscribe(topic, socket)` starts the connection lazily, adds the socket, and invokes `Subscribe(topic)` for
  **every** new socket. The group join is idempotent, and each socket needs its own snapshot. The snapshot goes
  to that socket only.
- `unsubscribe(topic, socket)` removes the socket; after the last one it invokes `Unsubscribe` and drops the
  topic.
- `on('frame')` routes by `frame.topic` to that topic's sockets.
- `onreconnected` re-subscribes every live topic and sends each snapshot to all of that topic's sockets.
- A final `onclose`, after automatic reconnect gives up, sends an error to every socket, closes them with 1011,
  clears the map, and lets the next `subscribe` start fresh.

### D6. The browser applies frames by `seq`

`src/lib/live.ts` holds the `LiveFrame` type, `parseFrame` and `applyFrame(current, next)`, which returns
`next` when `next.seq > current.seq` (or when there is no current frame) and `current` otherwise. It sits
outside `lib/server/` because the browser imports it. `PingFeed` keeps the latest frame and appends only
accepted payloads. The BFF passes frames through untouched.

### D7. Relay hosts share `openRelay`

`live-relay.ts` exports:

- `parseLiveUrl(url)`, which returns `{kind, id}` or null, checked against the kind allow-list (`ping` now) and
  that kind's id pattern;
- `openRelay({kind, id}, cookie, socket, deps)`, which runs the cookie check, `loadMe`, the multiplexer
  subscribe and the re-validation timer, and returns a `close()` that unsubscribes and clears the timer.

The Nitro route `server/routes/api/ws/live/[kind]/[id].ts` and `dev-live-relay.ts` only adapt sockets. Neither
touches SignalR.

Close codes:

- **4400**: unknown kind or invalid id.
- **4401**: no session, or the session became invalid.
- **1011**: the hub is unavailable.

### D8. Configuration

Server-only env vars:

- `KEYCLOAK_TOKEN_URL`
- `RELAY_CLIENT_ID`
- `RELAY_CLIENT_SECRET`
- `RELAY_REVALIDATE_MS`, default 300 000

They're read through `config.ts` accessors that throw named errors, like `apiUrl()`. The client-bundle guard
that forbids `VITE_API_URL` is extended to `RELAY_CLIENT_SECRET`.

## Risks / Trade-offs

- [One connection is one point of failure per process] Every viewer pauses during a reconnect, then gets fresh
  snapshots. → That's the same outage per-socket connections had, now shared. Recovery is exact.
- [The BFF gatekeeps watching] A bug could subscribe an anonymous socket. → `openRelay` does the cookie check
  first, it's unit-tested, and both hosts share it. The hub still refuses anything without `Relay`.
- [Audience turns on for user tokens too] If the mapper is missing from a realm, every login fails with 401. →
  The mapper is in the realm export, `verify-auth.sh` proves it on the fresh stack, and the failure is loud
  and immediate, not silent.
- [Revocation lag] A logged-out viewer keeps watching for up to 5 minutes. → Acceptable for public game streams.
- [A leaked `RELAY_CLIENT_SECRET`] It grants read-only subscription to public streams. → Rotate the secret in
  Keycloak; only a dev secret is in the export.
- [Issuer mismatch for the relay token] Fetching from `keycloak:8080` yields a different `iss`. → `extra_hosts`
  plus the public token URL, caught as a 401 by integration and e2e runs.
- [The payload is opaque to the relay] A malformed payload reaches the browser. → The browser's `parseFrame`
  drops junk per kind, as it does today.

## Migration Plan

1. The realm export gains `chess_bff`, `Relay` and both audience mappers. A fresh realm needs `down -v`, which
   the stack drop on 2026-09-25 already covers.
2. Deploy backend, frontend and realm together. A new backend rejects old relays (no `Relay` role, and the old
   `/hub/pings` path is gone). An old backend ignores `aud`.
3. Rollback: previous images plus clearing `Keycloak__Audience`. The realm additions are inert without the new
   code.

## Open Questions

None blocking.
