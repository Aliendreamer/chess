## Why

A player who closes the tab in a long game leaves the other one stuck: with 30 or 90 minutes on the clock there
is no way to finish except waiting for the flag. D15 decided the fix (presence from the BFF, and after a minute
away the remaining player chooses), and the browser socket does not reconnect by itself yet, so a dropped
connection looks like a frozen game.

## What Changes

For a player:

- If the opponent has been gone from the game for **1 minute** (every tab closed, or their connection lost), the
  player sees **Claim win**, **Call it a draw** and **Keep waiting**. Claiming ends the game (`1-0`/`0-1`, or
  `1/2-1/2`) with the reason **abandonment**. If the opponent comes back first, the choice disappears and play
  goes on. The absent player's clock runs as usual.
- This applies only while the game is being played, after both first moves; before that the 1-minute abort
  (D15) already covers it. Spectators never count.
- A dropped live connection shows **"Connection lost — reconnecting…"** and reconnects by itself with backoff;
  the snapshot on reconnect brings the page up to date. A signed-out session is not retried.
- The player who was away sees nothing special on return (no countdown).

In the code:

- **BFF:** the relay passes the signed-in user's id to the multiplexer; for `game` topics it counts each user's
  sockets and tells the hub `Present` / `Absent` on 0→1 and 1→0, re-sends every presence every 30 s (a lease)
  and after a hub reconnect. Presence is keyed by a per-process BFF instance id, not the SignalR connection id.
- **Backend:** `LiveHub.Present/Absent(topic, userId, instance)` route to the `GameActor`. The actor keeps who is
  present per BFF instance in memory, expires an instance not refreshed in 75 s, and persists only the
  transitions `PlayerLeft` / `PlayerReturned` (on `game.events` like every game event; the projection only moves its
  watermark). A timer at absent + 60 s publishes a view
  with `claimableBy`; `POST /api/games/{id}/claim {"outcome":"win"|"draw"}` ends the game with a new
  `EndReason.Abandonment` (PGN termination `abandoned`).
- **Frontend:** `GameView` gains `absentId` and `claimableBy`; the game page shows the three choices to
  `claimableBy`; `useLiveTopic` reconnects with backoff and exposes `reconnecting`.

Part: 1 (the last Part 1 change). Settles the open details of D15 (the lease and the instance key) and depends on
D5 (relay), D13/D14 (actor, recovery forgiveness), D18 (endings) and D22 (PGN).

Out of scope: presence for spectators or on other kinds, "opponent is typing"-style indicators, abandonment
before both first moves (the abort covers it), rating penalties (no ratings in Part 1), and notifying an absent
player (e.g. email).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `game-play`: games can end by abandonment when a player has been absent for a minute, at the remaining player's
  choice.
- `realtime-relay`: the BFF reports players' presence on game topics to the hub, and browsers reconnect after a
  dropped connection.

## Impact

- Backend: `Akka/Games/GameActor` (presence state, lease, timers, claim), `GameMessages` (`GameView` fields,
  commands), `Events` (`PlayerLeft`, `PlayerReturned`), `Games/GameTypes` + `Pgn` (`Abandonment`),
  `WebApi/Live/LiveHub`, `WebApi/Games` (claim endpoint), `GameProjection` (the new reason flows through as text).
- Frontend: `lib/server/{live-relay,hub-multiplexer}.ts`, `lib/useLiveTopic.ts`, `lib/games.ts`, the game route,
  `lib/server/game-loaders.ts` (claim command).
- No schema change: the new events only advance the projection's watermark, and the read model stores the reason as
  text.
