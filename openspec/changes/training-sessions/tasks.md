## 1. Backend

- [x] 1.1 Models, configurations and migration: `training_positions`, `training_candidates`, `training_progress`, `training_synced`
- [x] 1.2 `TrainingOptions` (`Training:*`) with validation, in `appsettings.json`
- [x] 1.3 `AutoReviewConsumer` (group `chess.auto-review`) and lazy sync into `mistake_drills`
- [x] 1.4 `TrainingMiner` singleton: judge, re-request, top up
- [x] 1.5 `TrainingService` + `WebApi/Training/` (`next`, `answer`, `summary`); remove the old practice endpoints and `PracticeFromGame`
- [x] 1.6 Unit tests (gap and phase judging, per-game cap, next order, verdicts, sync once); integration test compiles

## 2. Frontend

- [x] 2.1 `lib/training.ts` (types, session state, pure helpers) and server functions
- [x] 2.2 `/training` page and `components/training.tsx`; `/practice` redirects; rail "Training"
- [x] 2.3 Review panel without "Practise my mistakes"; profile Training panel
- [x] 2.4 Unit tests; e2e `training.spec.ts` replaces `practice` coverage

## 3. Docs and checks

- [x] 3.1 CLAUDE.md; `lib/admin.ts#PROJECTION_GROUPS` gains `chess.auto-review`
- [x] 3.2 Backend build + unit tests, frontend lint + unit tests
- [ ] 3.3 Integration tests and e2e on the stack (Docker: run by the user)
