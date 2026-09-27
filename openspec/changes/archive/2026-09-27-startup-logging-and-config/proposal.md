## Why

When the backend fails to start, nothing says why. Serilog is set up inside the host (`UseSerilog`), so an exception
while building it isn't logged: bad configuration, a DI error, a failed migration, a Kafka or Akka problem. The
process just exits. Successful startups are silent about what they did.

Separately, operational values are hard-coded across the code: timeouts, cache lifetimes, health-check limits,
retry delays. Some options classes exist but aren't bound, or aren't listed in `appsettings.json`, so nobody can
see or change them.

## What Changes

### 1. Startup logging

- **A Serilog bootstrap logger in `Program.cs`.** It's created before anything else and writes to the console in
  the same compact JSON as the configured logger. The whole startup runs in `try/catch/finally`:
  - any exception is logged at Fatal as `Startup failed at {Step}` with the exception, and the process exits with
    code 1;
  - `Log.CloseAndFlush()` always runs;
  - `HostAbortedException` is rethrown unlogged, because EF tooling and the test hosts use it on purpose.
- **Each startup step is logged at Information as it begins and ends:**
  - configuration loaded, with the environment and config sources;
  - the database registered;
  - the read replica registered;
  - common services, including Kafka on or off, Redis on or off, and the Akka node;
  - endpoints registered;
  - the host built;
  - migrations: the target database and how many were applied;
  - listening on its URLs;
  - startup complete, with the elapsed time.
- **A startup summary.** One log event with the settings that explain a node's behaviour: Akka host, port, seeds and
  roles; whether Kafka is enabled and its bootstrap host; Redis on or off; the primary and replica database hosts and
  names; the Keycloak authority and audience; the rate limit; the presence timings. **Secrets never appear**: no
  passwords, client secrets or full connection strings. A pure `StartupSummary` builds it from `IConfiguration`, so
  it can be unit-tested for what it hides.

### 2. Everything operational comes from configuration

Every tunable value moves into an options class bound from `appsettings.json`. The defaults equal today's values,
each class is validated at startup (`ValidateOnStart`, positive values), and every section appears in
`appsettings.json` with its defaults so it can be discovered.

| Value today (hard-coded)                                                                       | Setting                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------- |
| Live-snapshot ask timeouts, 5 s (game, queue, invite, ping live sources)                       | `Api:AskTimeoutSeconds`         |
| `Keyset.DefaultLimit` 50                                                                       | `Api:DefaultPageSize`           |
| `Keyset.MaxLimit` 500, which duplicates `Api:MaxPageSize` 200                                  | removed; `Api:MaxPageSize` only |
| Keycloak HTTP client timeout, 15 s                                                             | `Keycloak:HttpTimeoutSeconds`   |
| OIDC discovery cache, 1 h                                                                      | `Cache:OidcDiscoveryMinutes`    |
| User-id cache, 10 min                                                                          | `Cache:UserIdMinutes`           |
| FusionCache default duration, 10 min                                                           | `Cache:DefaultMinutes`          |
| Replica health: maximum lag, 10 s                                                              | `Database:ReplicaMaxLagSeconds` |
| Kafka health metadata timeout, 3 s                                                             | `Kafka:HealthTimeoutSeconds`    |
| Kafka consumer retry delay, 5 s                                                                | `Kafka:ConsumerRetrySeconds`    |
| Matchmaking sweep interval, 5 s                                                                | `Akka:MatchmakingSweepSeconds`  |
| Idle passivation of the ping and invite regions, 5 min                                         | `Akka:IdlePassivationMinutes`   |
| `JournalPublisherOptions` (batch window, retry delay, liveness), not bound                     | `Outbox:*`                      |
| `PublisherLagOptions`, `ProjectionDeadLetterOptions`, bound but absent from `appsettings.json` | listed with their defaults      |

All options classes bind the same way: `AddOptions<T>().Bind(section).Validate(...).ValidateOnStart()`.

**These stay in code.** They're game rules and protocol constants decided in the ROADMAP, not per-environment
tuning:

- the 1-minute first-move abort (D15), the 24-hour invite lifetime (D17), the 60-second queue entry (D16);
- passivation after the end (D8), snapshots every 20 events, and the 200-character ping text;
- token byte sizes, the PGN line length and the cursor length.

Integration tests keep overriding presence timings through environment variables as they do now.

Out of scope: log shipping or aggregation, and OpenTelemetry changes (`Observability:Console` stays as it is).

## Capabilities

### New Capabilities

- `service-operations`: the backend logs why it failed to start and what it did while starting, without secrets,
  and takes every operational value from validated configuration.

### Modified Capabilities

<!-- none -->

## Impact

- `apps/backend`: `Program.cs`, `Extensions/*` (bindings and validation), the options classes and the places that
  used the constants; `Config/appsettings.json` (new sections with today's defaults, a targeted addition).
- Tests: `StartupSummary` (secrets hidden), options validation and binding. The integration suite proves that
  startup still works in-process.
- No API, data or frontend change.
