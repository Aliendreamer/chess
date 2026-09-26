Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build` for the projects it
touches. 🐳 marks steps that need Docker or the live stack.

## 1. PGN builder

- [x] 1.1 Failing tests (`PgnTests`), which fail to compile until `Pgn` exists:

  - fool's mate gives movetext `1. f3 e5 2. g4 Qh4# 0-1`;
  - the seven-tag roster, `TimeControl` (`300+3`) and `Termination` are present, in order;
  - an odd number of plies (White's last move) formats correctly;
  - lines wrap at 80 columns;
  - an aborted game's result is `*`;
  - no email ever appears.

- [x] 1.2 Implement `Games/Pgn.cs`.
- [x] 1.3 Commit: `feat(backend): pgn builder from san`.

## 2. Read models and projection

- [x] 2.0 Failing tests (`UserProvisioningServiceTests`): a new user stores `preferred_username` as `Username`;
      an existing user with a null `Username` gets it filled on the next provisioning; an existing name is not
      overwritten by an empty claim. Then add `users.Username` (migration `AddUserUsername`) and pass the claim
      through `UserProvisioningPreProcessor`.
- [x] 2.1 Entities `RmGame`, `RmGamePlayer`, `RmMove` with configurations: uuid key, `LastSeq` as a
      concurrency token, and the D2 indexes. Map them in `ProjectDbContext` and `ReadDbContext`. Migration
      `AddGameReadModels`.
- [x] 2.2 Failing tests (`GameProjectionTests`, InMemory):

  - `game.created` inserts the game and both player rows, with both names snapshotted (and `Player {id}` when a name is missing);
  - each move adds one `rm_moves` row and updates ply, last FEN and `UpdatedAt`;
  - a redelivered move is skipped;
  - seq 7 after 5 throws `ProjectionGapException`;
  - `game.ended` sets status, result, reason and `EndedAt`, and stores the PGN built from the projected moves;
  - an aborted game is `ended` with `*`;
  - draw events only advance the watermark;
  - foreign event types are ignored.

- [x] 2.3 Implement `GameProjection` and register it (DI, as `PingProjection` is).
      _As built:_ "my games" joins `rm_game_players` to `rm_games` for status and result instead of copying them
      onto both player rows, so the ending updates one row only. Both tables are on the replica. Names are still
      snapshotted on both, so there's no join to `users` (D23). Draw events move only the watermark, not
      `UpdatedAt`, so the lists order by play activity. The PGN `Site` tag is the constant `chess`.
- [x] 2.4 Commit: `feat(backend): project games into rm_games, rm_game_players and rm_moves`.

## 3. Read endpoints and ended-game snapshots

- [ ] 3.1 Failing tests (`GameListQueryTests`): the pure query and mapping pieces, i.e. the status filter,
      item mapping, and "my games" colour and opponent. The keyset paging itself is proved on Postgres in 4.1.
- [ ] 3.2 Implement the five endpoints (`WebApi/Games/`) on `ReadDbContext`: 503 on a replica failure, 404 for
      an unknown game or a PGN that doesn't exist yet.
- [ ] 3.3 Failing test (`GameLiveSourceTests`): with an ended row on the read side, the snapshot comes from the
      row and the region probe receives nothing. With a playing row or no row, it asks the region as before.
      Then implement it.
- [ ] 3.4 Commit: `feat(backend): game lists, history and pgn from the replica`.

## 4. Integration 🐳

- [ ] 4.1 🐳 Failing integration test (`GameHistoryTests`, `StackFixture`): two players play fool's mate through `IGameStarter` and HTTP.

  - Eventually the game is in `status=ended` and in both players' `me/games`, with their colours.
  - `/moves` returns 4 plies with SAN and FEN.
  - `/pgn` has the expected movetext and `Result`.
  - Paging `status=ended` with `limit=1` walks every row once (uuid tiebreak on Postgres).
  - An ended game's hub snapshot comes from the read side, and the actor is not asked.

- [ ] 4.2 🐳 `nx integration-test backend` green.
- [ ] 4.3 Commit: `test(backend): game history end to end`.

## 5. Docs

- [ ] 5.1 Update `openspec/architecture.md` (§4 a `GameProjection` note, §6 read table rows for games) and
      CLAUDE.md (a read-side line under Games).
- [ ] 5.2 Commit: `docs(repo): game read side in architecture`.
