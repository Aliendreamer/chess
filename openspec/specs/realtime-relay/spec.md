# realtime-relay Specification

## Purpose

How a browser gets live aggregate state through the BFF. The browser opens `/api/ws/live/{kind}/{id}` on `app.`,
and the BFF checks its session and subscribes it over one shared SignalR connection per SSR process. That
connection authenticates as the `chess_bff` service account (role `Relay`). A subscriber gets a snapshot, then
pushes. Every frame carries the journal `seq`, and the browser applies only newer frames. A new live kind
needs one backend `ILiveTopicSource` and one BFF allow-list entry. Established by change
`shared-realtime-relay` (2026-09-25).

## Requirements

### Requirement: Live state is addressed by topic kind and id

A live topic SHALL be `"{kind}:{id}"`. The backend MUST accept a topic only if a live source is registered for
its kind, and the BFF MUST accept a browser socket at `/api/ws/live/{kind}/{id}` only if `kind` is on its
allow-list and `id` matches that kind's id rule. Every frame on the wire MUST be a `LiveFrame` with `topic`,
`seq` and a kind-specific `payload`. The hub and the relay MUST NOT depend on payload types. The allow-list
MUST contain `ping` (id `^[a-z0-9-]{1,64}$`) and `game` (id: a Guid in 32-hex-digit `N` form, lower case).

#### Scenario: Known kind

- **WHEN** a browser with a valid session opens `/api/ws/live/ping/abc-1`
- **THEN** it is subscribed to topic `ping:abc-1`

#### Scenario: Game kind

- **WHEN** a browser with a valid session opens `/api/ws/live/game/0199f1c2a3b47c5d8e9f0a1b2c3d4e5f`
- **THEN** it is subscribed to topic `game:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f`

#### Scenario: Game id in the wrong shape

- **WHEN** a browser opens `/api/ws/live/game/not-a-guid`
- **THEN** the BFF closes the socket with 4400 without contacting the backend

#### Scenario: Unknown kind

- **WHEN** a browser opens `/api/ws/live/nope/abc-1`
- **THEN** the BFF closes the socket with 4400 without contacting the backend

#### Scenario: Unknown kind at the hub

- **WHEN** the relay invokes `Subscribe("nope:abc-1")`
- **THEN** the hub rejects the call with an error and adds no group membership

### Requirement: One backend hub connection per SSR process

The SSR server SHALL hold at most one SignalR connection to `/hub/live`, shared by every browser socket it
serves. It MUST join a topic's backend group when that topic gets its first local subscriber and MUST leave
it after the last. Each frame MUST be delivered to every local socket subscribed to its topic and to no other
socket.

#### Scenario: Many viewers of one topic

- **WHEN** 100 browser sockets on one SSR process watch the same ping
- **THEN** the backend sees one hub connection from that process, and every socket receives each frame

#### Scenario: Different topics on one connection

- **WHEN** one socket watches `ping:a` and another watches `ping:b`
- **THEN** both use the same hub connection, and a frame for `ping:a` reaches only the first socket

#### Scenario: Last viewer leaves

- **WHEN** the last local socket watching `ping:a` closes
- **THEN** the SSR process leaves that group, and the hub connection stays open for other topics

#### Scenario: Hub connection drops and recovers

- **WHEN** the hub connection reconnects after a drop
- **THEN** every topic with local subscribers is re-subscribed, and each of its sockets receives a fresh
  snapshot

### Requirement: The relay authenticates to the hub as a service

The SSR server SHALL authenticate its hub connection with a client-credentials token for the `chess_bff`
client, whose service account holds the `Relay` realm role. `LiveHub` MUST require that role. The token MUST
be cached and refreshed before it expires. The client secret MUST exist only in server-side environment and
MUST NOT reach the client bundle.

#### Scenario: Relay connects

- **WHEN** the SSR server connects to `/hub/live` with a valid `chess_bff` token
- **THEN** the connection is accepted

#### Scenario: A browser session tries the hub directly

- **WHEN** a connection authenticated only by a user's session cookie negotiates `/hub/live`
- **THEN** it is rejected with 403

#### Scenario: Token nears expiry

- **WHEN** the cached token is within 30 s of expiry and a (re)connect needs one
- **THEN** a new token is fetched first

### Requirement: The BFF authorizes each browser socket

Before subscribing a browser socket, the SSR server SHALL validate the socket's forwarded session cookie
against the backend (`GET /api/me`). An invalid, missing or revoked session MUST close the socket with 4401
without subscribing. While the socket is open, the SSR server MUST re-validate the session at a fixed interval
(default 5 minutes) and close the socket with 4401 if it has become invalid.

#### Scenario: Signed-in viewer

- **WHEN** a browser with a valid session opens a live socket for a known kind
- **THEN** it is subscribed and receives a snapshot

#### Scenario: No session

- **WHEN** a browser without a session cookie, or with a revoked one, opens the socket
- **THEN** the socket is closed with 4401 and no subscription is made

#### Scenario: Session revoked mid-watch

- **WHEN** the user logs out in another tab while watching
- **THEN** within one re-validation interval the socket is closed with 4401

### Requirement: A subscriber gets the current state immediately

`Subscribe(topic)` SHALL join the topic's group first and then return the current `LiveFrame` from the kind's
live source. The relay MUST send that snapshot to the subscribing socket only. A later subscriber to a topic
that already has local subscribers MUST also get its own snapshot.

#### Scenario: Late subscriber

- **WHEN** a browser opens a ping's live page after the last ping was sent
- **THEN** its socket receives the current state without waiting for another ping

#### Scenario: Second viewer on a busy topic

- **WHEN** a second socket subscribes to a topic that already has a local subscriber
- **THEN** only the second socket receives a snapshot, and both keep receiving pushes

### Requirement: The browser applies frames in seq order

The browser SHALL apply a frame only if its `seq` is greater than the `seq` of the frame it currently shows,
and MUST drop any other frame silently. A snapshot and a push for the same event can therefore arrive in
either order without the view going backwards.

#### Scenario: Push overtakes the snapshot

- **WHEN** the push for `seq 8` arrives before the snapshot, which carries `seq 7`
- **THEN** the view shows `seq 8`, and the later snapshot is dropped

#### Scenario: Duplicate delivery

- **WHEN** the same `seq 8` frame arrives twice, as after a reconnect
- **THEN** it is applied once
