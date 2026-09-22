Each group ends in one commit (`feat(backend): …` / `refactor(backend): …`) that passes
`pnpm exec nx run-many -t lint test build -p backend`. Inside the sandbox, build with
`-m:1 -nr:false -p:EnableSourceControlManagerQueries=false`. 🐳 marks steps that need Docker or a
human-run gate.

## 1. Tag events on persist

- [x] 1.1 Failing test first: `TopicTagger.ToJournal(pinged)` returns `Tagged` with tag `game.events`,
      and other events pass through untouched. It fails to compile until `TopicTagger` exists. The
      in-memory journal has no tag query, so the SQL `EventsByTag` path is proved in group 8.
- [x] 1.2 Add `TopicTagger : IWriteEventAdapter` (maps `Pinged` → `Tagged(evt, ["game.events"])`) and
      register it on the SQL journal in `AkkaHostingExtensions`. If the 1.5.70 Hosting API can't do
      it, fall back to `Persist(new Tagged(...))` in `PingActor` (design D2) and note it.
- [x] 1.3 Confirm `tag-write-mode`/`tag-read-mode` resolve to `TagTable` in the effective config.
      Add a test that reads `system.Settings.Config` so a package bump that changes the default fails loudly.
- [x] 1.4 Commit: `feat(backend): tag journal events with their kafka topic`.

## 2. Offset store and event mapping

- [x] 2.1 Failing tests: `PingedJournalMapper` builds the same key and `EventEnvelope` JSON as today's
      `PingActor` for `(ping-abc, seq 3)`. Without the mapper, the test doesn't compile or returns null. An
      unmapped event type throws `UnmappedJournalEventException`.
- [x] 2.2 Implement `IJournalEventMapper` and the registry. Register them through DI.
- [x] 2.3 EF migration `AddOutboxOffsets` (`./build_migration.sh "AddOutboxOffsets"`), then
      `outbox_offsets(stream_id pk, last_ordering, updated_at)`, seeded per tag with the journal's
      current `max(ordering)` so the first rollout doesn't re-publish history (design D4).
- [x] 2.4 Offset load and monotonic save are raw SQL on the lock connection (design D5), so they live in
      `PostgresPublisherLease` (group 3). They're proved there: a save of 5 after 10 leaves 10, and a load
      with no row throws instead of returning 0.
- [x] 2.5 Commit: `feat(backend): outbox offset table and journal event mappers`.

## 3. Advisory-lock fence

- [x] 3.1 (`PublisherLeaseTests`, 5/5 green) Failing integration test 🐳 (Postgres Testcontainer, `nx integration-test backend`): two
      `PublisherLock` instances target the same database. The second `TryAcquireAsync` returns false
      while the first holds the lock. After the first connection is closed, the second acquires. It fails
      until `PublisherLock` exists.
- [x] 3.2 Implement `PublisherLock`: a dedicated `NpgsqlConnection` with `Keepalive` set,
      `pg_try_advisory_lock(const)`, a 5 s `SELECT 1` liveness probe that raises `LockLost`, and
      `ExecuteOnLockConnectionAsync` for offset saves (design D5).
- [x] 3.3 Add `Log.cs` methods: `PublisherLeaseAcquired`, `PublisherLeaseBusy`, `PublisherStopped`.
- [x] 3.4 Commit: `feat(backend): postgres advisory lock fencing for the journal publisher`.

## 4. JournalPublisher stream (runs alongside the actor publish)

- [x] 4.1 Failing unit test (TestKit, in-memory journal, fake Kafka flow): persist 3 tagged pings, start
      the publisher from offset 0, then assert 3 records in order and a stored offset equal to the third ordering.
      A second test restarts from the stored offset and asserts 0 re-sent records. This pins
      `Offset.Sequence(n)` as exclusive.
- [x] 4.2 Implement the `JournalPublisher` actor. Order of work: acquire the lock, load the offset, build
      `EventsByTag` → map → `KafkaProducer.FlexiFlow` → `GroupedWithin(100, 200ms)` → save the offset on
      the lock connection. Run it with restart-with-backoff. Stop the stream on `LockLost`.
- [x] 4.3 Register it as a cluster singleton (`WithSingleton`, role `backend`), gated on
      `Kafka:BootstrapServers` being non-empty. Extend `KafkaRegistrationTests` to cover both states of that switch.
- [x] 4.4 Journal query tuning: `refresh-interval = 200ms`, `journal-sequence-retrieval.query-delay =
200ms` (design D7).
- [x] 4.5 🐳 Human gate: `tools/localdev/stack.sh down -v && tools/localdev/stack.sh up`, then
      `tools/localdev/verify-part0.sh`. Pings still project, and duplicates from the double path are
      skipped (`ProjectionSkippedReplay` in the logs).
