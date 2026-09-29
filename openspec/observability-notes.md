# Observability — experiment note

Closed on 2026-09-29. One change, `observability` (under `changes/archive/`). The local stack always runs an
OpenTelemetry Collector, Prometheus, Tempo, Loki, Pyroscope and Grafana with eight dashboards; every app exports
through a switch; one user action is one trace from the browser to the other player's socket.

**Checks behind it:**

- Backend: 695 unit tests and 35 integration tests, one of them a move's `game.events` record whose `traceparent`
  header continues the move's trace on real Redpanda.
- Engine worker: 50 tests. Frontend: 254 unit tests and 22 Playwright tests (all passing), one of them a browser move
  found in Tempo with browser, BFF and backend spans.
- `verify-stack.sh` (collector, scrape targets, Grafana logins and datasources, container logs with multi-line
  entries) and `verify-observability.sh` (a move against the engine: 47 spans across the backend and the engine, its
  logs once in Loki, metrics from both nodes, profiles) on the stack.

## What worked

- **Two choke points carried the whole backend.** Every actor's `AroundReceive` goes through `ActorTracing.Receive`,
  and every persist through `StampAll` + `Persisting`. Tracing and the actor metrics came from those two places, not
  from each handler.
- **The trace survives remoting.** A request on backend-2 whose game lives on backend-1 is one trace: the `Traced`
  envelope serializes like any command.
- **Old journal rows still read.** The new `Trace` member is optional, and a test replays real pre-change rows through
  the journal's own serializer.
- **Kafka payloads did not change.** `Trace` is `[JsonIgnore]` for System.Text.Json; it travels as a header.
- **The traces showed things at once:** the outbox's ~200–330 ms between the move and its record on Kafka, and one
  slow first consume after a restart (5 s) that later traces showed to be warm-up.

## What surprised us

- **A null-conditional call skipped the work.** `consume?.SetTag(tag, await RunAttemptsAsync(...))` never ran the
  projection when nothing traced (the call and its arguments are skipped). The existing runner tests caught it.
- **`UnhandledMessage` is an `AllDeadLetters`** in Akka.NET 1.5: it must be matched first, or it counts as dead.
- **The Pyroscope .NET profiler took the engine worker down** about 40 s into its first search (exit 0, no log), even
  CPU-only. The engine only drives Stockfish, so it is not profiled (owner decision). In the backend's dev image the
  profiler loads through a launch profile, so `dotnet watch` and the build servers stay out of the profiles.
- **Collector component names changed** (`otlp_grpc`, `otlp_http`, `file_log`), and Redpanda only reports consumer
  lag with `consumer_lag` in `enable_consumer_group_metrics`.
- **The BFF writes no logs of its own**, so the planned logger had nothing to carry; its container output is
  collected instead.
- **Browser spans named "POST".** TanStack calls `fetch(url, init)`, so the URL is only on the span; server-function
  names are decoded from it.
- **`--force-recreate` recreates dependencies too:** recreating the frontend took the proxy down with it.
- **A flaky test, found under load.** `StudyServiceTests.My_studies_are_mine_newest_first` failed 2 times in 30 with every
  core busy: studies made in one tick of the real clock were ordered by their random ids. It now moves a fake clock
  (0 failures in 50 loaded runs).
- **A missing peer dependency broke the SDK silently.** The BFF's telemetry package (`apps/frontend/otel`) did not
  declare `@opentelemetry/api`, so pnpm linked a variant of `sdk-node` it never installed; `pnpm install
--fix-lockfile` re-resolved it once the peer was declared.

## Open, for later

- The deploy target is not implemented; the production images are ready (the frontend's loads the Node SDK, off until
  `OTEL_ENABLED=true`; the backend's carries the profiler, off until `CORECLR_ENABLE_PROFILING=1`).
- Alerting (Grafana alert rules on outbox lag, quarantine, unreachable members).
- Sampling (the tail-sampling change) is ready and proven locally, not deployed; see below.

## Tail sampling (tail-sampling, 2026-09-29)

Locally every trace is kept. The production shape runs with `stack.sh up --tail-sampling`: the gateway
(`otel-collector`) routes traces by trace id to two samplers, which count every span (span metrics, service graph)
and then keep a trace if it has an error, a SERVER span over 1 s (not a 101 upgrade), an actor message over 500 ms, a
projection record over 2 s, or falls in the 10 % share. `verify-tail-sampling.sh` proved it twice with 280 synthetic
traces: every error and slow trace kept, and whole (the second span sent a second later still reached the same
sampler); 23 and 12 of 200 fast traces kept; 4 and 1 of 30 engine traces with a 7 s think; span metrics counting 200 of 200.

**Known: links to dropped traces.** Loki's log lines and Pyroscope's profiles keep the trace id of every trace,
including the ~90 % that sampling drops, so their "open trace" link finds nothing for those. How to adjust, cheapest
first:

1. Raise `sampling_percentage` in `otel-sampler.yml` (cost: Tempo storage).
2. Keep what matters with one more policy: an `ottl_condition` on an attribute (e.g. `attributes["game.id"] != nil` to
   keep every game's traces) or a `string_attribute` on a service name.
3. Make error logs always point at a kept trace: an error that is logged should also mark its span as an error (the
   backend's exceptions already do); the `errors` policy then keeps it.
4. Filter the link, not the data: search logs at level error or warn, whose traces are almost always kept.

The cost of scaling the samplers: while their number changes (DNS re-resolved every 5 s), traces in flight may be
split and judged on part of their spans. A sampler that dies loses the traces in its 10 s decision wait.

- A per-node view of individual games stays out: ids would explode the labels. Find a game's traces by `game.id`.
