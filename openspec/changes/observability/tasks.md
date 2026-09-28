Each group ends in one commit that passes its gate. 🐳 = needs Docker or the live stack, with the command that proves it.

## 1. Owner review

- [ ] 1.1 The owner confirms the proposal (decision 5: browser spans through the BFF, no sampling, retention,
      anonymous Grafana) and the design.

## 2. The stack

- [ ] 2.1 Add the services to `tools/localdev/docker-compose.yml`, pinned, with memory limits and `chess_*` volumes:
      `otel-collector`, `prometheus` (remote-write receiver, 15 d), `tempo` (metrics-generator → Prometheus, 72 h),
      `loki` (OTLP, 72 h), `pyroscope` (72 h), `grafana`, `postgres-exporter` ×2, `redis-exporter` and `cadvisor`.
      Add their configuration files, the Traefik route `grafana.chess.localhost`, and the provisioned datasources
      with the trace ↔ logs ↔ profiles links. `stack.sh` prints the Grafana URL. Confirm Redpanda's consumer-lag
      metric and record it in the design. 🐳 Proof: `stack.sh up`, then `verify-stack.sh` extended with the
      collector's health, `up` for every scrape target in Prometheus, and each Grafana datasource answering its health
      API. Commit `feat(repo): observability stack`.

## 3. Backend: export and the switch

- [ ] 3.1 Failing tests first: - `ObservabilityTests`: tracer, meter and logger providers are registered only when `Observability:Enabled`
      (today it keys on `Console`, so the new cases fail); - `SettingsTests`: the new `Observability` section (fails until `ObservabilityOptions` exists).

      Then build `ObservabilityOptions`:
      - OTLP exporters for traces, metrics and logs;
      - the resource: `service.name`, and the node as `service.instance.id`;
      - the built-in meters (ASP.NET Core, Kestrel, SignalR, HttpClient, Npgsql, `System.Runtime`);
      - Serilog's OTLP sink.

      Remove `Observability:Console`. Compose sets `Observability__Enabled=true`. 🐳 Proof: backend spans and metrics
      visible in Grafana Explore after `stack.sh up`. Commit `feat(backend): export telemetry over otlp`.

## 4. Backend: one trace across actors, the journal, Kafka and the relay

- [ ] 4.1 A failing replay test first: an event stored in the old format (a real serialized row, a fixed literal)
      is read back through the journal's actual serializer after `Trace` is added. It fails to compile until the
      member exists, then must pass unchanged. Add `string? Trace = null` to every domain event. Commit
      `feat(backend): events carry their trace context`.
- [ ] 4.2 Failing tests first: - `Traced`/`ActorTracing.Wrap`: a message is returned unwrapped with no current activity, and wrapped with one; - the shard extractors: the entity id comes from inside the envelope; - `ActorInstrumentation.Handle`: under an `ActivityListener`, a span `game MakeMove` whose parent is the
      envelope's context, with `game.id`, and the persisted event's `Trace` equal to that span.

      Wire every actor (games, invites, matchmaking, pings, the deadline sweeper, the journal publisher, the hub
      fan-out) and every sender (endpoints, consumers, `IGameStarter`). Timers start root spans. Commit
      `feat(backend): trace commands through the actors`.

- [ ] 4.3 Failing tests first: - the mapper and the publisher: a `traceparent` header when the event has `Trace`, none when it does not, and
      the envelope unchanged; - `ProjectionRunner`: a `consume` span per record, parented to the header, with the outcome tag; - `LiveFrame.Trace` is set by the publishing actor.

      Add headers to `KafkaEngineRequests` and `KafkaAnalysisRequests`. 🐳 Integration test (`nx integration-test
      backend`): a move produces a `game.events` record whose header continues the move's trace. Commit
      `feat(backend): trace context over kafka and the relay`.

## 5. Backend: actor, cluster and pipeline metrics

- [ ] 5.1 Failing tests first: - a `MeterListener` sees `chess.actor.messages`, `handle.duration` and `persist.duration` with actor, message
      and outcome for a handled `MakeMove`; - dead and unhandled messages are counted; - the label rule: no instrument in `chess.*` has an `id`-like tag key.

      Build `ClusterMetricsActor` (members, unreachable, singletons, `GetShardRegionState` → entities per region and
      shard; TestKit test on one node), and the pipeline meters in the publisher loop and `ProjectionRunner`.
      🐳 Proof: `verify-part1.sh --cluster` while watching the Actors & cluster panels in Explore. Commit
      `feat(backend): actor, cluster and pipeline metrics`.

## 6. Engine worker and profiling

- [ ] 6.1 Failing tests first, in the worker: - a request with a `traceparent` header is handled in a span of that trace, and its result carries it on; - `chess.engine.jobs` counts by kind and outcome.

      Add the OTLP export behind the same switch, and Serilog to OTLP. Commit `feat(engine): telemetry and trace
      continuation`.

- [ ] 6.2 Add the Pyroscope .NET profiler to the backend images (dev and prod, Alpine: the musl build) and the engine
      image (Debian: the glibc build), plus `Pyroscope.OpenTelemetry` for span profiles. Compose sets the profiler's
      environment. 🐳 Proof: `chess-backend` (both nodes) and `chess-engine` appear in Pyroscope with CPU and alloc
      profiles, and a span links to its profile. Commit `feat(repo): continuous profiling`.

## 7. Frontend: the BFF and the browser

- [ ] 7.1 Failing tests first (vitest): - the `/otel/v1/traces` handler: 404 when off, 413 over 256 KB, 429 over the rate, and the body forwarded
      unchanged to the collector when on; - the relay strips `trace` from a frame before it reaches the browser, and starts `relay.push` under it; - the `chess.bff` instruments.

      Add the Node SDK instrumentation file (`--import` in the dev and prod start commands; http, undici, runtime
      metrics; the Pyroscope agent), the lazy browser tracer (document load and fetch), enabled through the root
      loader. Commit `feat(frontend): tracing from the browser through the bff`.

## 8. Dashboards

- [ ] 8.1 Provision the dashboards as JSON in `tools/localdev/grafana/dashboards/`: Overview, Actors & cluster
      (with the node graph), Event pipeline, HTTP & BFF, Runtime & containers, Engine worker, Infrastructure. Every
      panel's query is checked against live data. 🐳 Proof: each dashboard renders with data after
      `verify-part1.sh --cluster` and `verify-part2.sh --quick`. Commit `feat(repo): grafana dashboards`.

## 9. Verify and docs

- [ ] 9.1 🐳 `tools/localdev/verify-observability.sh`: - make a move against the engine through the API, then find its trace in Tempo by `game.id`, with spans from
      `chess-backend` (endpoint, actor, persist, publish, consume) and `chess-engine`; - Prometheus has `chess_actor_messages_total` for both nodes; - Loki has logs with that trace id; - Pyroscope lists every service.

      A Playwright spec: a move from the browser yields a trace holding `chess-frontend-web`, `chess-frontend` and
      `chess-backend` spans. Run the whole e2e suite. Commit `test(repo): verify observability`.

- [ ] 9.2 CLAUDE.md, architecture, ROADMAP §7, and an experiment note for this change; archive. Commit
      `docs(repo): observability`.
