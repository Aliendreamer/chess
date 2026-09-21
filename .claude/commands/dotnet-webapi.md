# .NET Backend — house build template (FastEndpoints + cookie session)

A reusable build playbook for the **.NET API** we build: FastEndpoints + EF Core (Npgsql), Keycloak as the IdP, and a
**server-owned opaque-cookie session** (tokens never leave the server; logout revokes the session). This is the BE half
of the BFF stack, buildable on its own. Follow it top to bottom.

## How Claude must work on this

- **Ask me for one thing first** (STEP 0), then build everything.
- **Use Serena** for ALL code search/reading/editing (`get_symbols_overview`, `find_symbol`, `read_file`, `list_dir`,
  symbol edits) — never raw grep/sed/cat for code.
- **Use OpenSpec** if the repo uses it: `/opsx:propose` → `/opsx:apply` → `openspec validate <name> --strict` → archive.
  Otherwise implement directly.
- Conventional commits, **lowercase subject** (commitlint `subject-case`). Don't push or open PRs unless asked.
- Verify with real builds/tests before claiming done.

## STEP 0 — ask, then stop and wait

Ask me for **exactly one value**: the **BE project name** → use as the .NET project + root namespace `<BeName>`
(PascalCase). Derive a lowercase `<slug>` for cookie domain / hosts (`<slug>.localhost`). Then build.

## Outcome (what exists when done)

- `GET api/me` returns `{id, subject, email, roles[]}` from the cookie session; `401` when anon.
- Login → Keycloak (PKCE) → callback creates a server session, sets an **opaque** `mp_sid` HttpOnly cookie; the
  access/refresh tokens are stored **server-side only**.
- Logout **revokes the session server-side** → reusing the old cookie → `401`.
- Token refresh is transparent (cookie resolver refreshes when the access token expires).

## Stack (pin exact versions; bump to current at build time)

.NET (latest LTS) + FastEndpoints + EF Core (Npgsql) + Serilog + `Microsoft.AspNetCore.Authentication.JwtBearer` +
FusionCache. xUnit + Moq + EF InMemory; treat-warnings-as-errors; ~90% coverage gate. All routes under `api/`. Runs
against PostgreSQL and a Keycloak realm.

## Exact dependencies & key config

### `<BeName>.csproj` (`Microsoft.NET.Sdk.Web`, `net10.0`)

PropertyGroups: `Nullable=enable`, `ImplicitUsings=enable`, `RootNamespace=<BeName>`, `EnableNETAnalyzers=true`,
`AnalysisLevel=latest-recommended`, `AnalysisMode=All`, `TreatWarningsAsErrors=true`,
`NoWarn=CA1812,CA1848,CA1707,CA1861`, `<Compile Remove="<BeName>.Tests/**/*.cs" />`. PackageReferences:

```xml
<PackageReference Include="FastEndpoints" Version="8.1.0" />
<PackageReference Include="FastEndpoints.Swagger" Version="8.1.0" />
<PackageReference Include="FastEndpoints.HealthChecks" Version="8.1.0" />
<PackageReference Include="Scalar.AspNetCore" Version="2.14.14" />
<PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="10.0.8" />
<PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="10.0.2" />
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.8" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Relational" Version="10.0.8" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.8" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="10.0.8" />
<PackageReference Include="ZiggyCreatures.FusionCache" Version="2.6.0" />
<PackageReference Include="Serilog.AspNetCore" Version="10.0.0" />
<PackageReference Include="Serilog.Settings.Configuration" Version="10.0.0" />
<PackageReference Include="Serilog.Expressions" Version="5.0.0" />
<PackageReference Include="Serilog.Sinks.Console" Version="6.1.1" />
<PackageReference Include="Serilog.Sinks.File" Version="7.0.0" />
<PackageReference Include="Serilog.Formatting.Compact" Version="3.0.0" />
<PackageReference Include="NetEscapades.AspNetCore.SecurityHeaders" Version="1.3.1" />
<PackageReference Include="AspNetCore.HealthChecks.NpgSql" Version="9.0.0" />
<PackageReference Include="Bogus" Version="35.6.5" />
```

