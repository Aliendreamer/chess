Each group ends in one commit passing its gate. 🐳 = live stack.

## 1. Owner review

- [x] 1.1 The owner confirms the proposal (decision 3: think times, 3 lines, 300 positions, polling) and the design.

## 2. Engine worker

- [x] 2.1 `UciEngine.AnalyseAsync` (MultiPV, `info` parsing, White's perspective), analysis loops on
      `analysis.requests` with their own processes. Tests. Commit `feat(engine): position analysis`.

## 3. Backend

- [x] 3.1 `PositionKey`, `position_evaluations` + migration, `Analysis` settings, `AnalysisService` (lookup, request,
      dedupe, retry), `AnalysisResultConsumer`, `POST /api/analysis`. Tests. Commit
      `feat(backend): shared position analysis`.
- [x] 3.2 🐳 Integration: request → fake engine answer → stored → second request served from cache, no new request.

## 4. Frontend

- [x] 4.1 `lib/analysis.ts` (score text, lines to SAN, polling hook), the study board panel, scores in the move tree.
      Tests. Commit `feat(frontend): engine analysis on the study board`.

## 5. Verify and docs

- [x] 5.1 🐳 `verify-part4b.sh` and a Playwright spec; the whole e2e suite. Commit `test(repo): verify engine analysis`.
- [x] 5.2 CLAUDE.md, architecture, ROADMAP, the Part 4 note; archive. Commit `docs(repo): engine analysis and the part 4
note`.
