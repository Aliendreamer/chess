## Why

The backend is split into dozens of tiny files: a 4-line interface in one file and its implementation in another,
options classes of 13 lines, one extension class per file, folders with one file. Related code is scattered:
authentication in `WebApi/Auth`, `WebApi/Authentication`, `Data/Auth` and `Services`, and live code in `Live/` and
`WebApi/Live`. Endpoints don't follow one pattern: some have their own folder, others share one file. This change reorders the project and brings every endpoint up to FastEndpoints' standard (summaries, typed
request/response, validators, declared auth, caching, options). The only behaviour changes are:

- a malformed input is now a 400 from its validator (for example `"uci":"zz"` was a 422 from the actor; a well-formed
  illegal move stays 422);
- a finished game's PGN and moves carry cache headers.

## The two rules

1. **No tiny files.** No file holds just one or two small functions, and no file is a single small sealed class with
   one method. Small related types share a file. An interface lives with its implementation, and options live with
   the code that reads them.
2. **Grouped logically by functionality.** Code sits with what it does: all authentication together, all Kafka and
   live messaging together, all startup wiring together. A folder holds a real group, never a single file.

**The one deliberate exception is endpoints.** Each endpoint has its own folder, with its endpoint, request,
response and summary files (the house template's pattern, extended to every endpoint).

**Namespace = folder**, except for `Events` and `Data/Models` / `Data/ReadModels`. Those namespaces stay as they
are, because stored data names them:

- the journal stores `"$type":"Chess.Backend.Events.MoveMade, …"`;
- the EF model snapshot names `Chess.Backend.Data.Models.User`.

## What Changes (every file)

### Authentication/ (new): from `WebApi/Auth` helpers, `WebApi/Authentication`, `Data/Auth`, and the auth services in `Services/`

- `Session.cs`: `SessionToken`, `SessionCookies`, `SessionCookieOptions`, `SessionStoreOptions`,
  `CookieBearerTokenResolver`, `ISessionStore` and `SessionStore`, and `SessionCleanupService`.
- `Oidc.cs`: `KeycloakOptions`, `IKeycloakOidcClient`, `OidcDiscoveryDocument`, `KeycloakOidcClient`, `Pkce`,
  `Base64Url`, `OidcState` and its codec, `ReturnToSanitizer`, `JwtSubjectReader`, and `CallbackValidator` with
  `CallbackOutcome` (taken out of the callback endpoint file).
- `CurrentUser.cs`: `ICurrentUser`, `CurrentUser`, `UserProvisioningPreProcessor`,
  `KeycloakRolesClaimsTransformation`, and `IUserProvisioningService` with `UserProvisioningService`.

### Messaging/: Kafka and the live relay together (`Live/` and `WebApi/Live/` go away)

- `KafkaConsumerHost.cs` stays.
- `KafkaOptions.cs`: `KafkaOptions` and `KafkaHealthCheck`.
- `LiveRelay.cs`: `LiveFrame`, `LiveTopics`, `ILiveTopicSource`, `LiveTopicResolver`, `LiveHub` and `HubFanOutActor`.

### Extensions/: all startup wiring, 4 files

- `BuilderExtensions.cs`: `BuilderExtension`, `SharedConfigurationExtensions` and `ObservabilityExtensions`.
- `ApplicationExtensions.cs`: `ApplicationExtensions` and `FastEndpointSetup`.
- `DatabaseExtensions.cs`: one `DatabaseExtensions` for the write and read databases (merges
  `ReadDatabaseExtensions`).
- `AkkaExtensions.cs`: `AkkaHostingExtensions` plus every region and singleton registration, which are
  `WithGameSharding`, `WithPingSharding`, `WithInviteSharding`, `WithMatchmaking` and the journal publisher. They
  come out of `Akka/Games/GameShardingExtensions.cs`, `Akka/Ping/PingShardingExtensions.cs`, `InviteActor.cs`,
  `MatchmakingRegistration.cs` and `JournalPublisher.cs`.

### Akka/: actors and their messages, by feature

- **`Akka/AkkaNode.cs`:** `AkkaOptions`, `ClusterHealthCheck` and `ActorTracing`.
- **`Akka/Games/`:**
  - `GameActor.cs`;
  - `GameMessages.cs`;
  - `GameLiveSource.cs`, which holds `GameMessageExtractor`, `IEndedGameReader`, `ReplicaEndedGameReader` and
    `GameLiveSource`.
- **`Akka/Matchmaking/`:** `MatchmakingActor.cs` (with `QueueLiveSource`) and `InviteActor.cs` (moved from
  `Akka/Invites/`, a one-file folder, with its extractor and `InviteLiveSource`).
- **`Akka/Ping/`:** `PingActor.cs` and `PingMessages.cs`. `PingMessages.cs` takes `PingMessages`, `PingTopics`,
  `PingMessageExtractor` and `PingLiveSource`.
- **`Akka/Outbox/`:**
  - `EventMapping.cs`: `TopicTagger`, `JournalEventMappers`, `GameJournalMappers` and `PingedJournalMapper`;
  - `JournalPublisher.cs`: `JournalPublisher` and `PublisherLagHealthCheck`;
  - `JournalPublisherLoop.cs` and `PublisherLease.cs` stay.

### Games/: the chess domain

- `ChessRules.cs`, `GameTypes.cs` and `Pgn.cs` stay.
- `TimeControl.cs` takes `PassivationPolicy`.

### Events/: namespace unchanged

- `DomainEvents.cs`: `GameEvents`, `InviteEvents` and `Pinged`, with the same type names and namespace.
- `EventEnvelope.cs`: `EventEnvelope` and `EventJson`.

### Data/

- **Root files:**
  - `ProjectDbContext.cs`: `ProjectDbContext`, `ProjectDbContextFactory` and `SeedData`;
  - `ReadDbContext.cs`: `ReadDbContext` and `ReplicaHealthCheck`;
  - `AuditInterceptor.cs` stays;
  - `BaseService.cs`: `IService` and `BaseService`, the base for DB-backed services (`Services/` goes away).
- **`Models/`:** namespace unchanged.
  - `UserModels.cs`: `AuditableEntity`, `User` and `UserSession`;
  - `MessagingModels.cs`: `OutboxOffset`, `ConsumerPosition` and `ProjectionDeadLetter`.
- **`ReadModels/`:** namespace unchanged. `RmGame.cs` and `RmPing.cs` stay.
- **`ModelConfigurations/`:**
  - `UserConfigurations.cs`: users and user sessions;
  - `MessagingConfigurations.cs`: outbox offset, consumer position and dead letter;
  - `ReadModelConfigurations.cs`: `rm_pings` and the `rm_games` configurations.
- **`Migrations/`:** untouched.

### Projections/

- `ProjectionRunner.cs`: `ProjectionRunner`, `ConflictDetector` and `IdempotencyGuard`.
- `DeadLetters.cs`: `DeadLetterStore`, `DeadLetterReplayer` and `DeadLetterHealthCheck`.
- `IProjection.cs`: `IProjection` and `PositionedProjection`.
- `GameProjection.cs` and `PingProjection.cs` stay.

### Utils/

- `Keyset.cs`: `Keyset`, `KeysetCursor` and `CursorPage`.
- `Constants.cs` and `Log.cs` stay.

### WebApi/: endpoints only, one folder per endpoint

Each endpoint folder holds:

- `{Name}Endpoint.cs`;
- `{Name}Request.cs`, when there is a body or query;
- `{Name}Response.cs`, when it has its own response type;
- `{Name}Summary.cs`, a FastEndpoints `Summary<{Name}Endpoint>` that takes the description now inlined in
  `Configure()`.

Code shared by an area's endpoints sits in the area root.

```
WebApi/
  Admin/        ListDeadLetters/  ReplayDeadLetters/
  Auth/         AuthGroup.cs   Login/  Callback/  Logout/
  Me/           MeEndpoint.cs  MeResponse.cs (with its factory)  MeSummary.cs
  Games/        GameEndpointBase.cs (base, reply mapper)   GameReadEndpointBase.cs (base, cursor, row→response mapping)
                Move/ Resign/ OfferDraw/ AcceptDraw/ DeclineDraw/ Abort/ Claim/ GetLive/
                ListGames/ MyGames/ GetGame/ GetMoves/ GetPgn/
  Matchmaking/  MatchmakingHttp.cs (reply mappers, invite base)
                JoinQueue/ LeaveQueue/ CreateInvite/ GetInvite/ AcceptInvite/ CancelInvite/
  Pings/        PingReplyMapper.cs   PostPing/ GetPingLive/ ListPings/
```

Every endpoint uses FastEndpoints' own features where they fit:

- **Typed request and response.** `Endpoint<TRequest, TResponse>`, with route and query values bound into the request
  DTO (`[BindFrom]`, `[QueryParam]`) instead of `Route<string>("id")` in the handler.
- **`Summary<TEndpoint>`.** A summary, a description, an example request, and a response description with an example
  for every status code it returns (200/201/204/400/401/403/404/409/422/504).
- **`Validator<TRequest>` (FastEndpoints' FluentValidation) for every request with input:**
  - a move's UCI;
  - a claim's outcome;
  - an invite's time control and colour;
  - list `limit`/`cursor`;
  - a ping's text.

  Shape checks move out of handlers, and the domain rules stay in the actors.

- **Authentication and authorization declared in `Configure()`:**
  - `AllowAnonymous()` for the auth group only;
  - `Roles(Admin)` for `Admin/`;
  - every other endpoint is signed in, stated explicitly.
- **Caching where it's safe:**
  - `ResponseCache` for a finished game's PGN and moves, which are immutable once ended;
  - `Cache-Control: no-store` on `/me`, live views and commands;
  - no caching of anything per-session that can change.
- **Options values.** Ask timeouts (5 s / 10 s) and list limits (max 200, default 50) come from a bound options
  class, not constants scattered in endpoint files.

Routes, HTTP behaviour and JSON don't change. C# type renames such as `QueueStatus` → `JoinQueueResponse` and
`PostMoveEndpoint` → `MoveEndpoint` are internal.

### Tests

The test projects mirror the new folders. Test code keeps its substance; only namespaces and places change.

Out of scope: `apps/frontend` (a separate pass if wanted), routes, JSON, and the database schema.

## Capabilities

### New Capabilities

- `backend-layout`: the two rules, the endpoint-folder pattern, and the fixed namespaces of stored types.

### Modified Capabilities

<!-- none -->

## Impact

This is a file reorganization of `apps/backend` and its tests, plus updates to the CLAUDE.md and
`openspec/architecture.md` paths. There's no runtime change. Stored journal data and the EF model snapshot are
unaffected by design.
