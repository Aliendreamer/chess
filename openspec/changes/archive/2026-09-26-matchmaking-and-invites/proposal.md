## Why

Games can be played and reviewed, but no player can start one: the only way in is the internal `IGameStarter`.
This change gives players the two ways ROADMAP D16 and D17 settled: a **queue per time control** and a
**private invite link**. It's change 3 of 4 in Part 1, and the last one before the UI is built from the owner's
Design work.

## What Changes

For a player:

- **Play now.** Pick a time control (one of the D12 presets), join its queue, and get paired with the next
  person waiting, first come first served, with random colours. Joining another time control moves you. Leaving,
  or closing the page, takes you out within a minute.
- **Invite a friend.** Create a link for a time control and a colour (white, black or random). The first
  signed-in user who opens it and accepts becomes the opponent, and the game starts. The link stops working when
  accepted, when cancelled by its creator, or after **24 hours**.
- Both sides learn about the pairing live: queue and invite pages get a frame the moment a game is started.

In the code:

- **`MatchmakingActor`**: one cluster singleton holding the 11 queues in memory, not persisted. It keeps one
  entry per user and pairs first come, first served with random colours, starting games through `IGameStarter`.
  Seekers re-join every ~30 s; an entry without a heartbeat for 60 s expires. After a failover the next heartbeat
  re-queues the player, so the BFF needs no re-queue logic.
- **`InviteActor`**: sharded and persistent, keyed by a random v4 id (the link is a shareable secret). Events
  `InviteCreated`, `InviteAccepted(by, gameId)` and `InviteCancelled`. Expiry is checked whenever the invite is
  used. Invite events stay in the journal and aren't tagged for Kafka (no read model needs them yet).
- **HTTP**:
  - `POST/DELETE /api/matchmaking/{tc}` to join/heartbeat or leave;
  - `POST /api/invites` `{timeControl, color}`;
  - `GET /api/invites/{id}`;
  - `POST /api/invites/{id}/accept`;
  - `POST /api/invites/{id}/cancel`.
- **Live kinds**: `queue:{tc}` (the waiting count, and each pairing with its game id) and `invite:{id}` (the
  invite's status and, once accepted, its game id). Both come with backend sources and BFF allow-list entries.
- **Live-stack proof**: `tools/localdev/verify-part1.sh` creates an invite, accepts it as a second user, plays a
  checkmate over the API, and checks the finished game in `/api/games/{id}` and its PGN.

**Part**: 1, change 3 of 4.

**Out of scope**:

- UI (next, from Design).
- Presence and the 1-minute abandon flow (change 4).
- Ratings (D21).
- Listing invites or open games publicly (invites are private links).

**ROADMAP decisions**: implements D16 and D17. It refines D16 in two places: one singleton actor instead of one
per time control, and client heartbeats instead of BFF re-queue. Both are recorded in the roadmap. Depends on D12
(presets), D11 (ids) and D5 (live relay).

## Capabilities

### New Capabilities

- `game-matchmaking`: queues, pairing, heartbeats and expiry; invite links (create, read, accept, cancel,
  expire); live notification of pairings and acceptances.

### Modified Capabilities

- `realtime-relay`: the allow-list gains `queue` (a D12 preset id, e.g. `5+3`) and `invite` (32 lower-case hex).

## Impact

- **Backend**:
  - `Akka/Matchmaking/` (the singleton and its live source);
  - `Akka/Invites/` (the actor, sharding, live source);
  - `Events/InviteEvents.cs`;
  - `WebApi/Matchmaking/` and `WebApi/Invites/` endpoints.
- **Frontend**: `live-relay.ts` `KINDS` gains `queue` and `invite`. No UI.
- **Scripts**: the new `verify-part1.sh`.
- **Tests**: unit tests for pairing, expiry, heartbeats and the invite lifecycle (TestKit with a virtual clock);
  integration tests for queue pairing and invite acceptance over HTTP, both ending in a started game; live-stack
  verification.
