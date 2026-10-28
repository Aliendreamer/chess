# tools/localdev — the local stack

Loaded when working under `tools/localdev`. Local URLs and the main `stack.sh` commands are in the root `CLAUDE.md`;
the backend's tracing rules (`ActorTracing`, one trace per user action) are in `apps/backend/CLAUDE.md`.

## Verify scripts (run from the repo root against the live stack)

```bash

tools/localdev/verify-auth.sh                  # curl-only login→/me→logout→revocation check vs the live stack
tools/localdev/verify-stack.sh                 # replica streaming + write→read, redpanda health/topics/round-trip, console
tools/localdev/verify-part0.sh [--cluster]     # login→ping→live→list→hub gate; --cluster kills backend-1 and re-checks
tools/localdev/verify-part1.sh [--cluster]     # two logins → queue pairing → fool's mate → ended 0-1 + PGN;
                                               # --cluster: 6 games, SIGTERM backend-1, all answer from the survivor
tools/localdev/verify-part2.sh [--quick]       # vs Stockfish: 10 moves at 1320/2000/max, engine restart mid-think, a full game
tools/localdev/verify-part4a.sh                # studies: import, variation saved, 409 on stale save, share, PGN, from a game
tools/localdev/verify-part4b.sh                # engine analysis: a random position evaluated, then served from the shared cache
tools/localdev/verify-members.sh               # member admin: create, first sign-in, deactivate → 401, reactivate, reset
tools/localdev/verify-observability.sh         # a move's trace in Tempo, its logs in Loki (once), metrics from both nodes, profiles
tools/localdev/stack.sh up --cluster            # adds backend-2 (down/ps/logs always include it)
tools/localdev/stack.sh up --tail-sampling      # collectors as in production: gateway + 2 samplers (combinable)
tools/localdev/verify-tail-sampling.sh         # synthetic traces: errors and slow operations kept whole, ~10 % of the rest
```

## Stack

- **Data plane (ROADMAP §2)** — `postgres` (primary, writes) streams to `postgres-replica` (hot standby,
  reads; seeded by `postgres/replica-entrypoint.sh` via `pg_basebackup -R`, replication role from
  `postgres/primary-init-replication.sh` — both only run on a FRESH data dir, so changes need `down -v`).
  `redpanda` (Kafka API, dev-container mode) + `redpanda-init` (creates `game.events`, `matchmaking.events`,
  `analysis.requests`, `analysis.results`; the integration fixture creates the engine and analysis topics itself) +
  `redpanda-console`. Backend env already carries
  `ConnectionStrings__PostgresReplica` and `Kafka__BootstrapServers` for Part 0 code.
- **Local stack** — `tools/localdev/docker-compose.yml`, project name `chess` (explicit, so volumes
  are `chess_*` and don't collide with other repos' `localdev_*`). Traefik routes by Host labels;
  Keycloak's issuer must resolve identically inside containers and in the browser (`extra_hosts`
  on the backend). Postgres is built (`postgres.dev.Dockerfile`) to include `pg_cron` +
  `pg_partman`. `tools/localdev/keycloak/` expects a realm export named `chess` with client
  `chess_api`; `keycloak-init` grants that client's service account realm-management roles and turns the
  `VERIFY_PROFILE` required action off (members have optional e-mail and maybe one-word names; a deployment's realm
  needs the same, or a new member is stuck on "update profile" at first sign-in).
- **Observability (observability, tail-sampling)** — `tools/localdev/observability/`: every app sends OTLP to
  `otel-collector`, which writes traces to Tempo, metrics to Prometheus's OTLP receiver (7 d) and logs to Loki; it
  also reads every other container's Docker log file (not the backend's or the engine's: theirs come over OTLP, never
  twice). Pyroscope holds profiles (the backend via the `CORECLR_*` variables in compose, the BFF via its Node agent;
  the engine is not profiled). Grafana dashboards are JSON in `observability/grafana/dashboards/` (provisioned, not
  editable in the UI: export and commit). Switches: `Observability:Enabled` (backend, engine; off in appsettings, on in
  compose) and `OTEL_ENABLED` (BFF).
  The collector configuration is merged from several `--config` files: `otel-collector.yml` (shared),
  `otel-connectors.yml` (span metrics and the service graph from every span, before any sampling; Tempo keeps only
  `local-blocks`) and `otel-traces-local.yml` (every trace kept). `stack.sh up --tail-sampling` swaps in
  `otel-traces-gateway.yml` (traces routed by trace id to the `otel-sampler` replicas) and `otel-sampler.yml`, which
  keeps errors, SERVER spans over 1 s (not 101 upgrades), actor messages over 500 ms, `consume …` records over 2 s,
  and 10 % of the rest. The `chess-engine` service is excluded from every slow rule by name: its time is the think
  time. Sampled traces leave logs and profiles pointing at dropped trace ids (known; see the observability note).