Note: don't reference `Microsoft.Extensions.*.Abstractions` (in the .NET 10 shared framework → `NU1510`).
`FluentValidation` ships with FastEndpoints.

### `<BeName>.Tests.csproj` (`Microsoft.NET.Sdk`, `net10.0`, `IsPackable=false`)

```xml
<PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.6.0" />
<PackageReference Include="xunit" Version="2.9.3" />
<PackageReference Include="xunit.runner.visualstudio" Version="3.1.5" /> <!-- PrivateAssets=all -->
<PackageReference Include="Moq" Version="4.20.72" />
<PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="10.0.8" />
<PackageReference Include="FluentValidation" Version="12.1.1" />
<PackageReference Include="coverlet.collector" Version="10.0.1" /> <!-- PrivateAssets=all -->
<PackageReference Include="Microsoft.AspNetCore.Http.Features" Version="5.0.17" />
<!-- ProjectReference: ../<BeName>.csproj -->
```

Solution: `<BeName>.slnx`. Build: `dotnet build <BeName>.csproj`. Migrations: `./build_migration.sh "Name"` (needs the
`dotnet-ef` 10.x global tool). Tests + coverage: `./build_test.sh` (~90% line gate via `coverage.runsettings`). Style:
`.editorconfig` is the single source of truth (4-space, Allman braces, file-scoped namespaces, explicit types,
PascalCase/\_camelCase, global usings in `globals.cs`).

## Components to build (`<BeName>`)

Startup (`Program.cs`):

```text
ConfigureBuilder → AddSharedConfiguration → AddDatabaseContext → AddCommonServices → AddEndpoints → build → UseRequestPipeline → MigrateAndSeedDbAsync → run
```

### Composition root — `Extensions/`

- **BuilderExtension** `AddCommonServices`:
  - `AddAuthentication(JwtBearer).AddJwtBearer(...)` — `Authority`/`Audience` from `Keycloak` config,
    `RequireHttpsMetadata = !Development`, `NameClaimType=sub`, `RoleClaimType=ClaimTypes.Role`, **`ValidateAudience`
    only when an audience is set**.
  - **`options.Events = new JwtBearerEvents { OnMessageReceived = CookieBearerTokenResolver.OnMessageReceivedAsync }`**.
  - `IClaimsTransformation` = `KeycloakRolesClaimsTransformation`; scoped `CurrentUser`/`ICurrentUser`.
  - `AddFusionCache()` (sub→User.Id, L1; Redis L2 later).
  - CORS policy: `WithOrigins(<exact FE origin>).AllowAnyHeader().AllowAnyMethod().AllowCredentials()` (NEVER `*` with
    credentials).
  - Bind options: `Configure<KeycloakOptions>`, `Configure<SessionCookieOptions>`, `Configure<SessionStoreOptions>`.
  - Named `HttpClient` for Keycloak; register `SessionCleanupService` (hosted).
  - Convention auto-register `XxxService : BaseService, IXxxService`.
- **ApplicationExtensions** `UseRequestPipeline`: forwarded headers, security headers, exception handler, Serilog
  request logging, rate limiter, `UseCors`, `UseAuthentication`/`UseAuthorization`, FastEndpoints (RoutePrefix `api`,
  global `RequireCors` + `UserProvisioningPreProcessor`), Swagger/Scalar. `MigrateAndSeedDbAsync` applies EF migrations
  on startup.
- **FastEndpointSetup**: `AddFastEndpoints()` + health checks + Swagger.

### Auth flow — `WebApi/Auth/` (group `Groups/AuthGroup.cs`, sub-prefix `auth/`)

All `AllowAnonymous()` except `/me`. Endpoints are thin (`[ExcludeFromCodeCoverage]`) over tested helpers.

