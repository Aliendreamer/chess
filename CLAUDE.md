# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Nx + pnpm monorepo (the `nx-monorepo` workspace skeleton) holding five apps and two shared libraries:

- `apps/backend` — .NET 10 API (`Chess.Backend`): FastEndpoints + EF Core/Npgsql, Keycloak PKCE login,
  **server-owned opaque cookie session** (`mp_sid`; tokens never leave the server; logout revokes).
  Built from the `dotnet-webapi` prompt in "private behind an SSR BFF" mode.
- `apps/frontend` — TanStack Start SSR app (`chess-frontend`) that **is the BFF**: proxies `/api/auth/*`
  server-to-server, re-homes cookies, fetches page data via server functions. The browser only ever talks
  to `app.chess.localhost`. Built from the `fe-ssr-tanstack` prompt.
- `apps/engine` — .NET 10 worker (`Chess.Engine`): Stockfish 19 behind Kafka for games against the computer,
  outside the Akka cluster. Its image downloads the pinned official Stockfish release at build time (`ARG`s in
  `apps/engine/Dockerfile`, SHA-256-checked; GPLv3 notice + `SOURCE.txt` ship with it).
- `apps/proxy` — nginx edge for deployment (`/api/` → backend, `/` → frontend, `/hc` local 200).
- `apps/desktop` — the standalone, offline Tauri 2 app for one player (`chess-desktop`, OpenSpec `desktop-app`): play
  Stockfish (bundled sidecar), analysis, review, studies, trainer, training, library, news; SQLite on the machine.
  Windows + Linux installers built locally and published to GitHub Releases by the owner (no CI); macOS as one universal
  .dmg built on a friend's Mac (`nx run desktop:bundle-macos`). See its README.
- `libs/chess-core` (`@chess/core`) — pure TypeScript chess logic both TS apps use (rules feedback, move tree and PGN,
  review, Leitner schedule, trainer families, training judge, library import, feed parsers); no React, DOM or router.
- `libs/chess-ui` (`@chess/ui`) — presentational React both apps show (board, move list/tree, review, analysis,
  trainer, training, library, news, settings, the Club tokens and themes in `theme.css`, the Cburnett pieces). Links go
  through `LinkContext`/`AppLink` (the club provides `ClubLink`, the desktop `DesktopLink`); no router imports.

Node ≥ 24, pnpm pinned in `package.json#packageManager` (bump deliberately). Docker is required for
the local stack and for the proxy target (its `build` makes a local `:local` image and never pushes;
`push` does that).

## Commands

```bash
pnpm exec nx run-many -t lint test build       # cached; PR gate (nx affected for the changed projects)
tools/localdev/stack.sh up [svc...]            # full stack; pass service names for a subset
tools/localdev/stack.sh up --cluster            # adds backend-2 (down/ps/logs always include it)
tools/localdev/stack.sh up --tail-sampling      # collectors as in production: gateway + 2 samplers (combinable)
tools/localdev/stack.sh down -v                # drop volumes (fresh DB + Keycloak)
tools/localdev/stack.sh logs [svc]
tools/test-all.sh                              # every test, both languages
tools/coverage-report.sh                       # combined coverage (frontend vitest v8 + backend gate)
tools/e2e.sh                                   # stack up → Playwright → down
tools/localdev/verify-*.sh                     # live-stack checks per feature; listed in tools/localdev/CLAUDE.md
pnpm exec nx release version --dry-run
```

Per-app commands are in each app's `CLAUDE.md`.

Agent sandbox note: MSBuild worker nodes, `dotnet format`'s build host, coverlet's mutex and the Docker
socket all need IPC the Claude Code sandbox blocks. Inside it: build with
`-m:1 -nr:false -p:EnableSourceControlManagerQueries=false`; `build_test.sh` reports 0% coverage (tests still
run); `dotnet format`, `stack.sh` and `verify-auth.sh` must be run by a human (`! <cmd>`).

