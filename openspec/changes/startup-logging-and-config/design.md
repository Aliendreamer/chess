## Context

`Program.cs` builds the host with extension methods and calls `UseSerilog` inside `AddSharedConfiguration`. Until the
host is built, Serilog isn't configured, and a startup exception reaches the runtime's default handler as a bare stack
trace, or nothing at all inside a container. The integration tests create several in-process hosts
(`WebApplicationFactory<Program>`) in one test run.

## Goals / Non-Goals

**Goals:** a readable Fatal line naming the failed step, a log line per startup step, a secret-free summary, and every
tunable value in validated config.

**Non-Goals:** log shipping, changing the OTel setup, and making game rules configurable.

## Decisions

### D1. Bootstrap logger, then the configured logger takes over

`Log.Logger = new LoggerConfiguration()…CreateBootstrapLogger()` comes first in `Program.cs`, with the console and
compact JSON sink. `UseSerilog((ctx, sp, cfg) => …)` then reconfigures that same reloadable logger from
`appsettings.json`.

**Test hosts:** a reloadable logger can be frozen only once per process, and a second
`WebApplicationFactory` host would throw "already frozen". So `UseSerilog` is called with `preserveStaticLogger:
true` when the static logger isn't a fresh bootstrap logger, which is the case for test hosts after the first. This
is the documented Serilog pattern, and the integration suite proves it.

### D2. Steps are named, and the catch reports the last one

A small `StartupSteps` helper records the current step name, logs `Starting {Step}` and `{Step} done in {Ms} ms`, and
supplies `{Step}` to the Fatal line. The extension methods don't change their signatures; `Program.cs` wraps each call.

### D3. The summary is a pure function over IConfiguration

`StartupSummary.Describe(IConfiguration)` returns a dictionary of display values. For connection strings it keeps
only host, port and database: it parses with `NpgsqlConnectionStringBuilder`, keeps those three keys, and replaces a
connection string it can't parse with `(unparseable)`. For Redis it keeps only whether it's configured. It never reads
secret keys (`Keycloak:ClientSecret`, passwords). Unit tests feed it a config with known secrets and assert that none
of them appear in the output.

### D4. One way to bind options

Every options class has a `SectionName`, defaults equal to today's values, and a `Validate()` (positive durations,
sane limits). It's registered with `AddOptions<T>().Bind(...).Validate(o => o.IsValid, msg).ValidateOnStart()`. Code
that runs before DI (Akka wiring, the rate limiter) reads the same section with `Get<T>()` and calls `Validate()`
itself. A bad value fails startup, and D1/D2 log which step and which setting.

## Risks / Trade-offs

- [Bootstrap logger in tests] See D1. → The integration suite runs several hosts in one process and must pass.
- [More settings to keep in sync] → `appsettings.json` lists every section with its defaults, and the options classes
  hold the same defaults. A unit test binds the real `appsettings.json` and checks it equals `new T()` for every
  options class, so the file and the code can't drift.
