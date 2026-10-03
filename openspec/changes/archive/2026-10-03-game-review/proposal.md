## Why

The owner wants members to learn from their own games (2026-10-03): "records on our games to be checked … with engine
to learn of mistakes?". Members can already analyse one position at a time on the analysis board, but nothing walks a
whole finished game, says which moves were mistakes and what was better, or brings those positions back to practise.
The engine pipeline (`analysis.requests` → worker → `position_evaluations`) and the trainer's spaced-repetition
schedule already exist; this change joins them.

## What Changes

For a member:

- **Review with engine** on a finished game they played: the engine evaluates every position of the game. The game
  page then shows an **evaluation graph**, each move marked as an **inaccuracy, mistake or blunder** where it lost
  winning chances, with the engine's better move and line, and a count per player. It also says where the game **left
  the named opening lines** ("left the book at 7…Bd6: Queen's Gambit Declined"), linking that opening's trainer.
  A review is started by a player of the game; once done, anyone who can see the game sees it.
- **Practise my mistakes**: from a reviewed game, the member adds their own mistakes and blunders to their practice.
  `/practice` shows one due position at a time ("You played 18…Qb6 here. Find better."), accepts any move the engine
  rates close to its best, shows the engine's move and line after a wrong answer, and schedules each position like the
  trainer's lines (missed first, known ones later).

In the code: a separate low-priority topic `analysis.review.requests` (reviews never queue in front of a member's
interactive analysis), `game_reviews` (who asked, when), `mistake_drills` (the member's practice
positions and their box), a pure `Review/GameReview` (classification), `WebApi/Review/` and `WebApi/Practice/`
endpoints; frontend `lib/review.ts`, `components/review.tsx`, the game page's review panel, `/practice`.

Part: 6 (analysis, library). Out of scope: automatic review of every game, accuracy percentages, reviewing games
still in play (never), puzzles from other people's games, sharing practice with others.

## Capabilities

### New Capabilities

- `game-review`: on-demand engine review of a finished game — evaluations, move classification, the book exit, and
  the member's practice of their own mistakes.

### Modified Capabilities

(none — `engine-analysis` keeps its requirements; the review shares its cache and result consumer, with its own
request topic)

## Impact

- Backend: migration (`game_reviews`, `mistake_drills`); `Review/` (request, classify, practice — pure parts
  unit-tested); `WebApi/Review/`, `WebApi/Practice/`; settings section `Review`; the trainer's `TrainerSchedule` reused.
- Engine worker: a review loop on `analysis.review.requests` (`Engine:ReviewProcesses`, default 1), answering on the
  existing `analysis.results`.
- Stack: `redpanda-init` creates the new topic; the integration fixture too.
- Frontend: `lib/review.ts`, `lib/server/review.ts`, `components/review.tsx`, the game page's panel and graph,
  `/practice`, a nav entry.
- Engine time: about 1 s per position at the review think (≈1–2 min of one process per game); cached positions
  (openings, repeated games) are free. No daily limit (owner: personal use); only players start reviews.