Local URLs (Traefik on :80, dashboard on 127.0.0.1:8090): `app.chess.localhost`, `api.chess.localhost`,
`keycloak.chess.localhost` (admin/admin), `redisinsight.chess.localhost`, `console.chess.localhost`
(Redpanda), `grafana.chess.localhost` (admin/Admin123! edits, viewer/Viewer123! views; no anonymous access). Postgres primary `127.0.0.1:5432`, replica `127.0.0.1:5433` (`chess`/`chess`/`chess`);
Redpanda Kafka API `127.0.0.1:19092`.

## Commit rules (load-bearing)

Conventional commits with a **required scope** from `frontend | backend | engine | desktop | libs | repo | deps |
proxy | ci | release`, lower-case subject — enforced by commitlint on `commit-msg`. Nx Release derives version
bumps and per-project changelogs from these (`projectsRelationship: independent`, tags
`{project}@{version}`), so a non-conforming message is rejected, not just discouraged.
`pre-commit` runs `lint-staged --no-stash` (prettier on json/md/yml only; code formatting belongs
to each app's own lint target). Keep `--no-stash`.

## Where the detail lives

Each app keeps its own notes, loaded when you work in its folder — read the right one before changing code that
another app depends on:

- `apps/backend/CLAUDE.md` — startup and settings, auth flow, Redis, forwarded headers, backend layout and
  conventions, journal outbox, and every feature (games, engine play, members, studies, library, trainer, review,
  training, news, engine analysis) with the endpoints and frontend files that go with it; actor tracing rules.
- `apps/frontend/CLAUDE.md` — the BFF cookie contract, the live relay, UI tokens, themes, responsive rules, e2e.
- `apps/desktop/CLAUDE.md`, `apps/engine/CLAUDE.md`, `apps/proxy/CLAUDE.md`.
- `tools/localdev/CLAUDE.md` — verify scripts, data plane, local stack, observability stack.

## Rules that span apps

- The browser only ever talks to `app.` (the BFF). **No `VITE_API_URL` ever** — the client bundle must not mention
  the API host.
- **Every deployment** must set `ForwardedHeaders:KnownNetworks` to the edge's (and the BFF's) network, or the
  per-client rate limiter keys on the proxy's IP (details: `apps/backend/CLAUDE.md`).
- A new Keycloak client that calls the API needs an audience mapper for `chess_api`, or every call is a 401.
- chess.js is feedback only: the server's answer or frame always wins.
- Logic ported from the backend lives in `@chess/core` with the backend tests' cases; the backend keeps its C#
  copies, so a rule change touches both.
- A new live kind = one `ILiveTopicSource` (backend) + one entry in the BFF's `KINDS`. A new projection consumer group
  also goes into `lib/admin.ts#PROJECTION_GROUPS`. A new event type needs a `TopicTagger.BoundTypes` entry AND a mapper.
- No sounds anywhere (owner decision); no third-party requests from the browser.
- **Nx caching across languages** — `nx.json#namedInputs.dotnet` lists only `.cs`/`.csproj`/
  `.slnx`/`Directory.*.props`/runsettings so JS edits don't bust the backend cache and vice versa.
  The backend's `project.json` must reference this input.
- **.NET versioning in Nx Release** — the backend has no `package.json`; its version is the MSBuild
  `<Version>` in `apps/backend/Directory.Build.props`. `tools/nx-release/dotnet-version-actions.cjs`
  teaches Nx Release to read/write it (wired via `release.groups.backend.version.versionActions`).
- **Images and deploy** — `tools/deploy/build.sh <app> [push|local|validate]` tags
  `YYYYMMDD.<short-sha>`; that tag is the rollback unit. Registry is Docker Hub
  (`docker.io/aliendreamer/chess-*`), creds via `REGISTRY`/`REGISTRY_USER`/`REGISTRY_PASS` env vars.
  Deploy target is Docker (compose/swarm) and is **not implemented** — each app's `deploy` target is
  a placeholder. `nx run-many -t build` does not publish; use `-t push`.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
