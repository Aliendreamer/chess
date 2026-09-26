## Context

`IGameStarter.StartAsync(white, black, tc)` creates a game (a Guid v7) through the `games` region, idempotently
per id. The live relay takes a new kind as one `ILiveTopicSource` plus a BFF `KINDS` entry. `TimeControl`
parses only the 11 D12 presets. The integration test auth can act as any subject, and the integration suite can
start games.

## Goals / Non-Goals

**Goals:**

- Queue pairing: first come, first served, random colours, one entry per user.
- Private invite links with a 24 h life.
- Live notification of both pairings and acceptances.
- A live-stack script that plays a real game end to end.

**Non-Goals:**

- UI;
- presence and abandonment (change 4);
- ratings;
- public lobbies of invites.

## Decisions

### D1. One matchmaking singleton, in memory

`MatchmakingActor` is a cluster singleton (like `JournalPublisher`, on the backend role) holding
`Dictionary<TimeControl, LinkedList<Entry>>` plus `Dictionary<userId, Entry>`, with
`Entry(userId, tc, joinedAt, lastSeen)`.

- **Join(user, tc):**
  - if the user is in a different queue, remove them from it;
  - if already in this queue, renew `lastSeen` and keep their place;
  - otherwise, pair with the oldest live entry of another user, or append.
- **Leave(user, tc):** remove the entry.
- **Sweep:** a timer every 5 s drops entries with `lastSeen` older than 60 s.

When a pairing happens, the actor assigns colours from an injected `Random` (seedable in tests), calls
`IGameStarter` (piped back to itself), replies `Matched(gameId, white, black)` to the joiner, and publishes a
`queue:{tc}` frame.

_Why a singleton:_ the rule "one entry per user across queues" needs one place that sees every queue. Pairing is
microseconds per join, so a single actor isn't a bottleneck at this stage. The state is disposable, and
heartbeats rebuild it after a failover.

_Alternative:_ one sharded entity per time control, as D16 first said. Rejected: moving between queues would
then need coordination between entities for no gain. This is recorded as a D16 refinement.

### D2. Heartbeats instead of presence

The client re-POSTs `/api/matchmaking/{tc}` every ~30 s while its "searching" screen is open. Entries expire after
60 s without one. A closed tab drops out within a minute, and after a failover the next POST re-creates the entry
on the new singleton. That needs neither BFF logic nor persistence.

_Alternative:_ the BFF tells the backend when sockets close. Rejected for now: change 4 builds exactly that
presence path for games, and the queue can adopt it then.

### D3. Invites: sharded, persistent, lazily expiring

`InviteActor` is keyed by a v4 Guid (`N` form), in region `invites` with the default idle passivation. Its
events:

- `InviteCreated(creatorId, tc, color, createdAt)`;
- `InviteAccepted(byId, gameId, at)`;
- `InviteCancelled(at)`.

Status is derived: accepted, cancelled, `expired` if `now ≥ createdAt + 24h`, otherwise `open`. It's checked on
every command and read, so no timer has to survive passivation.

**Accept:**

1. Validate: it's open, and the acceptor isn't the creator.
2. Resolve the colour (a random choice is made once, here).
3. Call `IGameStarter.StartAsync` and pipe the result to self.
4. Persist `InviteAccepted` with the game id.
5. Reply and publish.

While the start is in flight, the actor stashes other commands, so two accepts can't both start a game.

**The id is v4, not v7 (D11 exception):** a v7 id begins with a millisecond timestamp, which narrows the search
space of a link that acts as a bearer secret. The entity ids of games stay v7.

Invite events aren't in `TopicTagger.BoundTypes`, so they stay in the journal, since no read model needs them.
They're JSON-friendly primitives, so they could be tagged later without a migration.

### D4. HTTP and live kinds

**Endpoints** (thin; `IRequiredActor` asks, 5 s):

| Endpoint                                   | Returns                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `POST /api/matchmaking/{tc}`               | `{status: "waiting", position, waiting}` or `{status: "matched", gameId, white, black}` |
| `DELETE /api/matchmaking/{tc}`             | 204                                                                                     |
| `POST /api/invites` `{timeControl, color}` | 201 `{inviteId, …}`                                                                     |
| `GET /api/invites/{id}`                    | the invite                                                                              |
| `POST /api/invites/{id}/accept`            | 200 `{gameId, …}` or 409                                                                |
| `POST /api/invites/{id}/cancel`            | 200, 403 or 409                                                                         |

**Live kinds:**

- `queue:{tc}`: payload `{timeControl, waiting, lastPairing?: {gameId, whiteId, blackId}}`, published after
  every change. The snapshot is the current count. The seq is a per-queue counter held by the singleton (not a
  journal seq). A failover resets it, which the client handles the same as a reconnect: take the snapshot.
- `invite:{id}`: payload is the invite view. The seq is the invite's journal seq.

**BFF `KINDS`:** `queue: /^\d{1,2}\+\d{1,2}$/` (the backend enforces the presets) and
`invite: /^[0-9a-f]{32}$/`.

_Why broadcasting pairings on `queue:{tc}` is acceptable:_ games are public (D20). A pairing reveals only who is
playing, and spectators could see that anyway.

### D5. `verify-part1.sh`

The script is curl-only, like `verify-part0.sh`. It logs in two users (`testuser`, `player`) through the real
Keycloak flow, then:

1. `testuser` creates a `5+3` invite as white;
2. `player` accepts;
3. the fool's mate is played alternating sessions;
4. `/api/games/{id}` eventually shows `ended` with `0-1`, and `/pgn` has `[White "testuser"]`.

This is the first time a real game is played on the live stack.

## Risks / Trade-offs

- [The singleton is a single point for matchmaking] During a failover (~2 s) joins get a 504 from the ask
  timeout. → The client's next heartbeat succeeds. Nobody's game is affected.
- [A seeker gets paired right as their tab closes] They're in a game they won't play. → Change 4's 1-minute
  abandon flow handles it: the opponent claims the win or a draw. That's the same as lichess.
- [Invite ids are unguessable, not unlisted by authorization] Anyone with the link can accept. → That's the
  feature (D17: any signed-in user). Cancel exists for leaked links.
- [The queue seq resets on failover] A client may see seq go backwards once. → The queue frame is a whole state
  (the count), not a delta, so the client replaces its view on reconnect. The ordering rule matters only within
  one connection.

## Migration Plan

This is additive: two new regions or singletons, new endpoints and live kinds. There's no schema change. Invite
journal rows are new persistence ids (`invite-*`). Rollback means redeploying the previous image; open invites
then 404 until a redeploy.

## Open Questions

None blocking.
