## Why

We can't see what the system is doing. A slow move, a stalled projection or a hot actor shows up today only as a
symptom in the UI or a line in `docker logs`. Akka's own monitoring (Phobos) is a paid product. We build the same
insight from open tools: one trace per user action from the browser to every actor and consumer it touched; metrics
for actors, the cluster, the event pipeline, memory and requests; logs linked to traces; and continuous profiles.
Cross-cutting, after Part 4 (ROADMAP §7 "Observability").

## What Changes

**For a developer or operator (nothing changes for a player):**

- **Grafana** at `grafana.chess.localhost`, always part of `stack.sh up`, with dashboards already there:
  - **Overview:** requests per second, errors, latency, live games, messages per second.
  - **Actors & cluster:** cluster members and their status, which node hosts each singleton, and live entities per
    shard region and shard per node. Messages per second and handling time by actor type and message type, persist
    latency, recovery time, passivations, dead letters and unhandled messages. A node graph: nodes → regions → shards.
  - **Event pipeline:**
    - the journal publisher: how far Kafka is behind the journal, per topic;
    - consumer lag per group;
    - projections: applied, skipped (duplicates), retried, parked, stalled on a gap.
  - **HTTP & BFF:** rate, errors and latency per endpoint and per server function; open relay sockets and hub
    subscriptions.
  - **Runtime & containers:**
    - .NET per node: heap, GC pauses, thread pool, exceptions;
    - Node (the BFF): event-loop lag and heap;
    - memory and CPU per container.
  - **Engine worker:** jobs by kind (move, analysis), think time, engine restarts, requests dropped as too old.
  - **Infrastructure:** Postgres (primary and replica, replication lag), Redis, Redpanda.
- **One trace per user action, end to end.** A move made in the browser is one trace:
  - browser → BFF server function → API endpoint → the game actor handling `MakeMove`;
  - → journal persist → the journal publisher → Kafka;
  - → each consumer (projections, deadlines, notifications, the engine request) → the engine worker and its answer →
    the live frame pushed back through the relay.
  - Tempo's **service graph** draws the whole system from these traces, with rates and errors on each edge.
- **Every log in the stack in Loki**, searchable in Grafana (owner request 2026-09-28):
  - our apps (both backend nodes, the engine worker, the BFF) send structured logs carrying their trace id, so a
    span opens its logs and a log line opens its trace;
  - every other container (Postgres, Redpanda, Keycloak, Traefik, Redis, Mailpit) is collected from its output;
  - a **Logs** dashboard: volume and errors per service, and a live tail filtered by service, level and text.
- **Continuous profiling in Pyroscope** (CPU and allocations) for both backend nodes and the BFF, shown in Grafana as
  flame graphs. Not the engine worker: it only drives Stockfish (owner decision 2026-09-28).
- **Each app's telemetry is a switch:** `Observability:Enabled` (backend, engine) and `OTEL_ENABLED` (BFF). The
  stack always runs; an app with the switch off exports nothing and behaves the same. The stack turns it on.
  `Observability:Console` is replaced.

**In the code:**

- **Trace context crosses actor mailboxes:** a command sent to an actor is wrapped with the sender's trace context,
  and the actor handles it inside a span that continues that trace.
- **Trace context crosses the journal:** every persisted event carries the trace it was made in (W3C
  `traceparent`), so the publisher, Kafka and every consumer continue the same trace. Events already in the journal
  have none and start a new trace.
- **Kafka records** carry `traceparent` as a header: `game.events`, `engine.*` and `analysis.*`.
- **Live frames** carry the trace too: the relay's push is part of the move's trace.

## Owner decisions

1. **The stack is always on**; each app's export is a configuration switch (2026-09-28).
2. **Full-flow tracing**, from the front end to the back end and through the event pipeline; each event stores its
   trace context (2026-09-28).
3. **The actor and cluster view is built in Grafana**, not as an admin page in the app (2026-09-28).
4. **Continuous profiling with Pyroscope** is included (2026-09-28).
5. **The front end's part of a trace starts in the browser:** page loads, and calls to server functions. Browser spans
   go through the BFF (`/otel/v1/traces` on `app.`), never straight to the collector, so the browser still talks only
   to `app.` (ROADMAP §1.5) (2026-09-28).
6. **Every log in the stack goes to Loki** (2026-09-28).
7. **Sampling is a setting:** every trace is kept locally (`Observability:SampleRatio` 1.0, parent-based). A
   collector tail-sampling policy (every error, every trace over 1 s, 10 % of the rest) is ready but off, for
   production (2026-09-28).
8. **Retention:** metrics 7 days; traces, logs and profiles 3 days (2026-09-28).
9. **Grafana needs a login:** no anonymous access. Test accounts `admin` / `Admin123!` (edits) and `viewer` /
   `Viewer123!` (read-only), set by compose (2026-09-28).

## Out of scope

- Alerting and on-call rules.
- Running the stack in production (the deploy target is not implemented). The apps' side is plain OTLP, so a hosted
  backend is a change of endpoint.
- Phobos, and any paid agent.
- A per-game view: game ids would make metric labels explode. A single game is found by searching its trace in Tempo
  by `game.id`.
- Tracing inside Keycloak or Traefik.

## Capabilities

### New Capabilities

- `observability`: the local telemetry stack, what each app exports and the switch that controls it, trace
  propagation across actors, the journal, Kafka and the relay, the actor, cluster and pipeline metrics, the logs and
  profiles, and the dashboards.

### Modified Capabilities

- `event-publishing`: published records carry the event's `traceparent` as a Kafka header, next to the unchanged
  envelope.

## Impact

- **Stack (`tools/localdev`):**
  - new services: `otel-collector`, `prometheus`, `tempo`, `loki`, `pyroscope`, `grafana`, `postgres-exporter`
    (primary and replica), `redis-exporter` and `cadvisor`;
  - their configuration, Grafana provisioning and dashboards (JSON in the repo);
  - a Traefik route for Grafana;
  - a compose logging anchor on every service, and the collector reading Docker's container logs for Loki.
- **Backend:**
  - an OTLP export for traces, metrics and logs (Serilog to OTLP);
  - a trace envelope for actor commands, and an optional `Trace` on every domain event (old journal rows read as
    none);
  - spans and meters in the actors, the outbox, `ProjectionRunner` and the consumers;
  - cluster and sharding gauges;
  - Pyroscope's .NET profiler in the image.
- **Engine worker:** OTLP export, trace continuation from Kafka headers, a `chess.engine` meter, and the profiler.
- **Frontend (BFF):**
  - the OpenTelemetry Node SDK (server functions, `fetch` to the API with `traceparent`, relay metrics) and the
    Pyroscope Node agent;
  - `lib/server/log.ts` in place of `console.*`, sending structured logs with the trace;
  - a browser tracer that reports through a BFF route.
- **ROADMAP decisions:** settles §7 "Observability" (the collector, Grafana, the profile that was optional) and
  extends D8: Kafka records get headers.
- **Dependencies:**
  - NuGet: `OpenTelemetry.Exporter.OpenTelemetryProtocol`, `OpenTelemetry.Instrumentation.Runtime`,
    `Serilog.Sinks.OpenTelemetry`, `Pyroscope`;
  - npm: `@opentelemetry/sdk-node`, auto-instrumentations, the web SDK, `@pyroscope/nodejs`;
  - images: the Grafana stack and the exporters.
