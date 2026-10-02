## Why

A name on a board leads nowhere: there is no way to see who someone is, how they have done, or what they have played.
The owner asked on 2026-10-02 for the UI Part 5 left open, profile and stats included; the read side already holds
every game per player, so a profile costs one page and two reads.

## What Changes

For a player:

- Every player has a profile page: their name, when they joined, their wins, draws and losses overall and per game
  type (bullet, blitz, rapid, classical, correspondence, computer), and their games, newest first, page by page.
- Names on the game page, in game lists and on Club TV lead to that player's profile; the rail's "You" group gets a
  "Profile" entry for your own.
- The computer players have profiles too (their record against the club).

In the code:

- Backend: `GET /api/players/{id}` (profile + stats) and `GET /api/players/{id}/games` (keyset), both on the replica,
  signed-in only. Stats are counted per time control on the server; the browser groups them into game types.
- Frontend: `/players/$id`, `PlayerStats` and a `PlayerLink` used wherever a name is shown.

Part: 5 (look and feel). Out of scope: ratings, head-to-head records, editing a profile (names come from Keycloak,
D23), avatars, and hiding a profile.

## Capabilities

### New Capabilities

- `player-profiles`: the profile read (identity, record per time control, games) and the profile page with links to
  it from every shown name.

### Modified Capabilities

(none)

## Impact

- Backend: new `WebApi/Players/GetPlayer/` and `WebApi/Players/PlayerGames/`, pure `Games/PlayerRecord.cs` (counts a
  player's results), `GameReads` reused for the list items.
- Frontend: `lib/players.ts` (types, `recordByCategory`), `lib/server/players.ts`, `api.ts` (`getPlayer`,
  `getPlayerGames`), `components/players.tsx`, `routes/_authenticated/players.$id.tsx`, name links in
  `components/games.tsx`, a Profile entry in `components/layout.tsx`.
- Depends on D20 (any signed-in user may see any game) and D23 (public name = `preferred_username`, never email or
  full name: the profile shows neither).
