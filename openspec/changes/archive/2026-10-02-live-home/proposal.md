## Why

Home only shows a player their own games: nothing says the club is alive, and spectating (allowed since D20) has no
way in except a pasted link. Part 5 left "Live home" (P6) open; the owner asked on 2026-10-02 to finish what Part 5
left open, so this change settles P6 with defaults the owner can still change.

## What Changes

For a player:

- Home shows how many games are in play and, on each quick-pairing tile, how many people are waiting in that queue.
- Home gets a **Club TV** section: small boards of the games most recently moved in, each opening the game as a
  spectator. They refresh on their own while home is open.
- A new **Watch** page lists every game in play with a small board and opens any of them as a spectator.

In the code:

- Backend: `GET /api/lobby` (games in play, waiting per preset, Club TV games), answered from the replica and the
  matchmaking singleton, cached for a few seconds; a new `GetQueues` message on `MatchmakingActor`.
- Frontend: a static, server-rendered `MiniBoard` (no react-chessboard, no socket per board), a polled lobby on home,
  and the `/watch` route over the existing `GET /api/games?status=playing`.

Part: 5 (look and feel), P6. Out of scope: a count of players online (no global presence exists), mini boards in "Your
turn", a pushed `lobby` live kind, ratings, and letting players opt out of being shown.

## Capabilities

### New Capabilities

- `live-home`: the lobby read (counters, Club TV), the Club TV and queue counts on home, the Watch page, and the static
  mini board they share.

### Modified Capabilities

(none)

## Impact

- Backend: `Akka/Matchmaking/MatchmakingActor.cs` (`GetQueues`), new `WebApi/Lobby/GetLobby/`, a `LobbyOptions`
  settings class (`Lobby:` section in `Config/appsettings.json`).
- Frontend: `components/games.tsx` (`MiniBoard`, `TvGrid`), `lib/play.ts` (lobby types), `lib/server/play.ts` +
  `api.ts` (`getLobby`, `getLiveGames`), `routes/_authenticated/index.tsx`, new `routes/_authenticated/watch.tsx`,
  `components/layout.tsx` (a Watch entry).
- Depends on D20 (anyone signed in may watch any game) and D23 (names snapshotted per game). Settles ROADMAP P6:
  counters + mini boards, Club TV picks by latest activity, everyone's games are shown, engine games appear,
  correspondence games do not appear on Club TV.