- **Login/LoginEndpoint** `GET api/auth/login?returnTo=`: `ReturnToSanitizer.Sanitize` → `Pkce.Create()`
  (verifier+challenge S256 + nonce) → set short-lived HttpOnly **PKCE cookie** `"<nonce>.<verifier>"` →
  `OidcStateCodec.Encode({nonce, returnTo})` → `IKeycloakOidcClient.BuildAuthorizeUrlAsync` → 302.
- **Callback/CallbackEndpoint** `GET api/auth/callback?code&state`: read+clear PKCE cookie; `OidcStateCodec.TryDecode`;
  verify `state.Nonce == cookieNonce`; `ExchangeCodeAsync(code, verifier)`; extract `sub` via `JwtSubjectReader`;
  compute expiries; **`ISessionStore.CreateAsync` → rawToken**; `SetSession(mp_sid)`; **302 to the ABSOLUTE
  `{KeycloakOptions.AppBaseUrl}{returnTo}`**.
- **Logout/LogoutEndpoint** `GET api/auth/logout`: read `mp_sid` → capture refresh token from the session →
  **`ISessionStore.RevokeAsync`** → `ClearSession` → 302 `BuildEndSessionUrlAsync` → app post-logout URL.
- Helpers: `Pkce`, `OidcState`+`OidcStateCodec`, `ReturnToSanitizer` (relative path starting with a single `/`; reject
  `//`/scheme), `SessionToken` (256-bit base64url + SHA-256 hash — store hash only), `JwtSubjectReader` (pure `sub` from
  JWT payload), `KeycloakOptions`, `SessionCookieOptions`, `SessionStoreOptions`.

### Token resolution — `WebApi/Auth/CookieBearerTokenResolver.cs`

`ResolveTokenAsync(request, response, cookies, store, oidc, ct)` (testable core):

1. `Authorization` header present → return null (header bearer path preserved).
2. read `mp_sid` → `store.GetValidAsync` → none → null.
3. access token unexpired (small leeway) → return it.
4. expired + refresh valid → `oidc.RefreshAsync` → `store.UpdateTokensAsync` → return new token.
5. else → null (→ 401).

### Identity — `WebApi/Me/`

`MeEndpoint` `GET api/me` `[Authorize]` → `MeResponseFactory` builds `MeResponse {id, subject, email, roles[]}` from
`ICurrentUser`; `Cache-Control: no-store`; 401 when anon.

### Keycloak-consumer plumbing — `WebApi/Authentication/`

`KeycloakRolesClaimsTransformation` (flatten `realm_access.roles` → role claims, idempotent);
`UserProvisioningPreProcessor` (global, JIT-provision local `User` by `sub`, populate `ICurrentUser`);
`CurrentUser`/`ICurrentUser`.

### Data — `Data/`

- `ProjectDbContext` (`Users`, `UserSessions` DbSets; `UseIdentityAlwaysColumns`; `ApplyConfigurationsFromAssembly`).
  `ProjectDbContextFactory` (design-time).
- `Models/AuditableEntity` (CreatedAt/UpdatedAt/Version via `AuditInterceptor`), `Models/User` (`Id`, unique `Sub`,
  `Email?`, `FullName?`), `Models/UserSession` (`Id`, unique `TokenHash`, indexed `Subject`, `AccessToken`,
  `RefreshToken?`, `AccessTokenExpiresAt`, `RefreshTokenExpiresAt?`, `RevokedAt?`).
- `ModelConfigurations/UserConfiguration`, `UserSessionConfiguration` (token cols `text`).
- `Migrations/` — `AddUsers` + `AddUserSessions` (generate via `./build_migration.sh "Name"`).
- `Auth/KeycloakOidcClient` + `IKeycloakOidcClient` + `OidcDiscoveryDocument` (discovery from `Authority`;
  `BuildAuthorizeUrlAsync`, `ExchangeCodeAsync`, `RefreshAsync`, `BuildEndSessionUrlAsync`). `SeedData` (placeholder).

### Services — `Services/`

