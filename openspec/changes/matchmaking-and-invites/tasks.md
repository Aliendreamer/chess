Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build` for the projects it
touches. 🐳 marks steps that need Docker or the live stack. Expected values in tests are fixed literals.

## 1. Matchmaking

- [ ] 1.1 Failing TestKit tests (`MatchmakingActorTests`, fake `IGameStarter`, seeded `Random`, fake clock and
      `TestScheduler`):

  - the second seeker is paired with the first (the joiner gets `Matched`, a `queue:5+3` frame is published);
  - oldest first;
  - a user is never paired with themselves (re-join renews and keeps the place);
  - switching queues moves the entry;
  - an entry not renewed for 60 s is swept;
  - leave removes;
  - a non-preset time control is refused;
  - colours follow the seeded `Random`;
  - the frame payload carries the waiting count and the pairing.

- [ ] 1.2 Implement `MatchmakingActor` (singleton registration on the backend role), messages, and
      `QueueLiveSource` (kind `queue`, preset ids only).
- [ ] 1.3 Commit: `feat(backend): matchmaking queues per time control`.

## 2. Invites

- [ ] 2.1 Failing TestKit tests (`InviteActorTests`, in-memory journal, fake clock, fake starter):

  - create gives `open`;
  - a stranger accepts and the game starts with the creator's colour honoured (`black` makes the acceptor White);
  - a random colour is resolved once;
  - a second accept is `conflict` and the starter is called once;
  - the creator can't accept their own invite;
  - cancel by the creator gives `cancelled`, and by a stranger `forbidden`;
  - 24 h later it's `expired` and refuses accept;
  - an unknown invite is `not found`;
  - an accepted invite survives a restart with its game id;
  - an `invite:{id}` frame is published on accept.

- [ ] 2.2 Implement `InviteActor` (stashing while the start is in flight), events, sharding (`invites`, v4 ids),
      and `InviteLiveSource`.
- [ ] 2.3 Commit: `feat(backend): invite links that start a game`.

## 3. HTTP and live kinds

- [ ] 3.1 Failing tests for the reply mappers (matchmaking and invite replies to HTTP codes and shapes).
- [ ] 3.2 Implement the endpoints (`WebApi/Matchmaking/`, `WebApi/Invites/`). The frontend `KINDS` gains `queue`
      and `invite`, with failing `live-relay.test.ts` cases first.
- [ ] 3.3 🐳 Failing integration test (`MatchmakingFlowTests`):

  - two users join `5+3` over HTTP; the second gets `matched` and the game exists (`GET /api/games/{id}/live`);
  - an invite is created by A as black, and B accepts: B is White in the started game;
  - a second accept is 409;
  - cancel on another invite gives `cancelled`;
  - a hub subscriber on `invite:{id}` gets the accepted frame.

- [ ] 3.4 Commit: `feat(backend): matchmaking and invite endpoints with live kinds`.

## 4. Live stack and docs 🐳

- [ ] 4.1 🐳 `tools/localdev/verify-part1.sh` per design D5. Run it on a fresh `stack.sh up --cluster`, together
      with `verify-auth.sh` and `verify-part0.sh --cluster`, and run `nx integration-test backend`.
- [ ] 4.2 Record the D16 refinements in `ROADMAP.md`, update `openspec/architecture.md` (matchmaking and invites
      in §1 and the game-life diagram) and CLAUDE.md.
- [ ] 4.3 Commit: `docs(repo): matchmaking and invites in architecture`.
