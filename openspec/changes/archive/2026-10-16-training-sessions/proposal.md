## Why

Training had one position in it: mistakes reached practice only when a member pressed two buttons per game, and there
was nothing to train on beyond one's own games. The club pivot puts studying first, so training becomes real sessions
from two pools that fill themselves: the member's own mistakes, and critical moments mined from the games the club
imports.

## What Changes

- Every finished game (not aborted, at least 2 moves) is reviewed automatically; the member's ? and ?? moves join their
  own pool without buttons.
- A background miner turns library positions into a pool of critical moments (one move clearly best), judged by the
  engine on the review queue, with the master's move and filter facts.
- **BREAKING** `/practice` becomes `/training` (redirected) with two modes, filters for master games, and sessions of
  10 positions or endless; the server judges each answer (the master's move or an engine-accepted move).
- **BREAKING** `GET /api/practice/next`, `POST /api/practice/results`, `GET /api/me/practice` and
  `POST /api/games/{id}/review/practice` are replaced by `GET /api/training/next`, `POST /api/training/answer` and
  `GET /api/training/summary`; the game page loses "Practise my mistakes".

## Capabilities

### New Capabilities

- `training`: automatic mistake pools, the critical-moment miner, sessions and server-side judging.

### Modified Capabilities

- `game-review`: practice of one's own mistakes moves into `training`; a review also starts automatically.
- `player-profiles`: the member's own profile shows training counts instead of practice counts.

## Impact

- Backend: `Training/` (miner, auto-review consumer, service), `WebApi/Training/`, `Review/` (practice parts removed),
  `Data/Models` (+3 tables, a marker table), a migration, `Config/appsettings.json` section `Training`, tests.
- Frontend: `routes/_authenticated/training.tsx` (new), `practice.tsx` (redirect), `lib/training.ts`,
  `components/training.tsx`, review panel, profile, rail, tests, e2e.
