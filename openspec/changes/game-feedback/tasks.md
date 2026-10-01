Each group ends in one commit that passes the gate of the app it touches: backend `dotnet build` + `./build_test.sh`
(+ `dotnet format --verify-no-changes`, human-run in the sandbox); frontend `pnpm typecheck && pnpm lint && pnpm
check && pnpm test && pnpm build`. 🐳 marks steps that need Docker or the live stack.

## 1. Reserved and rematch invites (backend)

- [x] 1.1 TestKit first: a reserved invite refuses a stranger's accept as Forbidden (it fails today because the
      stranger's accept starts a game). Add `ForId`/`RematchOf` to `InviteCreated` (optional) and the actor state,
      and the check in `HandleAccept`.
- [x] 1.2 A deserialisation test: an `InviteCreated` JSON without the new fields reads with nulls.
- [x] 1.3 TestKit: `OfferRematch` creates, then a second `OfferRematch` from the guest accepts with swapped colours, a
      repeat from the creator returns the same view, and concurrent offers give one game. Implement.
      Commit: `feat(backend): reserved invites and rematch offers`.

## 2. Rematch endpoint (backend)

- [x] 2.1 `WebApi/Matchmaking/Rematch/` (endpoint + summary; the request is the invites' `InviteRouteRequest`): 403 non-player, 409
      playing, 400 engine, 200 with the `InviteView`. Unit-test the rules helper (`Rematch.Offer`) first.
- [ ] 2.2 🐳 (written: `MatchmakingFlowTests.Both_players_asking_for_a_rematch_…`; needs Docker) Integration test (`nx integration-test backend`): two players finish a game, both post rematch, and a new
      game exists with swapped colours. Commit: `feat(backend): rematch endpoint`.

## 3. Tab signals and favicons (frontend)

- [ ] 3.1 Failing tests for `lib/feedback.ts#tabState`: my move, the opponent's move, a draw offered to me, a
      spectator, an ended game. Implement, add `useTabSignals`, the two favicons, and the `<link rel=icon>` in
      `__root.tsx`. Commit: `feat(frontend): your move in the tab title and favicon`.

## 4. Game-over card and rematch (frontend)

- [ ] 4.1 `postRematch` in `lib/server/games.ts` + `api.ts`. `GameOverCard` and `RematchOffer` components
      (tests first: the card's buttons per player or spectator, and an engine game's Rematch starting an engine
      game).
- [ ] 4.2 Game page: the card on a live `playing → ended`, the `invite:{gameId}` subscription after the end,
      navigation when the frame names the new game. Commit: `feat(frontend): game-over card and rematch`.

## 5. Found flash and draw emphasis (frontend)

- [ ] 5.1 The `Seek` tile's found state (600 ms, immediate under reduced motion) and the pulsing draw answer row.
      Component tests first. Commit: `feat(frontend): opponent found flash and draw offer emphasis`.

## 6. Verify

- [ ] 6.1 🐳 Playwright (two browsers): finish a game by resignation, both press Rematch, and both land on the new
      game with swapped colours. Run `tools/e2e.sh` and `tools/localdev/verify-part1.sh`.
- [ ] 6.2 CLAUDE.md Games note (rematch = invite with the game's id) and Serena memory. Commit:
      `docs(repo): game-feedback`.
