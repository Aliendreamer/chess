## Context

- **Already there:**
  - The backend references OpenTelemetry (API, Hosting, ASP.NET, HTTP, Npgsql instrumentation) but exports only
    to the console, behind `Observability:Console`.
  - One `chess.actors` source traces pings only.
  - Logs are Serilog to the console.
- **Four processes to observe:** backend-1 and backend-2 (Akka cluster, sharded `games` and `invites`, singletons for
  matchmaking, deadlines and the journal publisher), the engine worker, and the BFF (Nitro, a server-side SignalR
  client for the relay).
- **Two ways work travels:**
  - **Synchronous:** HTTP → Ask → actor.
  - **Asynchronous:**
    - actor → journal → (later) the publisher → Kafka → consumers → actors or the worker → Kafka → consumers;
    - live frames: actor → DistributedPubSub → hub → BFF → browser.
  - Neither actor mailboxes nor the journal carry `Activity` context today, so every hop starts a new trace.

## Goals / Non-Goals

**Goals:**

- One trace per user action across every hop above.
- Actor, cluster and pipeline metrics that answer "what is each node doing" without a paid agent.
- Logs and profiles linked to traces.
- Dashboards as code, the stack always on locally, each app's export a switch.

**Non-Goals:** alerting, a production deployment of the stack, per-game metric labels, tracing Keycloak or
Traefik (their logs do reach Loki, D9).

## Decisions

### D1 — Stack topology

```text
backend-1/2, engine ──OTLP gRPC──┐                 ┌─▶ Tempo ──metrics-generator (service graph, span metrics)──┐
BFF (Node) ─────────OTLP HTTP────┼─▶ otel-collector ┼─▶ Loki (OTLP)                                               │
browser ──/otel/v1/traces on app.─┘  (via the BFF)  └─▶ Prometheus (OTLP receiver) ◀──────────────────────────────┘
                                                          ▲ scrapes: redpanda /public_metrics, postgres-exporter ×2,
apps ──profiles──▶ Pyroscope                               redis-exporter, cadvisor, collector self-metrics
Grafana ─▶ Prometheus · Tempo · Loki · Pyroscope (provisioned)
```

- Apps speak plain OTLP to one collector. Moving to a hosted backend later is a change of endpoint.
- The collector pushes the apps' metrics to Prometheus's native OTLP receiver (`--web.enable-otlp-receiver`), which
  promotes `service.name`, `service.instance.id` and `deployment.environment` to labels. Apps need no scrape targets
  and new nodes appear without configuration. Tempo's metrics-generator uses remote write
  (`--web.enable-remote-write-receiver`). Prometheus still scrapes the infrastructure: Redpanda, both Postgres
  exporters, Redis, cAdvisor, and the stack's own services.
- All the configuration lives in `tools/localdev/observability/`.
- Profiles go straight to Pyroscope: the collector's profiles pipeline is still experimental.
- **Alternatives:**
  - The `grafana/otel-lgtm` all-in-one image: one opaque development image, each part's configuration and
    retention cannot be tuned or deployed separately.
  - Grafana Alloy instead of the collector: the owner asked for OpenTelemetry, and the collector is vendor-neutral.
  - Jaeger instead of Tempo: no service-graph metrics, and a weaker link from traces to logs and profiles.
- All images are pinned by tag. Each service gets a memory limit; the stack adds about 1.5–2 GB.

### D2 — The switch and the resource

- **Backend and engine:** `ObservabilityOptions : ISettings` (section `Observability`):
  - `Enabled` (false);
  - `OtlpEndpoint` (`http://otel-collector:4317`);
  - `SampleRatio` (1.0): a parent-based ratio sampler, so a trace is decided once where it starts and every hop
    follows;
  - `Environment` (`local`).
- **BFF:** `OTEL_ENABLED` and the standard `OTEL_EXPORTER_OTLP_ENDPOINT`.
- `appsettings.json` keeps export off, so unit tests, integration tests and a bare `dotnet run` export nothing; compose
  turns it on for every app.
- Off means no exporters and no listeners: `ActivitySource.StartActivity` returns null and the code paths below cost
  a null check.
