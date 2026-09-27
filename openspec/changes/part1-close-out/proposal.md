## Why

Part 1 is built, but three items in its ROADMAP "Verify" list are not done yet:

- **A node restart mid-game on the live cluster.** It is covered only in-process by the integration tests.
- **Resignation in Playwright.** The ROADMAP asks for create → join → move → resign; today's specs play the fool's
  mate and an abandonment.
- **The experiment note.** Every part ends with one.

Closing these makes Part 1 finished before Part 2 starts.

## What Changes

- **`tools/localdev/verify-part1.sh --cluster`** (the stack runs with `--cluster`):
  1. Start a 5+3 game and play 1.e4 e5, so the clocks run.
  2. Read the live view, then SIGTERM backend-1's app, the same way `verify-part0.sh --cluster` does.
  3. Require the same game from the surviving node: same seq and position, the waiting side's clock unchanged, and
     the running clock plausible.
  4. Play on and require White's clock to have moved.
  5. White resigns; require the replica to show the game ended 0-1 by resignation.
  6. Restart backend-1.
- **Playwright** (`e2e/play.spec.ts`): the invite-and-accept flow becomes a helper. Two new specs play two moves each
  and then end the game: one by resignation, one by a draw offer and its acceptance.
- **Experiment note** `openspec/part1-notes.md`: what worked, what surprised us, and what Part 2 should keep or
  change.

No product behaviour changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-play`: "An outage never costs a player time" gains a scenario for losing a cluster node on the live stack.

## Impact

`tools/localdev/verify-part1.sh`, `apps/frontend/e2e/play.spec.ts`, `openspec/part1-notes.md`, CLAUDE.md (the
verify command line).
