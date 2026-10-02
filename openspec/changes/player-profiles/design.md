## Context

`rm_game_players` has a row per player per game (`UserId`, `GameId`, `Color`, `OpponentId`, `OpponentName`,
`CreatedAt`, index `(UserId, CreatedAt, GameId)`); `rm_games` holds status, result, reason and time control.
`GET /api/me/games` already joins them for the signed-in user and maps rows with `GameReads.ToMyGame`. `users` has
`Username` (D23), `CreatedAt`, and the engine players are seeded with ids −1…−5. The replica carries `users` too.

## Goals / Non-Goals

**Goals:**

- One profile read and one games read, both reusing the shapes the frontend already renders (`MyGameItem`).
- Names become links everywhere they are shown.

**Non-Goals:**

- Ratings, streaks, head-to-head, opening statistics; editing or hiding profiles.

## Decisions

1. **Ids in the URL, not names.** `/players/{id}` — the id is stable, a Keycloak name can change (D23 keeps the
   per-game snapshot). The page shows the current `users.Username`, falling back to "Player {id}".
2. **Counted on the server, per time control.** `GET /api/players/{id}` runs one grouped query over the player's ended
   games (`Result` ≠ `*`, aborted games are not results): per `TimeControl`, wins/draws/losses from the player's colour
   and the result. The API returns `[{ timeControl, wins, draws, losses }]` plus totals; the browser maps time controls
   to game types with the existing `category()`, so the category rules live in one place. A pure `PlayerRecord.Count`
   does the tallying so it is unit-tested without a database.
3. **Games page reuses `MyGameItem`.** `GET /api/players/{id}/games` is `me/games` for any user (same keyset, same
   item), so `RecentGames` renders it unchanged.
4. **What is public.** Name, member-since date, record and games — all already visible to any signed-in user through
   games (D20). Email, full name and preferences are never returned. An unknown id is 404.
5. **`PlayerLink`.** One component renders a name as a link to `/players/$id` (no link for id 0, the unknown player).
   `RecentGames` needs the opponent id, which `MyGameItem.opponentId` already has; the game page has `whiteId`/`blackId`.

## Risks / Trade-offs

- [A prolific player's stats query scans all their rows] → it seeks on the `(UserId, …)` index and groups a few
  hundred rows; cache later if it shows up in traces.
- [The replica lags] → a game that just ended may count a second later; the page is a read like any other.
