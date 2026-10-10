## Why

The app is turning into a club's place to play and study rather than a lichess-style public site. Watching other
people's games (Club TV on home, the Watch page) does not fit that, and in use it mostly showed leftover test games:
timed games orphaned by a node restart stay "playing" in `rm_games`, because nothing wakes their actors.

## What Changes

- **BREAKING** `GET /api/lobby` no longer returns `tv`; it keeps `gamesInPlay` and `queues` (the "n waiting" count on
  the quick-pairing tiles). The `Lobby:TvGames` setting is removed.
- The Watch page (`/watch`), its rail link, home's Club TV section and the "n games in play · Watch" line are removed,
  with `TvGrid`, `MiniBoard` and the in-play page loader.
- A game opened by its link still shows to a spectator (read-only); `GET /api/games?status=playing` stays.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-home`: the lobby without Club TV; home without the TV section; mini boards and the Watch page removed.
- `player-profiles`: names lead to profiles wherever they are shown, Club TV no longer among those places.

## Impact

- Backend: `WebApi/Lobby/` (`LobbyReads`, `GetLobby*`), `Config/appsettings.json`, lobby unit and integration tests.
- Frontend: `routes/_authenticated/{index,watch}.tsx`, `components/{games,layout}.tsx`, `lib/{play,board}.ts`,
  `lib/server/{api,play}.ts`, their tests, `e2e/watch.spec.ts` (deleted), `e2e/responsive.spec.ts`.