- **The resource:**
  - `service.name`: `chess-backend`, `chess-engine`, `chess-frontend` or `chess-frontend-web`;
  - `service.instance.id`: the node's Akka hostname, or the container hostname;
  - `deployment.environment`.
- `Observability:Console` is removed.

### D3 — Trace context across actor mailboxes

- **The envelope:** `Traced(object Message, string TraceParent, string? TraceState)`.
  - Senders call `ActorTracing.Wrap(message)`; it returns the message unchanged when there is no current `Activity`.
  - Senders: endpoints, the consumers that command actors, and actors that command other actors (`IGameStarter`).
  - With tracing off, nothing is wrapped: message types and sharding stay exactly as today.
- **Sharding:** the message extractors unwrap `Traced` for the entity id and deliver the envelope.
- **Actors:** each actor's receive goes through one helper, `ActorInstrumentation.Handle(actorType, message,
handler)`. It unwraps, starts a span `{actor} {message}` (for example `game MakeMove`) whose parent is the
  envelope's context, records the handling time and outcome, and restores nothing afterwards: actors are
  single-threaded per message.
- **Tags:** entity ids (`game.id`, `invite.id`) are span tags, never metric labels.
- **Alternatives:**
  - A `TraceParent` property on every command record: every command changes, and one forgotten property silently
    breaks a trace.
  - Akka's own OpenTelemetry support: none in 1.5.
  - Phobos: paid.

### D4 — Trace context across the journal

- **Every domain event gets an optional last member, `string? Trace = null`.**
  - The actor sets it from the span of the command that produced the event.
  - Events from timers (flag fall, abandonment, deadlines) take the timer's own root span.
  - Old journal rows have no such member and read as null. The first backend task proves this with a replay test
    against the journal's actual serializer.
- **Persist latency:** a child span `persist {event}`, started at `Persist` and ended in the callback, plus a
  histogram.
- **Alternatives:**
  - A side table `(persistence_id, seq) → traceparent`: a second write per event, not atomic with the journal, and a
    join at publish time.
  - `Tagged` tags: they would fill the tag table with one-off tags.
  - A wrapper type written by an event adapter: it changes the journal's stored type names, which are a contract
    (`Chess.Backend.Events.X`).

### D5 — Kafka headers

- **Producers:**
  - `JournalPublisherLoop` produces each record inside a span `publish {topic}` (kind Producer). Its parent is the
    event's `Trace`; with none, it is a new root.
  - It writes `traceparent` (and `tracestate`) as record headers.
  - The envelope JSON does not change: that is the event-publishing contract.
  - The same holds for `KafkaEngineRequests`, `KafkaAnalysisRequests` and the worker's result producers.
- **Consumers:**
  - `ProjectionRunner` reads the headers and runs every attempt of `ApplyAsync` inside `consume {topic} {group}`
    (kind Consumer), with the outcome as a tag: applied, skipped, retried, parked, or gap.
  - Consumers that command actors (`EngineMoveConsumer`, the analysis results) wrap the command (D3).
  - The worker continues the request's trace and injects it into its result.
- The publisher runs after the actor has answered, so its span starts after the request's span has ended. Tempo shows
  this honestly as a gap: it is the outbox's latency, which is worth seeing.

### D6 — Live frames and the relay

- `LiveFrame` gains an optional `Trace`, set by the actor that published it.
- `HubFanOutActor` passes it through.
- The BFF starts `relay.push {kind}` as a child span and strips `Trace` before the frame reaches the browser.
- A player's move therefore shows the frame reaching the other player's socket.

### D7 — The BFF and the browser

- **The BFF:**
  - `@opentelemetry/sdk-node` starts before the app: a `--import` file in the dev and prod start commands.
  - Instrumentations: `http` and `undici`, so every `fetch` to the API carries `traceparent` and the backend's
    ASP.NET span joins it.
  - A `chess.bff` meter: open relay sockets, hub subscriptions, frames pushed, sockets refused (4400/4401), hub
    reconnects.
- **The browser:**
  - The web SDK with document-load and fetch instrumentation. Calls to server functions are same-origin fetches, so
    they carry `traceparent` into the BFF.
  - Spans are exported with OTLP/HTTP to `POST /otel/v1/traces` on `app.`. That BFF route forwards to the collector,
    with a body limit (256 KB), per-IP rate limiting, and a 404 when `OTEL_ENABLED` is off.
  - Whether it is enabled reaches the page through the root loader, never a `VITE_` variable. The tracer is
    loaded lazily only when enabled.
- **Alternative:** browser → collector directly: a second origin and CORS, against ROADMAP §1.5.

### D8 — Metrics catalogue

The rule for labels: types, groups, topics, regions and shard numbers only. Never game, user or invite ids.

| Meter                                                                    | Instrument                                                                         | Labels                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------- |
| `chess.actors`                                                           | `chess.actor.messages` (counter)                                                   | actor, message, outcome         |
|                                                                          | `chess.actor.handle.duration` (histogram)                                          | actor, message                  |
|                                                                          | `chess.actor.persist.duration` (histogram)                                         | actor, event                    |
|                                                                          | `chess.actor.recovery.duration` (histogram)                                        | actor                           |
|                                                                          | `chess.actor.passivations` (counter)                                               | actor                           |
|                                                                          | `chess.akka.dead_letters` (counter)                                                | message, kind (dead, unhandled) |
| `chess.cluster` (sampled every 10 s by a `ClusterMetricsActor` per node) | `chess.cluster.members`                                                            | status                          |
|                                                                          | `chess.cluster.unreachable`                                                        | —                               |
|                                                                          | `chess.cluster.singleton` (1 on the hosting node)                                  | singleton                       |
|                                                                          | `chess.shard.entities` (from the local region's `GetShardRegionState`)             | region, shard                   |
| `chess.pipeline`                                                         | `chess.outbox.lag`                                                                 | topic                           |
|                                                                          | `chess.outbox.published`                                                           | topic                           |
|                                                                          | `chess.projection.records`                                                         | group, outcome                  |
|                                                                          | `chess.projection.duration`                                                        | group                           |
|                                                                          | `chess.projection.quarantined`                                                     | group                           |
| `chess.engine` (worker)                                                  | `chess.engine.jobs`                                                                | kind, outcome                   |
|                                                                          | `chess.engine.think.duration`                                                      | kind                            |
|                                                                          | `chess.engine.restarts`, `chess.engine.dropped`                                    | kind                            |
| built-in                                                                 | ASP.NET Core, Kestrel, SignalR, HttpClient, Npgsql, `System.Runtime`, Node runtime | as shipped                      |

- The node label comes from the resource (`service.instance.id`), promoted to a Prometheus label by the collector.
- Consumer lag per group comes from Redpanda: `redpanda_kafka_consumer_group_lag_sum` / `_lag_max` (label
  `redpanda_group`). Redpanda only reports it with `consumer_lag` in `enable_consumer_group_metrics`, which
  `redpanda-init` sets.
- The existing health checks (`/health` publisher lag, dead letters) stay as they are. The gauges read the same
  sources.

### D9 — Logs: every log in the stack goes to Loki

Two paths, so that nothing is collected twice:

- **Our apps, over OTLP (structured, linked to traces):**
  - The backend and the engine worker: Serilog adds an OTLP sink when `Enabled` (`Serilog.Sinks.OpenTelemetry`),
    next to the console sink. Trace and span ids come from `Activity.Current`, so a log written while handling a
    message is linked to that message's span. Structured properties (game id, topic, group) become log attributes.
  - The BFF: a small `lib/server/log.ts` replaces its `console.*` calls. It writes to the console and, when
    `OTEL_ENABLED`, emits through the OpenTelemetry Logs API with the active span's context.
- **Everything else, from container output:**
  - The collector's `filelog` receiver reads Docker's `json-file` logs from `/var/lib/docker/containers`, mounted
    read-only (Docker runs natively in WSL here, so the files are on the host).
  - A compose logging anchor on every service sets the driver's `tag` to the container name (`chess-keycloak-1`).
    The collector turns it into the service name (`keycloak`), which becomes Loki's `service_name`. The same anchor
    caps each log file (10 MB × 3).
  - Covered: Postgres (primary and replica), Redpanda, Keycloak, Traefik, Redis, Mailpit, and the stack's own
    services.
  - The containers of our apps are excluded here, because their logs already arrive over OTLP.
  - Multi-line entries (a Java stack trace in Keycloak) are joined by the receiver's recombine operator.
- **In Grafana:**
  - Loki's `trace_id` links to Tempo, and Tempo spans link to Loki.
  - A **Logs** dashboard: every service's volume by level, errors across the stack, and a live tail filtered by
    service, level and text.
- **Alternative:** Promtail or Alloy with Docker service discovery. That is one more agent, while the collector is
  already there.

### D10 — Profiling

- **.NET:** the Pyroscope .NET profiler (native library plus `CORECLR_*` environment variables) is in the backend
  and engine images. It is turned on by compose (`PYROSCOPE_SERVER_ADDRESS`), with CPU, allocation, lock and
  exception profiling. The profiler loads before the app, so it is an environment switch, not `appsettings`.
- **Span profiles:** `Pyroscope.OpenTelemetry` tags samples with the span id, so Grafana opens the profile of one
  slow span.
- **Node:** `@pyroscope/nodejs` in the BFF's instrumentation file when the address is set.
- **Alternative:** eBPF profiling (Alloy): a privileged container, and it cannot see .NET or Node frames without
  their own agents anyway.

### D11 — Grafana

- **Provisioned from `tools/localdev/observability/grafana/`:**
  - datasources: Prometheus (default), Tempo (traces → logs, traces → profiles, service map from Prometheus), Loki
    (the `trace_id` field → Tempo), Pyroscope;
  - dashboards (JSON), one per area in the proposal.
- No anonymous access. Test accounts: `admin` / `Admin123!` (`GF_SECURITY_ADMIN_*` in compose) and `viewer` /
  `Viewer123!`, created through Grafana's API by a `grafana-init` step (the `keycloak-init` pattern). Signing in
  through the Keycloak realm is possible later with generic OAuth.
- Dashboards are code: an edit made in the UI is exported back to the repo, and the provisioning refuses to let the
  UI overwrite the file.

### D12 — Retention and sampling

- **Locally every trace is kept** (`SampleRatio` 1.0). Traffic is a few people clicking, so storage is megabytes,
  and the trace being hunted must never be the one dropped.
- **For production**, two knobs, both configuration only:
  - the apps' parent-based `SampleRatio` (head sampling, cheap);
  - a `tail_sampling` processor in the collector, written but not in the local pipeline. It keeps every trace with
    an error, every trace over 1 s, and 10 % of the rest, deciding once the trace is complete.
- **Retention:** Prometheus 7 days, Tempo 72 h, Loki 72 h, Pyroscope 72 h, on named volumes (`chess_*`).
  `stack.sh down -v` clears them.

## Risks / Trade-offs

- [The journal's serializer rejects an event without the new member] → The first backend task replays a stored
  old-format row through the real serializer before anything else changes.
- [Telemetry becomes a domain field] → `Trace` is optional, never read by the domain, and documented as metadata.
  The alternatives (D4) cost more.
- [Instrumentation overhead in the actors] → With export off, the cost is one null check. With it on, a span and
  two instrument updates per message, which is small next to a Postgres persist. The Actors dashboard shows handling
  time, so a regression is visible.
- [Label explosion] → The label rule in D8, checked by a unit test on the meter's tag keys.
- [The profiler on the backend base image] → The native library must match the image's C library. Task 6 checks it
  and picks the matching build.
- [RAM on a laptop] → Memory limits per service. The apps can turn export off, but the stack itself always runs
  (owner decision 1).
- [The browser endpoint is abused] → Body limit, rate limit, 404 when off, and it only ever forwards to the
  collector.

## Migration Plan

- There is no data migration. New events carry `Trace`; old ones replay without it.
- Rolling back the code leaves `Trace` in newer rows, which the old code ignores (unknown JSON members are skipped).
- The stack's services and volumes are additive; removing them changes nothing in the apps.

## Open Questions

- The backend image's C library for the Pyroscope native profiler (task 6).
