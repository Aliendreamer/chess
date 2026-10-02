## 1. Backend: queues and the lobby read

- [x] 1.1 Failing TestKit test: `GetQueues` answers every preset with its waiting count (zero included) after one
      join (fails: no such message). Add `GetQueues` / `QueueCounts` / `QueueCount` to `MatchmakingActor`.
- [x] 1.2 Failing unit tests for `LobbyReads` (pure, over an in-memory list of `RmGame`): TV order newest
      `UpdatedAt` first, limit, correspondence left out, `gamesInPlay` counts every playing game. Then `LobbyOptions`
      (`Lobby:TvGames` 6, `Lobby:CacheSeconds` 2) in `Config/appsettings.json` (`SettingsTests` must stay green).
- [x] 1.3 `WebApi/Lobby/GetLobby/` (endpoint, response, summary): replica query + singleton ask, `queues: null` on a
      timeout, FusionCache one key for `CacheSeconds`, `no-store`, SignedIn. `GameListItem` gains `LastFen`/`LastUci`.
      `dotnet build` warning-clean, unit tests green. Commit: `feat(backend): the lobby read`.
- [x] 1.4 🐳 Integration test (`nx integration-test backend`): a started game shows up in `GET /api/lobby` (TV and
      count) and in `GET /api/games?status=playing` with its `lastFen`.

## 2. Frontend: mini board

- [x] 2.1 Failing vitest: `boardSquares(fen, 'white')` returns 64 squares a8…h1 with the right pieces; `'black'` reverses
      them. Implement in `lib/board.ts`.
- [x] 2.2 Failing component test: `MiniBoard` renders 64 `[data-square]` cells, 32 piece images for the start
      position, the last move's two squares marked, and an accessible name. Implement in `components/games.tsx`.
      Commit: `feat(frontend): a static mini board`.

## 3. Frontend: lobby on home, Watch page

- [x] 3.1 Failing vitest for `lib/server/play.ts#loadLobby` and `loadLiveGames` (paths, 401 redirect) and for
      `isLobby`; then the server functions `getLobby` / `getLiveGames` in `api.ts`.
- [x] 3.2 Home: counters line, "n waiting" on preset tiles, Club TV (`TvGrid`) with its empty state, poll every 10 s
      while visible (`useLobby` in `lib/play.ts`, tested with fake timers and `document.visibilityState`).
- [x] 3.3 `/watch` route + a Watch nav entry (`Tv` icon) under Play; "Load more" with an error line. Run
      `pnpm generate-routes`. `nx run-many -t lint test -p frontend` green. Commit: `feat(frontend): club tv and watch`.
- [x] 3.4 🐳 Playwright `e2e/watch.spec.ts`: `player` starts a game against the computer and moves; `testuser` (not in
      that game) sees it on Club TV and on /watch, opens it and sees the board without move controls. `tools/e2e.sh`.

## 4. Docs

- [x] 4.1 ROADMAP P6 → decided (with these defaults), CLAUDE.md Games/UI notes (lobby, mini board, /watch). Commit:
      `docs(repo): live-home`.
