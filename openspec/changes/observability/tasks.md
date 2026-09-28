Each group ends in one commit that passes its gate. 🐳 = needs Docker or the live stack, with the command that proves it.

## 1. Owner review

- [x] 1.1 The owner confirms the proposal (decisions 5–9: browser spans through the BFF, every log in Loki, sampling
      as a setting, retention, Grafana logins) and the design.

## 2. The stack

- [x] 2.1 Add the services to `tools/localdev/docker-compose.yml`, pinned, with memory limits and `chess_*` volumes:
      `otel-collector`, `prometheus` (OTLP and remote-write receivers, 7 d), `tempo` (metrics-generator → Prometheus, 72 h),
      `loki` (OTLP, 72 h), `pyroscope` (72 h), `grafana`, `postgres-exporter` ×2, `redis-exporter` and `cadvisor`.
      Add their configuration files, the Traefik route `grafana.chess.localhost`, and the provisioned datasources
      with the trace ↔ logs ↔ profiles links. Grafana has anonymous access off, the `admin` account from compose, and a
      `grafana-init` step that creates `viewer`. The collector carries the tail-sampling policy, off.
      `stack.sh` prints the Grafana URL and logins. Confirm Redpanda's consumer-lag metric and record it in the design (`redpanda_kafka_consumer_group_lag_sum`, enabled by `redpanda-init`).
- [x] 2.2 Container logs to Loki (design D9): a compose logging anchor on every service (`json-file`, `tag` = the
      service name), and the collector's `filelog` receiver on `/var/lib/docker/containers` (read-only), with
      multi-line recombining. The backend, engine and frontend containers are excluded (their logs come over OTLP).
      🐳 Proof for group 2: `stack.sh up`, then `verify-stack.sh` extended with the collector's health, `up` for every
      scrape target in Prometheus, each Grafana datasource answering its health API, and a Loki query returning lines
      for `keycloak`, `postgres` and `redpanda`. Commit `feat(repo): observability stack`.

## 3. Backend: export and the switch

- [x] 3.1 Failing tests first. `ObservabilityTests`: tracer, meter and logger providers are registered only when
      `Observability:Enabled` (today it keys on `Console`, so the new cases fail). `SettingsTests`: the new
      `Observability` section (fails until `ObservabilityOptions` exists). Then build `ObservabilityOptions`, the
      OTLP exporters for traces, metrics and logs, the parent-based `SampleRatio` sampler, the resource (`service.name`, the node as `service.instance.id`),
      the built-in meters (ASP.NET Core, Kestrel, SignalR, HttpClient, Npgsql, `System.Runtime`) and Serilog's OTLP
      sink. Remove `Observability:Console`. Compose sets `Observability__Enabled=true`. 🐳 Proof: backend spans,
      metrics and logs visible in Grafana Explore after `stack.sh up`. Commit
      `feat(backend): export telemetry over otlp`.

## 4. Backend: one trace across actors, the journal, Kafka and the relay

- [x] 4.1 A failing replay test first: an event stored in the old format (a real serialized row, a fixed literal) is
      read back through the journal's actual serializer after `Trace` is added. It fails to compile until the member
      exists, then must pass unchanged. Add `string? Trace = null` to every domain event. Commit
      `feat(backend): events carry their trace context`.
- [x] 4.2 Failing tests first. `ActorTracing.Wrap` returns the message unwrapped with no current activity and wrapped
      with one. The shard extractors take the entity id from inside the envelope. Under an `ActivityListener`,
      `ActorInstrumentation.Handle` makes a span `game MakeMove` whose parent is the envelope's context, tagged
      `game.id`, and the persisted event's `Trace` equals that span. Then wire every actor (games, invites,
      matchmaking, pings, the deadline sweeper, the journal publisher, the hub fan-out) and every sender (endpoints,
      consumers, `IGameStarter`); timers start root spans. Commit `feat(backend): trace commands through the actors`.
