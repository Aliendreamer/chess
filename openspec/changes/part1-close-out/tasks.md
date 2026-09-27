Each group ends in one commit. 🐳 marks steps that need the live stack (started with `--cluster`).

## 1. Cluster failover on the live stack

- [x] 1.1 🐳 `verify-part1.sh --cluster`: 6 games → 1.e4 e5 → views → SIGTERM backend-1's app, wait until it has
      exited and the edge has dropped it → every game has the same seq, FEN and Black clock; each is classified by
      White's clock (restored to its last-event value = recovered from the journal, D14; still running = it was
      already on the survivor), and at least one must have been recovered → White moves and resigns in a recovered
      game → the replica shows 0-1 by resignation → restart backend-1. Commit: `test(repo): verify-part1 proves a game survives losing a node`.

## 2. Playwright: resign and draw

- [ ] 2.1 🐳 `play.spec.ts`: an invite-and-accept helper; a spec that resigns after 1.e4 e5; a spec that offers and
      accepts a draw. All specs pass. Commit: `test(frontend): e2e resignation and agreed draw`.

## 3. Experiment note and docs

- [ ] 3.1 `openspec/part1-notes.md`, and the `--cluster` line in CLAUDE.md. Commit: `docs(repo): part 1 experiment
  note`.
