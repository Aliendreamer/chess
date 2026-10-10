## 1. Backend

- [x] 1.1 Drop `tv` from `LobbyResponse`, `LobbyReads.Tv`/`Compose` and `Lobby:TvGames` (code and appsettings)
- [x] 1.2 Update `LobbyReadsTests` and rewrite `LobbyFlowTests` (in-play list carries the position, the lobby counts it)

## 2. Frontend

- [x] 2.1 Delete `/watch`, its rail link, home's Club TV section and the games-in-play line
- [x] 2.2 Delete `TvGrid`, `MiniBoard`, `boardSquares`, `TvGame`, `LiveGameItem`, `toTvGame`, `getLiveGames`/`loadLiveGames` and their tests
- [x] 2.3 Delete `e2e/watch.spec.ts`; drop Watch from the rail lists in `layout.test.tsx` and `responsive.spec.ts`

## 3. Docs and checks

- [x] 3.1 CLAUDE.md: no Club TV or Watch page
- [x] 3.2 Frontend lint + unit tests, backend build + unit tests
- [ ] 3.3 Backend integration tests and Playwright (need Docker: run by the user)
