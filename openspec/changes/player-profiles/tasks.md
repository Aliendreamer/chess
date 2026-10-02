## 1. Backend

- [x] 1.1 Failing unit tests for `Games/PlayerRecord.Count` (rows of colour/result/time control → totals and per time
      control; `*` and playing rows ignored). Implement.
- [x] 1.2 `WebApi/Players/GetPlayer/` (route id = long, validator, 404, replica, SignedIn, `no-store`) and
      `WebApi/Players/PlayerGames/` (keyset like `me/games`). `dotnet build` warning-clean, unit tests green. Commit:
      `feat(backend): player profiles`.
- [x] 1.3 🐳 Integration test: after a finished invite game, both players' profiles show the result and their games
      list it (`nx integration-test backend`).

## 2. Frontend

- [ ] 2.1 Failing vitest: `recordByCategory` groups per-time-control rows into game types in a fixed order;
      `lib/server/players.ts` paths and 404 → null. Implement + `getPlayer` / `getPlayerGames` server functions.
- [ ] 2.2 Failing component tests: `PlayerStats` (totals, a bar, rows per type) and `PlayerLink` (link to
      `/players/$id`, plain text for id 0). Implement in `components/players.tsx`.
- [ ] 2.3 `/players/$id` route (not found → the router's not-found screen), Profile nav entry, names linked in
      `RecentGames`, `PlayerStrip` and `TvGrid`. `pnpm generate-routes`; `nx run-many -t lint test -p frontend`. Commit:
      `feat(frontend): player profiles`.
- [ ] 2.4 🐳 Playwright `e2e/profile.spec.ts`: after a resignation, the winner opens the loser's profile from the game
      page and sees the loss and the game. `tools/e2e.sh`.

## 3. Docs

- [ ] 3.1 CLAUDE.md (players endpoints, PlayerLink) and Serena memory. Commit: `docs(repo): player-profiles`.