- [x] 4.6 Commit: `feat(backend): journal-tailing kafka publisher as a fenced cluster singleton`.

## 5. Remove the dual write

- [x] 5.1 Failing test: a `PingActorTests` case that constructs `PingActor` without a publisher. It fails
      to compile until the constructor changes. Delete the tests that asserted the actor publishes
      (`PingTopics.Kafka` topic assertion).
- [x] 5.2 Remove `IEventPublisher` from `PingActor` and `PingShardingExtensions`, and remove `PublishFailed`.
      Delete `IEventPublisher`, `KafkaEventPublisher`, `NullEventPublisher` and their tests if nothing else uses them.
      Remove the producer DI registration in `BuilderExtension`.
- [x] 5.3 Commit: `refactor(backend): pingactor no longer publishes to kafka`.

## 6. Consumer idempotency

- [x] 6.1 Failing tests on `PingProjection`: (a) the same envelope twice → one increment (passes today —
      keep as the regression guard); (b) `last_seq = 3`, receive `seq = 5` → throws `ProjectionGapException`
      and the row is unchanged — fails today because the projection applies it.
- [x] 6.2 Extract the check into `IdempotencyGuard` (skip if `seq <= last`, throw if `seq > last + 1`) and
      use it in `PingProjection`; add `Log.ProjectionGap`.
- [x] 6.3 Failing tests for the `PositionedProjection<T>` base: a duplicate `(group, aggregate, seq)` is not
      re-applied; a gap throws; the effect and position are saved in one `SaveChanges`.
- [x] 6.4 EF migration `AddConsumerPositions` (`consumer_positions`, PK `(group_id, aggregate_id)`) and the
      base class. No consumer uses it yet; Part 1's first projection without a per-aggregate row will.
- [x] 6.5 Commit: `feat(backend): idempotency guard and consumer positions for kafka projections`.

## 7. Observability

- [x] 7.1 Failing test: `PublisherLagHealthCheck` returns _Degraded_ when lag is at least the threshold, and
      _Healthy_ below it. It never returns _Unhealthy_.
- [x] 7.2 Implement it (offset row plus `max(ordering)` from `akka` journal on the primary). Add the
      `Outbox:LagDegradedAfter` option with default 30 s' worth of orderings, or a time-based variant if
      simpler. Add a batch Activity on `chess.actors`.
- [x] 7.3 Commit: `feat(backend): publisher lag health detail`.

## 8. Integration proof 🐳

- [x] 8.1 `PingRoundTripTests` still passes unchanged. That proves the wire format.
- [x] 8.2 (3/3 green) New `OutboxRecoveryTests` (Testcontainers):
      (a) pause the Redpanda container, POST 5 pings, unpause, and assert all 5 `rm_pings` updates
      within 30 s;
      (b) reset the offset row to 0 on a populated stack, and assert no read model changes;
      (c) POST pings, dispose the host before the publisher's first batch, start a new host, and assert
      none are missing.
- [x] 8.3 (not automated in-process; proved live on 2026-09-23: during an accidental split brain — a restarted
      backend-1 self-joined into a second cluster — both sides ran a publisher singleton and backend-1 logged
      "lease is held elsewhere" every 5 s while exactly one publisher session existed in Postgres) Two-node test (the `PingApiFactory` cluster setup used by `verify-part0 --cluster`): concurrent
      pings on both nodes. Assert exactly one lock holder, no missing seq per key, and that after
      killing the publisher node the other node takes over and the rows complete.
- [x] 8.4 Run `pnpm exec nx integration-test backend` 🐳 plus `tools/localdev/verify-part0.sh --cluster` 🐳 (human).
- [x] 8.5 Commit: `test(backend): outbox recovery and two-node fencing`.

## 9. Docs and measurements

- [x] 9.1 Measure ping → replica row on the live stack and compare with the 250–500 ms baseline. Add it to
      `docs/superpowers/notes/part0-experiment.md`, and mark the dual-write item closed.
- [x] 9.2 Update `ROADMAP.md` principle 4 and §2 Recovery (agreed 2026-09-23):
      the journal is the recovery source and Kafka is derived from it.
- [x] 9.3 Update `CLAUDE.md` architecture notes (the publishing path) and `.serena/memories/backend/*`.
- [x] 9.4 Commit: `docs(repo): journal outbox closes the dual-write gap`.
