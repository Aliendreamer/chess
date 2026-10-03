## 1. Data and engine

- [ ] 1.1 Migration: `game_reviews` (PK game; requested by, at; index (requested by, at)) and `mistake_drills` (PK user,
      game, ply; fen, played, accepted uci[], best + line, box, due at, updated at; index (user, due at)). `Review`
      settings (`ThinkMs` 1000) in `appsettings.json` and `SettingsTests`.
- [ ] 1.2 Engine worker: a review loop and consumer group on `analysis.review.requests` (`Engine:ReviewProcesses`,
      default 1), answering on `analysis.results`; tests against the fake engine. `redpanda-init` and the integration
      fixture create the topic. Commit: `feat(engine): review requests`.

## 2. Review logic (pure, test first)

- [ ] 2.1 Failing unit tests for `Review/GameReview`: winning chances (cp and mate), classes at 0.1/0.2/0.3, the
      engine's own move never marked, the final position from the result, counts per side, the book exit and its
      player, a partial review. Implement.
- [ ] 2.2 Failing unit tests for practice: a player's mistakes and blunders only, accepted moves within 0.1 of the best,
      idempotent adding, scheduling through `TrainerSchedule`, the next due position. Implement.

## 3. API

- [ ] 3.1 `WebApi/Review/`: start (players or Admin, ended games only — 409 otherwise; missing
      positions produced to the review topic, marked requested), read (status, evaluated/positions, moves, counts, book
      exit; cache headers by status), add to practice. `WebApi/Practice/`: next, results, `GET /api/me/practice`.
      Commit: `feat(backend): game review`.
- [ ] 3.2 🐳 Integration test: a finished game reviewed against a fake answer on `analysis.results`; a game in play
      refused; a non-player refused; practice added once and scheduled.

## 4. Frontend

- [ ] 4.1 Failing vitest for `lib/review.ts` (graph points, marks as move-list suffixes, polling until complete, the
      practice answer check) and `lib/server/review.ts`. Implement + server functions.
- [ ] 4.2 Component tests (`components/review.tsx`): the graph (a click goes to the move), the marks, the better move
      and line, the book exit with its trainer link, practice feedback. The game page's review panel, `/practice`, the
      nav entry with the due count, the profile line. Commit: `feat(frontend): game review and practice`.
- [ ] 4.3 🐳 Playwright `e2e/review.spec.ts`: finish a short game against a person, start its review, see it complete
      with a marked move, add the mistakes, answer a practice position.

## 5. Docs

- [ ] 5.1 CLAUDE.md (review note), ROADMAP (game review built), Serena memory. Commit: `docs(repo): game-review`.
