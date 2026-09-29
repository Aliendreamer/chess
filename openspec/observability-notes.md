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
- **One unit-test failure in ~25 runs**, while `dotnet format` ran alongside; not reproduced, not identified.

## Open, for later

- The production frontend image does not load the Node SDK yet (it runs `node .output/server/index.mjs` without the
  OpenTelemetry packages); the deploy target is not implemented either.
- Alerting (Grafana alert rules on outbox lag, quarantine, unreachable members).
- The tail-sampling policy is written but off; production turns it on.
- A per-node view of individual games stays out: ids would explode the labels. Find a game's traces by `game.id`.
