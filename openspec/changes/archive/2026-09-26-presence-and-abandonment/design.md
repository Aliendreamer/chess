## Context

D15 decided that presence comes from the BFF, since it holds every browser socket, and that a player's absence is
persisted as `PlayerLeft` / `PlayerReturned`. After a minute away, the remaining player chooses what happens.

What D15 left open is how presence survives failures:

- the BFF multiplexes all browsers over one SignalR connection per SSR process (D5);
- several SSR processes may serve the same game;
- a BFF process, the backend node holding its hub connection, or the node running the game actor can each die
  independently.

## Goals / Non-Goals

**Goals:**

- Instant detection of an ordinary leave (the last tab closes).
- No player can stay "present" forever because something crashed.
- Recovery never makes a player look abandoned sooner than they really were (D14 forgiveness).
- The browser reconnects on its own after a drop.

**Non-Goals:** the out-of-scope list in the proposal.

## Decisions

### D1. The BFF counts sockets per (game, user) and reports the edges

`openRelay` already calls `GET /api/me`. It keeps the user id from that call and hands it to the multiplexer
with the socket. For `game:{id}` topics only, the multiplexer keeps a count per `(topic, userId)`:

- the first socket sends `Present(topic, userId, instance)`;
- the last socket closing sends `Absent(topic, userId, instance)`.

The BFF doesn't know who plays in a game. It reports every signed-in viewer, and the actor ignores anyone who
isn't one of the two players.

_Alternative:_ browser heartbeats over HTTP. The owner chose BFF presence, as D15 decided: detection is instant
and there are no extra requests.

### D2. Presence is keyed by a BFF instance id and held by a lease

`instance` is a random id made once per SSR process. It isn't the SignalR connection id, which changes on every
hub reconnect.

- The BFF re-sends `Present` for every `(topic, user)` it holds every **30 s**, and again right after a hub
  reconnect.
- The actor holds, for each player, the set of instances reporting them present, each with the time it last
  heard from them.
- An instance not heard from in **75 s** is dropped.

A player is present while any instance holds them.

This one rule covers every failure:

- **A BFF crash:** no refresh, so the instance expires.
- **The death of the hub's node:** the BFF reconnects under the same instance id and refreshes, so nothing
  lingers.
- **Several BFF processes:** a player counts as present if any of them reports it.

_Alternative:_ tracking hub connections and clearing them in `OnDisconnectedAsync`. Rejected because a dead
backend node never runs `OnDisconnectedAsync`, so its entries would linger.

### D3. The actor persists only transitions, and absence counts only while playing

Presence entries live in memory; only these transitions are persisted:

- **`PlayerLeft(userId, at)`:** the player's instance set just became empty, while `Playing` and after both first
  moves (ply ≥ 2).
- **`PlayerReturned(userId, at)`:** the player is present again after a `PlayerLeft`.

Both go to `game.events` like every other game event, and the projection only advances its watermark on them. (The
first plan kept them journal-only like invites. The integration test showed why that fails: they take seq numbers
in the game's journal, and consumers stall on a gap in a game's seq.) On `PlayerLeft`, a timer is set for
**60 s**. When it fires, the actor publishes a view with `claimableBy` set to the other player, if that player is
present. If they aren't, both are gone, and `claimableBy` is set when one of them returns.

As built: the claim opening is itself persisted as a marker event, `AbandonmentOffered(claimantId, at)`. A frame
that only said "claimable now" would carry the previous frame's seq, and browsers drop frames that aren't newer.
It goes to Kafka like the other two, for the same reason. Presence tracking also switches on only once a game gets its first report,
or when its journal holds presence events. Games played only through the API (tests, `verify-part1.sh`) never
count anyone as absent.

### D4. On recovery, absence restarts from the recovery time (forgiveness)

After recovery, the in-memory presence is empty. It fills from the next `Present` (a refresh within 30 s, or at
once after a hub reconnect).

- A player whose last persisted event is `PlayerLeft` counts as absent **since the recovery time**, so the
  minute starts again. That's the same forgiveness as the clocks (D14).
- The other player is presumed present until 75 s after recovery. Only if no `Present` arrives by then does
  their absence begin.

### D5. Claiming is a command; "keep waiting" is not

`POST /api/games/{id}/claim` with `{ "outcome": "win" | "draw" }` succeeds only if the caller is `claimableBy`.

- `win` ends the game with the caller winning; `draw` ends it `1/2-1/2`. Both use the new
  `EndReason.Abandonment`, and the PGN termination is `abandoned`.
- Otherwise the answer is 409, "Your opponent is here" or "not yet".
- "Keep waiting" only hides the choice in the page, so no request is sent.
- A `PlayerReturned` clears `claimableBy`, so a claim that arrives just after the return gets a 409.

### D6. `GameView` gains `absentId` and `claimableBy`

- `absentId` is the player currently counted absent (null if none). The UI doesn't show it to anyone, per the
  owner's decision 4, but tests and the live stack can see it.
- `claimableBy` is who may claim now.

Both are part of the same `game:{id}` frames, so the page needs no clock of its own.

### D7. The browser reconnects with backoff

`useLiveTopic` reopens a closed socket after 1, 2, 4, 8 and then every 15 s, and reports
`status: 'reconnecting'`. The page shows the banner while that lasts, and the snapshot from each reconnect is
applied by seq as usual.

It doesn't retry close codes 4400 (bad topic) or 4401 (signed out). For those it shows "Signed out — reload to
sign in" or the error instead. A clean unmount never reconnects.

## Risks / Trade-offs

- [A lease adds a tiny steady load] Each open game costs one `Present` per player per 30 s on the existing hub
  connection. → Negligible next to the moves.
- [A crashed BFF is noticed up to 75 s late, so a claim can come up to about 2¼ min after the crash] → That's
  acceptable for a rare failure, and ordinary leaves are instant.
- [A player's tab stays open but the network died] The BFF sees the socket close once TCP gives up, or the relay
  ping fails. → It's reported absent at that point. This is the case the reconnect banner is for.
- [Both players leave] Nobody can claim. The clocks decide, as in any unattended game.

## Migration Plan

This is additive. There are new journal events (older journals simply don't have them), new view fields
(clients ignore unknown fields), and a new end reason stored as text. Rolling back leaves `Abandonment` games
readable. Their PGN termination text comes from the stored PGN.
