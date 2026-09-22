# Backend — apps/backend (Chess.Backend, .NET 10)

FastEndpoints 8 + EF Core 10/Npgsql + JwtBearer (Keycloak) + FusionCache + Serilog. Built from the
`dotnet-webapi` prompt, BFF mode. Solution `Chess.Backend.slnx`; tests in `Chess.Backend.Tests/` (xUnit, Moq,
EF InMemory). Central package versions in `Directory.Packages.props`; `<Version>` in `Directory.Build.props`
(Nx Release writes it).

## Layout

- `Program.cs` → `AddSharedConfiguration` (Config/appsettings*.json + env + Serilog) → `AddDatabaseContext`
  → `AddCommonServices` (options, JwtBearer w/ `CookieBearerTokenResolver`, CORS, rate limiter, FusionCache,
  convention services) → `AddEndpoints` → `UseRequestPipeline` → `MigrateAndSeedDbAsync` → run.
- `Data/`: `ProjectDbContext` (Users, UserSessions; `UseIdentityAlwaysColumns`), `AuditInterceptor`
  (CreatedAt/UpdatedAt/Version), `Models/`, `ModelConfigurations/`, `Migrations/` (`InitialSchema`),
  `Auth/KeycloakOidcClient` (discovery cached in FusionCache; authorize/exchange/refresh/revoke/end-session).
- `Services/`: `SessionStore` (hash-only tokens; `IsUsable` = not revoked && access or refresh still valid;
  `PurgeAsync`), `UserProvisioningService` (FusionCache sub→id, race-safe insert), `SessionCleanupService`
  (BackgroundService, `SessionStore:CleanupInterval`).
- `WebApi/Auth/`: pure helpers `Pkce`, `OidcStateCodec`, `ReturnToSanitizer`, `SessionToken`,
  `JwtSubjectReader`, `Base64Url`; `SessionCookies` (cookie policy); `CookieBearerTokenResolver`;
  endpoints `Login/`, `Callback/` (+ `CallbackValidator`), `Logout/`, group `auth/`.
- `WebApi/Me/MeEndpoint` (`GET api/me`, `Cache-Control: no-store`), `WebApi/Authentication/` (claims
  transformation, `UserProvisioningPreProcessor`, `CurrentUser`).
- `Utils/Constants.cs`, `Utils/Log.cs` (LoggerMessage), `coverage.runsettings` (excludes Program,
  Extensions, Migrations, `[ExcludeFromCodeCoverage]` endpoints), `build_test.sh` (90% line gate),
  `build_migration.sh`, `Dockerfile` (alpine, non-root, `/health`).

## Invariants / gotchas

- `AnalysisMode=All` + `TreatWarningsAsErrors`: all types `internal sealed`; no boxing log args (use
  `Utils/Log.cs`); `ConfigurationManager` not `IConfiguration` in extension params (CA1859).
- Never store raw session tokens; `TokenHash` unique. Revoke locally BEFORE calling the IdP.
- `ConnectionStrings:Redis` is the one Redis switch (`BuilderExtension.AddCaching/AddRateLimiting`,
  `FastEndpointSetup` health): set ⇒ FusionCache L2 + backplane (STJ serializer), Redis-backed global rate
  limiter (`RedisRateLimiting.AspNetCore`, 300/min per IP shared across replicas), Redis health check;
  unset ⇒ L1-only, in-memory limiter. FusionCache core + add-ons must share one version (2.8.0).
- `ApplicationExtensions.BuildForwardedHeaders`: X-Forwarded-* trusted only from `ForwardedHeaders:KnownNetworks`
  / `KnownProxies` (default loopback-only, `ForwardLimit=1`). Compose pins subnet `172.30.0.0/24` and passes
  `ForwardedHeaders__KnownNetworks__0`; deployments MUST set it to the edge's network or the rate limiter
  keys on the proxy IP (seen live as `rl:fw:{172.20.0.8}` before the fix).
- `Keycloak:Audience` empty ⇒ `ValidateAudience=false`. `RequireHttpsMetadata` only outside Development.
- Cookies `Domain=.chess.localhost` in dev (`SessionCookies:Domain`); the BFF strips it for the browser.
- `DefaultItemExcludes` covers `.claude/**`, `.mcp.json`, `.serena/**` — agent sandbox masks would otherwise
  be picked up as Content by the Web SDK.
- Only `Chess.Backend.csproj` is restored in Docker (tests excluded by `.dockerignore`).
- Realm export: `tools/localdev/keycloak/chess-realm.json` (client `chess_api`/`chess-dev-secret`, users
  `testuser`/`Test123!` Admin+User, `player`/`Player123!` User). Change ⇒ `stack.sh down -v`.