`BaseService` (Context/Logger/paging) + `IService`; `UserProvisioningService` (FusionCache `sub→Id`, race-safe upsert);
**`SessionStore : BaseService, ISessionStore`**
(`CreateAsync/GetValidAsync/UpdateTokensAsync/RevokeAsync/RevokeAllForSubjectAsync`, hash via `SessionToken`, exclude
revoked/expired); `SessionCleanupService` (`BackgroundService`, periodic purge of revoked/expired, scoped DbContext,
interval from config).

### Cookies & config

- Cookies (`mp_sid`, `mp_pkce`): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Domain=.<slug>.localhost`, `Secure` only outside
  Development.
- `Utils/Constants.cs`: `RoutePrefix="api"`, CORS/cookie/route/table constants, `Roles.Admin/User`.
- `Config/appsettings*.json`: `Keycloak` (`Authority`, `Audience`, `ClientId`, `ClientSecret`, `CallbackUri`,
  `PostLogoutRedirectUri`, `AppBaseUrl`), `SessionCookies` (`Domain`, `SessionName`, `PkceName`), `SessionStore`
  (`CleanupInterval`), `AllowedCorsOrigins`, `ConnectionStrings:Postgres`.

### Exposure — public API vs private behind an SSR BFF

The C# is identical either way. Only configuration and exposure change, so decide this in STEP 0 and apply the
right column.

|                                            | **Public API** (browser calls it directly)       | **Private behind an SSR BFF** (recommended)                                                                                                           |
| ------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Keycloak:CallbackUri`                     | `http://api.<slug>.localhost/api/auth/callback`  | `http://app.<slug>.localhost/api/auth/callback` — the callback lands on the **SSR proxy**, which forwards it inward                                   |
| `AppBaseUrl` / `PostLogoutRedirectUri`     | the API origin                                   | `http://app.<slug>.localhost`                                                                                                                         |
| Realm client `redirectUris` / `webOrigins` | the API origin                                   | `http://app.<slug>.localhost`                                                                                                                         |
| Public route                               | a router/label exposing the API                  | **none** — reachable only as `<be-service>:8080` on the compose network                                                                               |
| CORS                                       | the browser's front line; lock to the app origin | no longer the front line (the browser is same-origin to `app.`), but **still** lock `Web__Origins`/`AllowedCorsOrigins` to the app origin — never `*` |

Cookies stay `Domain`-scoped at the API (`Domain=.<slug>.localhost`) in both modes; behind a BFF the proxy is what
strips `Domain` and app-scopes them. A `Domain`-less API cookie also works — the proxy normalises either way — but
leaving the API unchanged between modes is simpler.

Everything else is unchanged: token resolver, session store and revocation, `/me`, claims transformation, EF model,
cleanup service.

> **Behind a BFF, pair this with `fe-ssr-tanstack`**, which owns the proxy route and cookie re-homing. Both apps drop
> into the `nx-monorepo` workspace skeleton.

## Infrastructure to run it

PostgreSQL + a Keycloak realm (confidential client `<slug>_api`). A minimal `docker-compose.yml` with Postgres +
Keycloak + Traefik is enough to run and test the API locally. For a full workspace stack — Postgres, Redis, Keycloak
with a seeded realm, and every app wired together — use the `nx-monorepo` skeleton instead of hand-rolling compose.

## Verify before claiming done

- `dotnet build <BeName>.csproj` warning-clean; `./build_test.sh` green — cover the **session store, token hashing,
  returnTo sanitizer, PKCE/state codec, cookie resolver, `/me` + guard**.
- `docker compose up --build` → Postgres + Keycloak healthy, realm imports, API healthy.
- End-to-end: log in (`testuser`/`Test123!`) → `GET /api/me` with cookie → `200`; without → `401`; **revocation**:
  capture `mp_sid`, logout, reuse old `mp_sid` → `GET /api/me` → **401**.

## Suggested build order

1. (If OpenSpec) propose the spec. 2. Data + migration → session store → auth wiring (`OnMessageReceived`) → endpoints
   (login/callback/logout) → `/me` → cleanup service. 3. Harness compose + realm import. 4. Verify end-to-end incl.
   revocation.
