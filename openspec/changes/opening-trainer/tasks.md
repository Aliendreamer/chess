## 1. Data

- [x] 1.1 Migration: `openings."MovesUci"` (text[]) and `trainer_progress` (PK user, line, colour; index (user, colour,
      DueAt)). Failing unit test: `OpeningSeed.Parse` keeps the line's UCI; the seed refills a table whose rows lack
      moves. Implement.

## 2. Trainer logic (pure)

- [x] 2.1 Failing unit tests for `Trainer/OpeningFamilies`: families from names, line counts, leaves only, prefix and
      search. Implement over the seeded rows (cached).
- [x] 2.2 Failing unit tests for `Trainer/TrainerSchedule`: clean run up a box with the due steps, a mistake to box 0,
      the next-line order (lowest box due, oldest due, never seen), learned from box 3, "done for now" with the next due.
      Implement.

## 3. API

- [x] 3.1 `WebApi/Trainer/` families, family (lines + progress), next, results (validators; own progress only;
      `no-store`). `dotnet build` warning-clean; unit tests. Commit: `feat(backend): the opening trainer`.
- [x] 3.2 🐳 Integration test: a member posts a clean and a missed result; next returns the missed line; the family
      counts one learned after three clean runs (clock moved by `TimeProvider`).

## 4. Frontend

- [x] 4.1 Failing vitest for `lib/trainer.ts` (whose move it is, checking a move incl. promotion, the line's progress
      through it) and `lib/server/trainer.ts`. Implement + server functions.
- [x] 4.2 Component tests (`components/trainer.tsx`): family list with progress, the drill feedback (wrong move shown,
      replay required, line done), the lines table. Implement `/trainer`, `/trainer/$family`, the nav entry, the
      profile section. Commit: `feat(frontend): the opening trainer`.
- [x] 4.3 🐳 Playwright `e2e/trainer.spec.ts`: search "najdorf", train as Black, play a line learning it from the
      moves shown after wrong ones, see it offered again first, play it cleanly, find it on the profile.

## 5. Docs

- [x] 5.1 CLAUDE.md (trainer note), ROADMAP (trainer built), Serena memory. Commit: `docs(repo): opening-trainer`.
