# Chess

A chess platform — live games against people, against an engine, correspondence, and study — built
deliberately as an **experiment in Akka.NET + Kafka + CQRS on Postgres**. The product is real; the
architecture is the point. Each part ends with a written note on what the machinery bought, what it
cost, and what to change next.

Everything runs self-contained from `tools/localdev/`: Postgres primary + hot standby, Redpanda,
Redis, Keycloak, Traefik, and the two apps. No cloud account, no shared environment.

## Status

**Part 0 — the spine — is complete and verified end to end.** A trivial `PingActor` travels the whole
path the real game will take:

```text
HTTP → sharded persistent actor → journal → Kafka → projection → read model on the replica
     → DistributedPubSub → SignalR → SSR WebSocket relay → browser
```

Measured on the local stack: write→replica ~250 ms, ping→row on the replica 250–500 ms, failover to a
second node ~2 s. Read [`docs/superpowers/notes/part0-experiment.md`](docs/superpowers/notes/part0-experiment.md)
for what that cost and what changes before Part 1 — the open dual-write gap is first on the list.

Next: Part 1, live games against people. Parts 2–4 (engine, correspondence, study) follow.
[`ROADMAP.md`](ROADMAP.md) tags every decision as decided, default, or open.

## What's in here

| App             | What it is                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/backend`  | .NET 10 API (`Chess.Backend`) — FastEndpoints, EF Core/Npgsql, Akka.NET cluster + sharding, Kafka    |
| `apps/frontend` | TanStack Start SSR app (`chess-frontend`) — **is the BFF**: owns the session cookie and the WS relay |
| `apps/proxy`    | nginx edge for deployment                                                                            |

The browser only ever talks to the frontend origin, for HTTP _and_ realtime. The API is internal; the
session is a server-owned opaque cookie, and tokens never reach the browser.

## Quickstart

Prerequisites: **Docker**, **Node ≥ 24** (pnpm comes from corepack, pinned in `package.json`), and the
**.NET 10 SDK** if you want to build or test the backend outside its container.

```bash
pnpm install                       # also installs the husky hooks
tools/localdev/stack.sh up         # build + start everything, detached
```

Then open <http://app.chess.localhost> and sign in with `testuser` / `Test123!` (an Admin) or
`player` / `Player123!`. The live ping page from Part 0 is at `/pings/<any-lowercase-id>`.

| Service            | URL                                                            |
| ------------------ | -------------------------------------------------------------- |
| App (BFF)          | <http://app.chess.localhost>                                   |
| API (dev-only)     | <http://api.chess.localhost>                                   |
| Keycloak           | <http://keycloak.chess.localhost> — `admin` / `admin`          |
| Redpanda console   | <http://console.chess.localhost>                               |
| RedisInsight       | <http://redisinsight.chess.localhost>                          |
| Traefik dashboard  | <http://127.0.0.1:8090>                                        |
| Postgres           | `127.0.0.1:5432` primary, `127.0.0.1:5433` replica (`chess`×3) |
| Redpanda Kafka API | `127.0.0.1:19092`                                              |

`tools/localdev/stack.sh down -v` drops the volumes for a genuinely fresh database and realm — needed
after changing anything in `tools/localdev/postgres/` or the Keycloak realm export.

## Checking that it works

```bash
pnpm exec nx run-many -t lint test build   # the gate: both apps, cached
tools/localdev/verify-part0.sh             # login → ping → actor → projection → replica → hub
tools/localdev/verify-stack.sh             # replication, Redpanda topics, round-trip
pnpm exec nx integration-test backend      # Testcontainers: the spine against real containers
pnpm -C apps/frontend exec playwright test # browser, against the running stack
tools/coverage-report.sh                   # both apps (gate: 75% lines each)
```

Everything except `nx run-many` needs Docker running. The integration suite starts its own Postgres
and Redpanda — it does not touch the local stack.

## Build, version, publish

Two separate pipelines, and conflating them is the usual confusion: **`nx release` moves version
numbers and changelogs; `nx push` builds and ships images.** Neither calls the other.

### Versions and changelogs — `nx release`

Versions are derived from the conventional-commit scopes, per project, independently
(`projectsRelationship: independent`). `feat(backend): …` bumps only the backend.

```bash
pnpm release:dry          # preview: what bumps, what the changelog says. Writes nothing.
pnpm release              # versions + changelogs + a chore(release) commit + tags
git push --follow-tags    # the tags are the release
```

Both scripts pass `--skip-publish`, because **we never publish packages** — the apps are private and
the artifact is a container image (below). Running bare `nx release` instead ends with an error,
after doing all the real work:

```text
the following projects were matched for publishing but do not have the
"nx-release-publish" target specified: frontend
```

That is the publish phase complaining about `"private": true`. Versions, changelogs, commit and tags
are already written at that point — nothing is lost, and nothing needs re-running.

**A brand-new release group also needs `--first-release` once**, or the changelog step stops with
_"Unable to determine the previous git tag"_ before writing anything. That has already happened here
(see below), so plain `pnpm release` is right from now on.

Each run writes a per-project `CHANGELOG.md` and tags `backend@x.y.z` / `frontend@x.y.z`; there is
no workspace-wide changelog. Where the version itself lives differs per app:

- `frontend` → `apps/frontend/package.json`
- `backend` → the MSBuild `<Version>` in `apps/backend/Directory.Build.props`, taught to Nx by
  `tools/nx-release/dotnet-version-actions.cjs`

The first release is cut: `frontend@0.1.1` and `backend@0.1.1`, with both changelogs written from
the whole history. Below 1.0 a `minor` bump lands on `0.1.1` rather than `0.2.0`; pass `--specifier`
when you want something other than what the commits imply. The changelog credits co-authors, so the
AI co-author trailers appear under "Thank You", and generating it calls `ungh.cc` to map commits to
GitHub users — that call is optional and the changelog is still written without it.

### Images — `nx push`

Images live on **Docker Hub**, under `docker.io/aliendreamer/`. Credentials come from the
environment; the script has no file fallback, so nothing reaches outside the repo for them.

```bash
export REGISTRY=docker.io REGISTRY_USER=aliendreamer REGISTRY_PASS=<access-token>
pnpm push                 # all three apps  (nx run-many -t push)
pnpm push:backend         # or one: push:frontend, push:proxy
```

Each build prints a `YYYYMMDD.<short-git-sha>` tag — **that tag is the deployable unit and the
rollback unit**, independent of the semver above. The images are
`chess-backend`, `chess-frontend` and `chess-proxy`.

Without credentials, build locally instead:

```bash
tools/deploy/build.sh backend local   # build only, tagged :local
pnpm exec nx validate proxy           # build the proxy image and run `nginx -t` inside it
```

### Deploying

Not implemented, on purpose. The `deploy` targets are placeholders that tell you what to do: take
the tag `nx push` printed and re-point your Docker compose/swarm service at it. Nothing in this repo
edits a deployment manifest, and there is no CI pipeline — both are deliberate.

## How the pieces fit

A command is answered by the **actor**, never by a query: `POST /api/pings/{id}` asks the sharded
entity and returns its post-persist state, so you always read your own write. The actor persists to
its journal on the primary, publishes to Kafka, and fans out over DistributedPubSub. A consumer
projects those events into `rm_*` read-model tables, and every list endpoint reads the **replica**.
Live updates reach the browser through a SignalR hub and an SSR WebSocket relay, so the API host
never appears in the client bundle.

That shape — and which of the three consistency points each read wants — is the thing Part 0 existed
to prove. [`ROADMAP.md`](ROADMAP.md) explains why; `CLAUDE.md` explains where.

## Layout

```text
apps/            backend (.NET), frontend (TanStack Start), proxy (nginx)
tools/localdev/  compose stack, Keycloak realm, Postgres init, verify-*.sh
tools/deploy/    image build/push (tag YYYYMMDD.<short-sha>)
docs/superpowers/ Part 0's spec, plan and experiment notes
openspec/        specs and plans from Part 1 onward
```

## Conventions that bite

- **Conventional commits with a required scope**, lower-case subject — the scope is one of
  `frontend`, `backend`, `repo`, `deps`, `proxy`, `ci`, `release`. Commitlint rejects anything else,
  and Nx Release derives versions and per-project changelogs from them.
- **Exact version pins** everywhere — no `^` or `~`, in `package.json` or `Directory.Packages.props`.
- **Backend**: everything `internal sealed`, warning-clean under `AnalysisMode=All` +
  `TreatWarningsAsErrors`, logging through `Utils/Log.cs`.
- **Frontend**: no `VITE_API_URL`, ever. The client bundle must not mention the API host.
- Coverage gates are 75% on both apps; the spine's startup glue is covered by the integration suite
  rather than by mocks.

See [`CLAUDE.md`](CLAUDE.md) for the full command list, the architecture notes that span files, and
the agent-sandbox caveats.
