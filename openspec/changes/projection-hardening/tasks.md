Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build -p backend`. 🐳 marks
steps that need Docker or a human-run gate.

## 1. Concurrency token on the watermark

- [x] 1.1 Failing test first (`PingProjectionTests`, `PositionedProjectionTests`): two `ProjectDbContext`s on
      the same InMemory database both load `LastSeq = 1`, both apply `seq 2`, and both `SaveChanges`. Today
      the second save succeeds and `Count` reads 2 where it should read 1. After the change, the second must
      throw `DbUpdateConcurrencyException`.
- [x] 1.2 `IsConcurrencyToken()` on `RmPing.LastSeq` and `ConsumerPosition.LastSeq`. Generate
      `./build_migration.sh "LastSeqConcurrencyToken"`. If the migration body comes out empty (expected, since
      only the snapshot changes), keep it anyway so the snapshot matches the model.
- [x] 1.3 Failing test for `ConflictDetector.IsConflict`: `true` for `DbUpdateConcurrencyException` and for a
      `DbUpdateException` whose inner `PostgresException` has `SqlState = "23505"`, `false` otherwise. It fails
      to compile until the class exists. Implement it.
- [x] 1.4 Commit: `feat(backend): lastseq concurrency token on projection watermarks`.

## 2. Dead-letter storage

- [x] 2.1 Failing test (`DeadLetterStoreTests`, InMemory): `ParkAsync` stores every field and `last_error`
      truncated to 2 000 chars. `IsQuarantinedAsync(group, agg)` is true only for that group. `NextAsync`
      returns the lowest `seq` first. `CountsAsync` groups distinct aggregates per group. It fails to compile
      until `ProjectionDeadLetter` / `DeadLetterStore` exist.
- [x] 2.2 Add the `ProjectionDeadLetter` entity, `ProjectionDeadLetterConfiguration` (table
      `projection_dead_letters`, index `(group_id, aggregate_id, seq)`, keyset index `(parked_at, id)`),
      `DeadLetterStore : BaseService, IDeadLetterStore`, and the D5 advisory-lock helper behind
      `Database.IsRelational()`. Generate `./build_migration.sh "AddProjectionDeadLetters"`.
- [x] 2.3 Add `Log.ProjectionParked` / `Log.ProjectionReplayed` `[LoggerMessage]` methods.
- [x] 2.4 Commit: `feat(backend): projection dead-letter store`.

## 3. ProjectionRunner (attempts, conflicts, parking)

- [ ] 3.1 Failing tests (`ProjectionRunnerTests`, fake `IProjection`, InMemory store, 1 ms backoff). Each
      fails because `ProjectionRunner` doesn't exist yet: - throws twice then succeeds → applied once, nothing parked; - always throws → parked after exactly 5 calls, `attempts = 5`, and `RunAsync` returns normally so the
      host can commit; - aggregate already quarantined → parked with **zero** projection calls; - quarantine for group A doesn't affect group B; - `ProjectionGapException` → rethrown on the first call and never parked, even when repeated past the limit; - conflict once, then success → 2 calls, 0 attempts counted, nothing parked; - 4 consecutive conflicts → counted as one failed attempt; - unparseable value that throws → parked under the Kafka key with `seq 0`; - cancellation → `OperationCanceledException` propagates, nothing parked.
- [ ] 3.2 Implement `ProjectionRunner` and `DeadLetterOptions` (`Projections:DeadLetter`, `MaxAttempts` 5,
      `BaseDelay` 200 ms, cap 5 s, `MaxConflictRetries` 3). Resolve the projection in a fresh scope per attempt.
- [ ] 3.3 Wire the runner into `KafkaConsumerHost`'s `SelectAsync`. The existing `RunOnceWithRetryAsync` tests
      must still pass unchanged. Register the options and runner in `BuilderExtension`.
- [ ] 3.4 Commit: `feat(backend): park failing projection events and quarantine the aggregate`.

## 4. Replay, admin endpoints, health

- [ ] 4.1 Failing tests (`DeadLetterReplayerTests`): - replay of `seq 7, 8` applies both in order, deletes them, and lifts the quarantine; - a failure on `seq 7` stops the replay with `seq 7, 8` still parked and returns the error with applied = 0; - an unknown group returns a not-found result.
- [ ] 4.2 Implement `DeadLetterReplayer : BaseService, IDeadLetterReplayer`. Add the thin
      `[ExcludeFromCodeCoverage]` endpoints under `WebApi/Admin/`: - `GET api/admin/projections/dead-letters`: keyset paging, `?groupId=` filter; - `POST api/admin/projections/{groupId}/dead-letters/{aggregateId}/replay`: `200` / `404` / `409`.

      Both are restricted to `Roles(Constants.Roles.Admin)`.

- [ ] 4.3 Failing test (`DeadLetterHealthCheckTests`): no rows → Healthy. One quarantined aggregate →
      Degraded with `data["chess.rm-pings"] = 1`. Implement it and register it as `projection-dead-letters`
      with `failureStatus: Degraded`.
- [ ] 4.4 Commit: `feat(backend): replay dead-lettered projection events`.

## 5. Integration proof on real Postgres 🐳

- [ ] 5.1 🐳 In `Chess.Backend.IntegrationTests`, two contexts race a first insert for the same ping. The loser
      is recognised by `ConflictDetector` as `23505`, and after the runner's retry `rm_pings.Count == 1`.
- [ ] 5.2 🐳 A test-only projection throws on one aggregate: - `seq 1` is parked; - `seq 2` of the same aggregate is parked without a call; - another aggregate on the same topic is applied; - the Kafka offset has advanced past all three; - after a fix flag is flipped, replay applies `seq 1, 2`, the next produced `seq 3` applies live,
      and the table is empty.
- [ ] 5.3 🐳 A replay and a concurrent park for one aggregate never leave an orphan row with the quarantine
      lifted. Hold the D5 lock from the test and assert the consumer waits.
- [ ] 5.4 🐳 Gate: `pnpm exec nx integration-test backend` green, run by a human if the sandbox is on.
- [ ] 5.5 Commit: `test(backend): projection conflicts and dead letters against postgres`.

## 6. Live stack and docs

- [ ] 6.1 🐳 `tools/localdev/stack.sh up`, then `tools/localdev/verify-part0.sh` and `verify-part0.sh --cluster`
      are still green. `curl` `/health` shows `projection-dead-letters: Healthy`.
- [ ] 6.2 Correct `docs/superpowers/notes/part0-experiment.md` item 4 (ShardCount: full-cluster restart, not a
      migration; 50 kept) and mark items 6 and the concurrency token done, pointing at this change.
- [ ] 6.3 Update `openspec/architecture.md` §4: replace the "Open" note with the conflict retry and the
      dead-letter/quarantine flow (add a `parked` branch to the flowchart), and add `projection-dead-letters`
      to the health notes. Update the CLAUDE.md "Journal outbox" note with one line on parking and replay.
- [ ] 6.4 Commit: `docs(repo): projection hardening in architecture and part 0 notes`.
