## Why

A game can now be played, but nothing about it can be found or reviewed afterwards. There is no list of games
being played to watch, no "my games", and no move history or PGN of a finished game. Every screen the owner is
designing around a game (lobby, profile history, replay, analysis in Part 4) needs this read side. It is change
2 of 4 in Part 1.

## What Changes

For a player:

- A list of games being played right now, to pick one and watch. Newest activity first, paged.
- "My games": every game I've played or am playing, newest first, paged.
- A game's summary (players, time control, status, result and reason) and its full move list with clocks,
  enough to replay it move by move.
- A finished game's **PGN**, stored when it ends and downloadable (D22).
- Opening a finished game's live page no longer wakes its actor: the snapshot comes from the read model.

In the code:

- **Projection `GameProjection`** (consumer group `chess.rm-games`) on `game.events`. It maintains:
  - `rm_games`, one row per game: players, time control, status, result and reason, ply, last FEN,
    timestamps, the `LastSeq` watermark, and the PGN once ended;
  - `rm_game_players`, one row per player per game, for "my games";
  - `rm_moves`, one row per move: ply, UCI, SAN, FEN after, both clocks, server time.

  All three are written in one `SaveChanges`, under the Part 0 guarantees: the `IdempotencyGuard` watermark as
  a concurrency token, the dead-letter path, and stalling on a gap.

- **Display names**: `users.Username` from Keycloak `preferred_username` (unique in the realm, not a real name),
  filled on first login and backfilled on the next login for existing users. `GameProjection` snapshots both
  players' names onto the game when `game.created` is projected, so PGN keeps the names as they were when the
  game was played, and lists need no join. The fallback is `Player {id}`.
- **PGN builder**: `Games/Pgn.cs` builds headers and movetext from the stored SAN list without the rules
  library. It runs when `GameEnded` is projected.
- **Read endpoints**, served from the replica (`ReadDbContext`) and keyset-paged:
  - `GET /api/games?status=playing|ended`
  - `GET /api/me/games`
  - `GET /api/games/{id}`
  - `GET /api/games/{id}/moves`
  - `GET /api/games/{id}/pgn` (`application/x-chess-pgn`)
- **`GameLiveSource`**: an ended game's snapshot comes from `rm_games` on the replica. It falls back to the
  actor while the replica hasn't caught up with the ending yet.

**Part**: 1, change 2 of 4.

**Out of scope**:

- `open` games waiting for an opponent (change 3 adds that status to `rm_games`).
- Presence (change 4).
- UI and BFF loaders, which follow the Design work.
- Ratings (D21) and editable profiles; names come from Keycloak.

**ROADMAP decisions**: implements D19 and the PGN half of D22. Depends on D11 (uuid ids) and the Part 0
projection guarantees (`event-publishing`).

## Capabilities

### New Capabilities

- `game-history`: what the read side guarantees. That covers which games are listed and in what order, "my
  games", the summary and move list of any game, a finished game's PGN, eventual consistency with the
  write side, and ended-game snapshots served from the read model.

### Modified Capabilities

_None._ The `game-play` live-snapshot requirement still holds; only its source for ended games changes, and
that's specified here.

## Impact

- **Backend**:
  - `users.Username` (migration) and `UserProvisioningService` filling and backfilling it;
  - `Projections/GameProjection.cs`, `Games/Pgn.cs`;
  - `Data/ReadModels/RmGame`, `RmGamePlayer`, `RmMove`, with configurations and a migration;
  - `ReadDbContext` maps the three tables;
  - `WebApi/Games/` read endpoints;
  - `GameLiveSource` reads the replica for ended games.
- **Database**: three new tables on the primary, streamed to the replica.
- **API**: five new GETs. All are eventually consistent (Part 0 principle 2), and say so in their OpenAPI
  descriptions.
- **Tests**:
  - unit: projection logic including replay/idempotency and a gap, and the PGN builder;
  - integration: a game played through `IGameStarter` shows up in every list and endpoint with the right PGN;
  - the live stack: once change 3 exists.