- [x] 4.3 Failing tests first. The mapper and the publisher add a `traceparent` header when the event has `Trace`,
      none when it does not, and leave the envelope unchanged. `ProjectionRunner` makes one `consume` span per
      record, parented to the header, with the outcome tag. The publishing actor sets `LiveFrame.Trace`. Then add
      the headers to `KafkaEngineRequests` and `KafkaAnalysisRequests`. 🐳 Integration test
      (`pnpm exec nx integration-test backend`): a move produces a `game.events` record whose header continues the
      move's trace. Commit `feat(backend): trace context over kafka and the relay`.

## 5. Backend: actor, cluster and pipeline metrics

- [x] 5.1 Failing tests first. A `MeterListener` sees `chess.actor.messages`, `chess.actor.handle.duration` and
      `chess.actor.persist.duration` with actor, message and outcome for a handled `MakeMove`. Dead and unhandled
      messages are counted. The label rule: no instrument in `chess.*` has an id-like tag key. Then build
      `ClusterMetricsActor` (members, unreachable, singletons, and `GetShardRegionState` → entities per region and
      shard; a TestKit test on one node) and the pipeline meters in the publisher loop and `ProjectionRunner`.
      🐳 Proof: `verify-part1.sh --cluster` while watching the Actors & cluster panels in Explore. Commit
      `feat(backend): actor, cluster and pipeline metrics`.

## 6. Engine worker and profiling

- [x] 6.1 Failing tests first, in the worker. A request with a `traceparent` header is handled in a span of that
      trace, and its result carries the trace on. `chess.engine.jobs` counts by kind and outcome. Then add the OTLP
      export behind the same switch, and Serilog to OTLP. Commit `feat(engine): telemetry and trace continuation`.
- [ ] 6.2 Add the Pyroscope .NET profiler to the backend images (dev and prod, Alpine: the musl build) and the engine
      image (Debian: the glibc build), plus `Pyroscope.OpenTelemetry` for span profiles. Compose sets the profiler's
      environment. 🐳 Proof: `chess-backend` (both nodes) and `chess-engine` appear in Pyroscope with CPU and alloc
      profiles, and a span links to its profile. Commit `feat(repo): continuous profiling`.

## 7. Frontend: the BFF and the browser

- [ ] 7.1 Failing tests first (vitest). The `/otel/v1/traces` handler answers 404 when off, 413 over 256 KB and 429
      over the rate, and forwards the body unchanged to the collector when on. The relay strips `trace` from a frame
      before it reaches the browser and starts `relay.push` under it. `lib/server/log.ts` writes to the console and,
      when on, emits an OpenTelemetry log record carrying the active span. The `chess.bff` instruments. Then add the
      Node SDK instrumentation file (`--import` in the dev and prod start commands; http, undici, runtime metrics,
      logs; the Pyroscope agent), replace the BFF's `console.*` calls with `log.ts`, and add the lazy browser tracer
      (document load and fetch), enabled through the root loader. Commit
      `feat(frontend): tracing from the browser through the bff`.

## 8. Dashboards

- [ ] 8.1 Provision the dashboards as JSON in `tools/localdev/observability/grafana/dashboards/`: Overview, Actors & cluster (with
      the node graph), Event pipeline, HTTP & BFF, Runtime & containers, Engine worker, Infrastructure and Logs.
      Check every panel's query against live data. 🐳 Proof: each dashboard renders with data after
      `verify-part1.sh --cluster` and `verify-part2.sh --quick`. Commit `feat(repo): grafana dashboards`.

## 9. Verify and docs

- [ ] 9.1 🐳 `tools/localdev/verify-observability.sh`. Make a move against the engine through the API, then find its
      trace in Tempo by `game.id`, with spans from `chess-backend` (endpoint, actor, persist, publish, consume) and
      `chess-engine`. Prometheus has `chess_actor_messages_total` for both nodes. Loki has the backend's logs with
      that trace id (once each) and lines from `keycloak` and `postgres`. Pyroscope lists every service. Then a
      Playwright spec: a move from the browser yields a trace holding `chess-frontend-web`, `chess-frontend` and
      `chess-backend` spans. Run the whole e2e suite. Commit `test(repo): verify observability`.
- [ ] 9.2 CLAUDE.md, architecture, ROADMAP §7, and an experiment note for this change; archive. Commit
      `docs(repo): observability`.
