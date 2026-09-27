# backend-layout Specification

## Purpose

How the backend is organised: no tiny files, code grouped by functionality, one folder per endpoint with its request,
response and summary, endpoints that use FastEndpoints' standard features, and the namespaces that stored data fixes.

## Requirements

### Requirement: No tiny files; code grouped by functionality

Backend source files SHALL NOT be tiny single-purpose files: no file MAY hold only one or two small functions or a
single small class with one method. An interface MUST live with its implementation and options with the code that
reads them. Code SHALL be grouped by functionality, and a folder MUST hold a real group, never a single file. The
only exception is the per-endpoint folder pattern in `WebApi/`.

#### Scenario: Adding a small helper

- **WHEN** a 15-line helper is needed for session cookies
- **THEN** it goes into `Authentication/Session.cs` next to the code that uses it, not into a new file

#### Scenario: A new interface

- **WHEN** a service `IFoo` with implementation `Foo` is added
- **THEN** both are in one file

### Requirement: WebApi holds only endpoints, one folder per endpoint

`apps/backend/WebApi/` SHALL contain only HTTP endpoints and the code shared by one area's endpoints. Each endpoint
MUST live in its own folder `WebApi/{Area}/{Name}/` with `{Name}Endpoint.cs`, `{Name}Summary.cs`, and
`{Name}Request.cs` / `{Name}Response.cs` when the endpoint has its own request or response type. No file MAY hold
more than one endpoint.

#### Scenario: A new endpoint

- **WHEN** an endpoint `POST /api/games/{id}/takeback` is added
- **THEN** it is `WebApi/Games/Takeback/TakebackEndpoint.cs` with `TakebackSummary.cs` (and a request file if it has
  a body), not a class appended to an existing endpoint file

### Requirement: Authentication code lives in one place outside WebApi

Code that authenticates requests but is not an endpoint (sessions, cookies, OIDC, the current user, claims) SHALL
live in the root `Authentication/` folder, grouped by concern, not spread across `WebApi/` and `Data/`.

#### Scenario: Where the session cookie code is

- **WHEN** someone looks for the `mp_sid` cookie handling
- **THEN** it is in `Authentication/Session.cs`, and `WebApi/Auth/` holds only the login, callback and logout
  endpoints and their group

### Requirement: Startup extensions live in Extensions

Every startup/registration extension class (DI, Akka sharding and singletons, databases, observability) SHALL live in
`Extensions/`, and the write and read databases MUST be registered by one `DatabaseExtensions` class.

#### Scenario: Registering a new sharded actor

- **WHEN** a new sharded region is added
- **THEN** its `With…Sharding` extension goes in `Extensions/`, and the actor, messages and extractor stay in its
  `Akka/` feature folder

### Requirement: No one-file folders, and namespaces follow folders

A backend folder SHALL NOT contain a single source file. A namespace MUST match its folder, except `Events/` and
`Data/Models`, whose namespaces MUST NOT change because stored data names them (journal event types, the EF model
snapshot).

#### Scenario: Moving an event type

- **WHEN** someone wants to move `MoveMade` out of `Events/`
- **THEN** its namespace stays `Chess.Backend.Events`, since every stored game event carries that type name

### Requirement: Endpoints use FastEndpoints' standard features

Every endpoint SHALL use a typed request and response (`Endpoint<TRequest, TResponse>`, route and query values bound
into the request), a `Summary<TEndpoint>` documenting each status code it returns, and a `Validator<TRequest>` for any
input. Its authentication or role requirement MUST be declared in `Configure()`. Responses that cannot change (a
finished game's PGN and moves) SHALL be response-cacheable, and per-session or live responses MUST be `no-store`.
Timeouts and limits MUST come from bound options.

#### Scenario: A malformed move

- **WHEN** `POST /api/games/{id}/moves` is sent with `{"uci":"zz"}`
- **THEN** the move validator answers 400 with the field error, before the game actor is asked

#### Scenario: A finished game's PGN

- **WHEN** a finished game's PGN is fetched
- **THEN** the response carries cache headers allowing it to be cached, while `/api/me` says `no-store`
