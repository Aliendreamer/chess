## Context

Home (`routes/_authenticated/index.tsx`) loads the player's own games, their "Your turn" list and the engine levels.
The read side already has what a lobby needs: `rm_games` keeps `Status`, `LastFen`, `LastUci`, `Ply` and `UpdatedAt`
with an index on `(Status, UpdatedAt, GameId)`, and `GET /api/games?status=playing` pages through games in play. Queue
sizes live only in the `MatchmakingActor` singleton, one `GetQueue(tc)` at a time. Nothing counts players online.
The only board component is react-chessboard behind `Board`, drawn in the browser only; `useLiveTopic` opens one
socket per call.

## Goals / Non-Goals

**Goals:**

- One cheap read for home: games in play, waiting per preset, a handful of TV games.
- Small boards that render on the server (no flash, no hydration cost, no socket each).
- A page to find and watch any game in play.

**Non-Goals:**

- Players online (needs a presence model beyond games).
- Pushed lobby updates (a `lobby` live kind) — polling is enough for now.
- Ratings or "top games"; opting out of being shown.

## Decisions

1. **Polling, not a live kind.** Home asks `GET /api/lobby` on load and every `LOBBY_POLL_MS` (10 s) while the tab is
   visible. A `lobby` live kind would need an actor or the projection to publish on every move of every game; the
   counters and TV boards are fine 10 s late. Alternative kept for later: a `lobby` kind fed by `GameProjection`.
2. **One cached answer for everybody.** The endpoint caches its answer in FusionCache for `Lobby:CacheSeconds` (2 s,
   one key), so N viewers cost one replica query and one singleton ask per 2 s. Per-user rate limits are unaffected
   (12 polls a minute).
3. **`GetQueues` on the singleton.** One message returns `QueueCounts(IReadOnlyList<QueueCount>)` — every preset with
   its waiting count, zero included — instead of eleven `GetQueue` asks. If the ask times out the lobby still
   answers, with `queues: null`, and home simply shows no counts.
4. **Club TV picks by latest activity.** Up to `Lobby:TvGames` (6) games with `Status = playing`, newest `UpdatedAt`
   first, excluding correspondence (`7d`) games — a board that moves once a day is not TV. Engine games are included.
   There are no ratings, so "latest activity" is the only fair order.
5. **`MiniBoard` is static.** A CSS grid of 64 squares in the board theme's colours with Cburnett `<img>`s, parsed from
   the FEN by a pure helper in `lib/board.ts` (`boardSquares(fen, orientation)`), the last move tinted. It renders on
   the server, so it is never a placeholder. It is wrapped in a link to `/games/$id`, which already shows any game to
   a spectator read-only (D20).
6. **Watch uses the existing list.** `/watch` pages `GET /api/games?status=playing` (keyset, "Load more") and draws a
   `MiniBoard` per game. `GameListItem` does not carry the position yet, so it gains `LastFen` and `LastUci`
   (additive: existing callers ignore them).

## Risks / Trade-offs

- [The replica lags the actor by ~250 ms–1 s] → TV boards are up to one poll plus lag behind; each board links to the
  live page for the real thing.
- [A busy club makes `games in play` a COUNT over `rm_games`] → it uses the `(Status, UpdatedAt, GameId)` index and is
  cached for 2 s.
- [Polling from many open homes] → the 2 s shared cache bounds the backend cost; the BFF passes the poll through.

## Open Questions

- **Abandoned untimed games stay "in play".** A game against the computer has no clock and no abandonment (engine-play),
  so a player who walks away leaves it playing forever: it is counted in `gamesInPlay` and, until newer games push it
  down, shown on Club TV. Seen on 2026-10-02 with leftover e2e games (55 "in play"). Options for the owner: end idle
  untimed games after `Akka:UntimedIdleMinutes` × n, or let the lobby count and show only games moved in the last N
  minutes. Not decided here.
