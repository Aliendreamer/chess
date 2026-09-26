## MODIFIED Requirements

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
