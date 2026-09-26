Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build` for the projects it
touches. 🐳 marks steps that need Docker or the live stack.

## 1. Rules adapter

- [x] 1.1 Add `Gera.Chess` 1.2.0 (exact pin in `Directory.Packages.props`). Failing tests (`ChessRulesTests`),
      which fail to compile until the adapter exists: - `e2e4` gives SAN `e4`, the expected placement, and Black to move; - `e2e5` is rejected with a reason; - `a7a8n` promotes to a knight (`a8=N`), set up by replaying a legal sequence to a promotion; - fool's mate ends `0-1 checkmate`; - the knight shuffle twice ends `½-½ threefold`, also after `Replay` of the first half; - a known 10-move stalemate line ends `½-½ stalemate`; - castling SAN (`O-O`) and en passant are accepted.
- [x] 1.2 Failing tests (`SideCanMateTests`, positions from FEN): a lone king or king + one minor piece can't
      mate; king + rook, king + two bishops, or any pawn can.
- [x] 1.3 Implement `ChessRules`, `SideCanMate`, `GameResult`/`EndReason` and `TimeControl` (the D12 presets,
      parse and format `5+3`). Answer design open question 1 (SAN check marks) in an as-built note.
- [x] 1.4 Commit: `feat(backend): chess rules adapter over gera.chess`.

## 2. GameActor: moves, draws, endings

- [x] 2.1 Failing TestKit tests (`GameActorTests`, in-memory journal): - `Create` is idempotent; - a non-player gets `forbidden`, moving out of turn gets `conflict`, and an illegal move gets `illegal`,
      none of them persisting anything; - a legal move persists `MoveMade` with every field; - fool's mate persists `GameEnded(0-1, checkmate)`; - the draw lifecycle (offer, lapse on the opponent's move, re-offer blocked until the offerer moves,
      accept ends `½-½ agreement`, decline); - resign after the first move ends the game for the opponent; - every command after `GameEnded` gets `conflict`; - `LiveFrame` is published after each event with the event's seq.
- [x] 2.2 Implement `GameActor`, messages, `GameView` and `GameSnapshot` (move list, D2). Snapshot every 20
      events. Failing test first: a threefold that spans a snapshot and a restart still ends the game.
      _As built:_ offering a draw while the opponent's offer is pending **accepts** it, since both players want a
      draw. The spec doesn't forbid this, and it saves the UI from a race between the two buttons. A move from the
      offerer keeps their own offer pending; only the opponent's move makes it lapse.
- [x] 2.3 Commit: `feat(backend): game actor with moves, draws and endings`.

## 3. Clocks and abort

- [x] 3.1 Failing TestKit tests using `TestScheduler` and a fake `TimeProvider`: - no clock runs before each side's first move; - elapsed time plus increment gives the spec's 3+2 example; - flag fall fires with no message and ends `0-1 timeout`; - flag fall against king + knight ends `½-½`; - a stale timer doesn't end the game; - no first move within 1 minute ends `*, aborted`, and Black's first reply has its own minute; - abort before your first move works, and after both first moves it's `conflict`; - recovery restores the clock of the player to move as of the last event and re-arms the timer (D14); - an ended game passivates itself after 1 minute.
- [x] 3.2 Implement the timers, recovery forgiveness and `PassivationPolicy` (live controls only for now). The `games` region has idle
      passivation off (design D8).
- [x] 3.3 Commit: `feat(backend): game clocks, flag fall and abort`.

## 4. Outbox, starter, HTTP and live kind

- [x] 4.1 Failing tests: the five mappers produce envelopes (topic `game.events`, key `game:{id}`, seq, `type`
      and `v`); `TopicTagger.BoundTypes` contains all five; `GameLiveSource` accepts only 32-hex ids and wraps
      `GameView` as a `LiveFrame`.
- [x] 4.2 Implement the mappers, the tagger entries, `IGameStarter`, the sharding registration, the endpoints
      (`WebApi/Games/`) and `GameLiveSource`. Frontend `KINDS` gains `game`, with a failing `live-relay.test.ts`
      case first (a valid 32-hex id is accepted, `not-a-guid` gives 4400).
- [x] 4.3 Integration-test auth: a per-request `X-Test-Subject` header, so one factory can act as two players.
- [x] 4.4 🐳 Failing integration test (`GameFlowTests`, `StackFixture`): - `IGameStarter` creates a game; - two players play fool's mate over HTTP; - a spectator's move is 403; - each reply carries the new state; - the `game.events` envelopes arrive in seq order under `game:{id}`; - a `LiveHub` subscribe returns the current view, and later moves push frames.
- [x] 4.5 🐳 Failing integration test: failover forgiveness end to end. A game mid-turn is stopped and
      restarted in a fresh app process, and the clock of the player to move equals its last event's value.
      _As built:_ the integration tests caught two real faults, both fixed. - Every endpoint without a body (live, resign, draw, abort) used an empty DTO that FastEndpoints refuses to
      bind, which would have been a 500. They now use `EmptyRequest`. - `GameStatus` went out as a number; it is now a string (`"Playing"`) over HTTP and the relay.

      Restarting the app on the same Akka port can hit "address already in use" while the old socket closes, so
      the failover test retries that bind instead of sleeping.

- [x] 4.6 Commit: `feat(backend): game commands over http, kafka and the live relay`.

## 5. Verify and document 🐳

- [ ] 5.1 🐳 `stack.sh up --cluster`, then `verify-auth.sh`, `verify-part0.sh --cluster` and `nx integration-test
backend` are green.
- [ ] 5.2 🐳 Add to `verify-part0.sh` (or a new `verify-part1.sh`): start a game through a test-only path, play
      a checkmate over the API with two sessions, and see `GameEnded` on `game.events`. If no test-only start
      path exists on the live stack, record that this waits for change 3 and rely on 4.4.
- [ ] 5.3 Update `openspec/architecture.md` (§1 adds the games region; §2 a move as the example command; §5 game
      lifecycle and passivation policy) and CLAUDE.md (a GameActor note).
- [ ] 5.4 Commit: `docs(repo): game core in architecture`.
