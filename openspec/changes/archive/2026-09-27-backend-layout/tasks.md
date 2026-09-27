Each group ends in one commit that passes the backend gate (build with no warnings, unit tests, `dotnet format
--verify-no-changes`). 🐳 marks steps that need Docker.

## 1. Owner review

- [x] 1.1 The owner confirms the target tree in the proposal, or corrects it. Nothing moves before this.

## 2. Step 1 and step 2: merge tiny files and group by functionality

- [x] 2.1 `Authentication/` (Session, Oidc, CurrentUser), then `Messaging/` (Kafka + live relay), then `Extensions/`
      (4 files).
- [x] 2.2 `Akka/` (AkkaNode, Games, Matchmaking, Ping, Outbox), `Games/`, `Events/`, `Data/`, `Projections/` and
      `Utils/` exactly as the proposal lists them.
- [x] 2.3 Tests mirror; build with no warnings, unit tests, format. Commit: `refactor(backend): merge tiny files and
group code by functionality`.

## 3. Endpoints, one folder each

- [x] 3.1 `WebApi/Games` split per the proposal, with `Summary<>` classes.
- [x] 3.2 `WebApi/Matchmaking`, `WebApi/Pings`, `WebApi/Admin`, `WebApi/Me`, `WebApi/Auth` (the group to the area root;
      summaries for login, callback and logout).
- [x] 3.3 Build, unit tests, format; the OpenAPI document lists the same routes and summaries as before (diff
      `/swagger/v1/swagger.json`). Commit: `refactor(backend): one folder per endpoint with request, response and summary`.

## 4. Proof and docs 🐳

- [x] 4.1 🐳 Integration suite; restart the live backends; `verify-part1.sh`; the Playwright suite.
- [x] 4.2 CLAUDE.md (backend layout rule) and `openspec/architecture.md` paths. Commit: `docs(repo): backend layout`.
