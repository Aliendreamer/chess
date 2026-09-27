Each group ends in one commit that passes its gate (backend: build with no warnings, unit tests, format; frontend:
typecheck, lint, check, test, build; engine: build, unit tests, format). 🐳 marks steps that need the live stack.

## 1. Owner review

- [x] 1.1 The owner confirms the proposal and design (in particular D2 engine users, D4 untimed, D6 the nudger
      exception). Nothing is built before this.

## 2. Engine worker (`apps/engine`)

- [x] 2.1 Nx project, solution, `Directory.Build.props`, the `Engine` settings, and the Stockfish archive moved to
      `apps/engine/stockfish/` (git-ignored).
- [x] 2.2 UCI client (one process: start, options, position, `go movetime`, `bestmove`, timeout, kill) and pool, with
      unit tests against a fake process.
- [x] 2.3 Kafka loop: consume `engine.moves.requests`, answer on `engine.moves.results`, commit after produce, retry once,
      SIGTERM stops cleanly. Tests. Commit: `feat(engine): stockfish worker over kafka`.
- [ ] 2.4 🐳 `engine.dev.Dockerfile`, compose service `engine` (CPU limit), topics in `redpanda-init`, `build.sh engine`.
      The worker answers a hand-made request on the live stack. Commit: `feat(repo): engine container and topics`.

## 3. Backend

- [x] 3.1 `TimeControl.Untimed` and untimed games in `GameActor`, the projection and validation (no clocks, no flag,
      abort kept, idle passivation). Tests. Commit: `feat(backend): untimed games`.
- [x] 3.2 Engine users (migration), `GameCreated.Engine`, `CreateGame`/`IGameStarter` engine argument, presence and draw
      exemptions, `GameView.engineSide/engineLevel`. Tests. Commit: `feat(backend): games against an engine player`.
- [x] 3.3 `EngineRequestConsumer` (+ `engine_games` table), `EngineMoveConsumer`, `IEngineNudger` and the stall timer, the
      `Engine` settings. Tests. Commit: `feat(backend): engine moves over kafka`.
- [x] 3.4 `POST /api/engine-games`, `GET /api/engine-levels` (WebApi folders). Commit: `feat(backend): engine game
endpoints`.
- [ ] 3.5 🐳 Integration test: an engine game round trip with a fake responder, and a stall re-request.

## 4. Frontend

- [x] 4.1 "Play the computer" on home; the game page hides clocks, draw and claim in engine games and shows "Stockfish is
      thinking…". Tests. Commit: `feat(frontend): play the computer`.

## 5. Verify

- [ ] 5.1 🐳 `tools/localdev/verify-part2.sh`: 10 moves each at 1320, 2000 and max; one full game to the end; an
      `engine` restart mid-think. Playwright: start, move, see the reply. Commit: `test(repo): verify part 2 on the live
stack`.

## 6. Docs

- [ ] 6.1 CLAUDE.md, `openspec/architecture.md` (the engine), ROADMAP §6 Part 2. Commit: `docs(repo): engine play`.
