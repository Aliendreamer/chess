## 1. Data

- [ ] 1.1 Migration `TrainerStudyLines`: `trainer_progress."StudyId"` (uuid null, FK `studies` ON DELETE CASCADE),
      index (UserId, StudyId, Color). Failing test first: a model test asserting the FK and its cascade on
      `TrainerProgress` fails (no `StudyId`). Implement; `./build_migration.sh "TrainerStudyLines"`. The cascade
      itself is proven in 3.4.

## 2. Lines from a study (pure)

- [ ] 2.1 Failing unit tests for `Trainer/StudyLines`: main line first then variations in tree order; replies for the
      other side become separate lines; member-side alternatives become separate lines; a path with no move for the side
      is skipped; the key is stable when variations are reordered or promoted and changes when a move changes or the line
      is extended; a non-standard start FEN. Failure looks like: `StudyLines` does not exist. Implement.

## 3. Service and API

- [ ] 3.1 Failing unit tests for `TrainerService` study methods: only the owner's study (shared → null/404); lines with
      box and due; next uses `TrainerSchedule.Next` over the study's lines; a result for a line not in the study is
      refused; `MineAsync` ignores rows with a `StudyId`. Implement.
- [ ] 3.2 Failing unit test: `StudyService.UpdateAsync` removes the owner's progress rows whose keys are no longer lines
      of the saved tree and keeps the rest. Implement in the same `SaveChanges`.
- [ ] 3.3 `WebApi/Trainer/` `ListStudies`, `GetStudy`, `NextStudyLine`, `RecordStudyResult` (validators: id is a Guid,
      color white|black, mistakes ≥ 0; `no-store`; page size from `ApiOptions`; the POST has a body). `dotnet build`
      warning-clean (`-m:1 -nr:false -p:EnableSourceControlManagerQueries=false` in the sandbox); unit tests pass.
      Commit: `feat(backend): drill your own studies in the trainer`.
- [ ] 3.4 🐳 Integration test (`pnpm exec nx integration-test backend`, human-run in the sandbox): a member creates a
      study with a variation, drills it (clean, missed), promotes the variation (progress kept), extends a line (old row
      gone), deletes the study (rows gone); another member gets 404.

## 4. Frontend

- [ ] 4.1 Failing vitest for `lib/trainer.ts`: `fenAfter`/`sanAt`/`lineText`/`isMemberMove` from a start FEN (Black to
      move, move number 23); `otherLineMove` (a move that is another study line's at the same position); the study line
      label from where it leaves the main line. Failure looks like: wrong FEN after one ply from a Black-to-move start.
      Implement; existing opening-drill tests stay green.
- [ ] 4.2 `lib/server/trainer.ts` server functions (path inputs validated with `isGuid`) + vitest.
- [ ] 4.3 Component tests (`components/trainer.tsx`): the "Named openings | My studies" switch, the study list with
      progress, the drill's "your other line" message (no mistake counted). Implement `/trainer?source=studies`,
      `/trainer/study/$id`, "Train this study" on the owner's study page; `pnpm generate-routes`; `nx lint frontend` and
      `nx test frontend` pass. Commit: `feat(frontend): drill your own studies in the trainer`.
- [ ] 4.4 🐳 Playwright `e2e/trainer.spec.ts` (`tools/e2e.sh`, human-run): import a study PGN with one variation, train
      it as White, play the other line's move once (no mistake), finish both lines, see "2 of 2" after clean runs.

## 5. Docs

- [ ] 5.1 CLAUDE.md (trainer note: study lines, key rule, pruning on save), ROADMAP Part 6 (repertoire built), Serena
      memory. Commit: `docs(repo): study-repertoire-trainer`.
