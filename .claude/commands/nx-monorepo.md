# Nx monorepo — workspace skeleton

The workspace that `dotnet-webapi` and `fe-ssr-tanstack` drop into. Those prompts build the apps;
this one builds everything around them.

## How Claude must work on this

- **The skeleton is shipped, not written.** `skeleton/` next to this file holds the real config.
  Copy it; do not retype it. Prose here explains _why_ each piece exists and what to change — the
  file is the content.
- **Substitute placeholders, then verify none remain.** Every `<app-name>`, `<AppName>`,
  `<registry>`, `<image-namespace>`, `<namespace>`, `<environment>` and `<Realm>` is a value you
  collect in STEP 0. `<Version>`, `<PropertyGroup>`, `<Function>` and `<Exclude>` are **not**
  placeholders — they are MSBuild/XML tags. Leave them alone.
- **Do not invent a deploy mechanism or a CI pipeline.** Neither ships, deliberately. See below.
- Work in the build order at the end. The stack is testable long before the apps exist.

## STEP 0 — ask, then stop and wait

Collect these before writing anything, and stop for the answers:

1. **App name** — PascalCase and kebab-case (`<AppName>` / `<app-name>`). Used in service names,
   image names, hostnames and the Keycloak realm.
2. **Which apps** — backend, frontend, proxy, or a subset. The proxy only earns its place if the
   frontend is an SSR BFF.
3. **Container registry** — `<registry>` host and `<image-namespace>` path prefix, or "none yet"
   to leave the push path unconfigured.
4. **Deploy target** — what reads the image tag (GitOps repo, Helm, `kubectl`, a platform API).
   You will _document_ this, not implement it.
5. **Keycloak realm name** — `<Realm>`, for the local stack and the backend's authority URL.
6. **Kubernetes namespace(s)** — `<namespace>` and `<environment>`, if the proxy is included; the
   proxy config uses fully-qualified cross-namespace service names.

## Outcome (what exists when done)

- An Nx + pnpm workspace with cached `build`/`test`/`lint` and a `dotnet` named input, so .NET
  changes do not bust the JS cache and vice versa.
- Conventional commits enforced at commit time, and formatting applied to staged files.
- `tools/localdev/stack.sh up` brings the whole system up: Postgres, Redis, RedisInsight, Keycloak
  (pre-seeded realm), and the apps.
- One command runs every test across both languages; another produces a combined coverage report.
- `nx release` versions the .NET project from its MSBuild `<Version>` and the JS projects from
  `package.json`, independently, from conventional commits.
- `nx push <app>` builds and pushes an immutable, commit-traceable image tag.

## The skeleton, area by area

### Task wiring — `nx.json`, `pnpm-workspace.yaml`, `package.json`

`targetDefaults` caches `build`, `test` and `lint`, with `build` depending on `^build`. The
`namedInputs.dotnet` entry is the piece worth understanding: without it, every JS change
invalidates the backend's cache, because the default input is "everything in the project". It
lists `.cs`, `.csproj`, `.slnx`, `Directory.Build.props` and the runsettings, and excludes `bin/`
and `obj/`.

Root `package.json` pins `packageManager` with a hash — keep that pinned and bump it deliberately;
an unpinned package manager is how a workspace drifts between machines. The `push:*` / `deploy:*`
scripts are thin wrappers over the Nx targets so contributors need no global Nx.

### Commit hygiene — `.husky/`, `commitlint.config.js`, `.lintstagedrc.json`

`commit-msg` runs commitlint (conventional commits — **Nx Release reads these to decide version
bumps**, so this is load-bearing, not decoration). `pre-commit` runs `lint-staged --no-stash`.

**`--no-stash` is deliberate.** The default stashes unstaged changes and restores them after; when
a hook fails mid-run that restore can lose work. Keep the flag.

`lint-staged` formats `json`/`md`/`yml`/`yaml` only — code formatting belongs to each app's own
lint target, where it can be language-aware.

### Local development — `tools/localdev/`

`docker-compose.yml` brings up Postgres (built, not pulled — it needs `pg_cron` and `pg_partman`),
Redis + RedisInsight, Keycloak with an init container that seeds the realm, and the three apps with
their sources bind-mounted.

`stack.sh` wraps it and is container-runtime agnostic — `docker compose`, `podman compose` or
`docker-compose`, whichever exists:

```bash
tools/localdev/stack.sh up            # build + start detached
tools/localdev/stack.sh down -v       # also drop volumes (fresh DB + Keycloak)
tools/localdev/stack.sh logs [svc]
```

**The Keycloak issuer URL must resolve identically inside containers and in the browser**, which is
why the compose file sets `extra_hosts`. Get this wrong and tokens validate in one place and not
the other — the failure looks like a broken login, not a DNS problem.

### Test and coverage — `tools/`

| Script               | Does                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `test-all.sh`        | every test across both apps, one command                            |
| `e2e.sh`             | brings the stack up, installs browsers, runs Playwright, tears down |
| `coverage-report.sh` | combined coverage for both languages                                |
| `e2e-coverage.sh`    | builds an instrumented stack and reports coverage from E2E traffic  |

`coverage.runsettings` and `flush-coverage.cjs` support the instrumented run — the `.cjs` flushes
the frontend's coverage buffer so E2E coverage is not lost on container stop.

### Release — `nx.json` `release` block + `tools/nx-release/dotnet-version-actions.cjs`

Projects version **independently** (`projectsRelationship: "independent"`), each from its own
conventional commits, each with its own changelog, tagged `{projectName}@{version}`. There is no
workspace-level changelog.

**`dotnet-version-actions.cjs` is the least guessable file here.** Nx Release versions JS projects
natively from `package.json`; the backend has no `package.json` — its version lives in the MSBuild
`<Version>` property of `apps/backend/Directory.Build.props`. This shim teaches Nx Release to read
and write that property. It is wired through the backend project's
`release.version.versionActions` with `currentVersionResolver: "disk"`. Copy it as-is; it contains
no project-specific values.

### Proxy — `apps/proxy/`

One nginx container as the single public entrypoint: `/api/` to the backend, everything else to the
SSR frontend, `/hc` served locally as a 200 for readiness probes. This is what makes the SSR-BFF
architecture coherent — without it, the browser needs to know two hosts.

Three things in `nginx.conf` worth reading before editing:

- **Fully-qualified cross-namespace service names.** The proxy may not live in the app's namespace.
- **`proxy_buffering off` on large responses.** Anything over the 256k of `proxy_buffers` spools to
  disk on every request otherwise. Two example blocks show the pattern; delete them if you have no
  oversized endpoints.
- **`proxy_request_buffering off` on large uploads**, with raised timeouts, so bodies stream
  through instead of spooling.

The base image is a placeholder. Swap it for a hardened nginx that runs non-root on port 8080 with
writable runtime dirs — the `chmod` lines assume an arbitrary UID with GID 0.

### Deploy — `tools/deploy/build.sh` only

`build.sh` builds an image and pushes it, tagged `YYYYMMDD.<short-git-sha>`. That tag is the
deployable version and the rollback unit: immutable, and traceable to a commit. Credentials come
from `ACR_REGISTRY` / `ACR_USER` / `ACR_PASS` in the environment — no file fallback, so nothing
reaches outside the repo.

**No deploy script ships.** Each app's Nx `deploy` target is a placeholder you replace. The
contract is one sentence:

> `push` prints a tag on stdout; `deploy` puts that tag where your target reads the image version,
> then triggers or awaits the rollout.

A GitOps flow pipes one into the other. A Helm flow passes it as a value. Both are yours to write —
the mechanism is environment-specific, and a generic one fails on first run for nearly everyone.

### CI — targets, not a pipeline

**No pipeline file ships**, for the same reason. Wire your CI to these targets:

```bash
pnpm install --frozen-lockfile
nx affected -t lint test build      # PR gate
nx run-many -t push                 # on merge to the release branch
```

Use `nx affected` on pull requests and `run-many` on the release branch. Nx's cache is what makes
the PR gate fast; make sure CI restores it.

## Environment-specific — the adopter must replace these

| Item                                 | Where                                            |
| ------------------------------------ | ------------------------------------------------ |
| Container registry + image namespace | `tools/deploy/build.sh`, `apps/proxy/Dockerfile` |
| Proxy base image                     | `apps/proxy/Dockerfile`                          |
| Kubernetes namespaces                | `apps/proxy/files/nginx.conf`                    |
| Keycloak realm + issuer URL          | `tools/localdev/docker-compose.yml`              |
| Deploy target                        | each app's `deploy` target                       |

## CRITICAL gotchas (each cost real debugging — bake them in)

- **`lint-staged --no-stash`.** The default can lose unstaged work when a hook fails mid-run.
- **The `dotnet` named input.** Omit it and every JS commit invalidates the backend cache; CI gets
  slower and nobody notices why.
- **Conventional commits are load-bearing.** Nx Release derives bumps from them. A repo that lets
  `wip:` through gets no release.
- **Keycloak issuer must resolve the same inside and outside containers.** Otherwise login fails in
  a way that looks like an app bug.
- **`nx run-many -t build` does not publish.** For the proxy, `build` equals `push`; for the other
  two, `build` is the compile. Publish with `-t push`.
- **A dirty worktree produces a lying tag.** `YYYYMMDD.<sha>` describes the commit, not your
  uncommitted changes.

## Verify before claiming done

1. `pnpm install` succeeds and `packageManager` is pinned.
2. `git commit -m "bad message"` is **rejected** by commitlint; a conventional message passes.
3. `tools/localdev/stack.sh up` reaches a healthy state for every service; `down -v` cleans up.
4. `nx run-many -t lint test build` passes, and a second run is served from cache.
5. Touch a `.cs` file — the frontend's cached targets stay cached. Touch a `.ts` file — the
   backend's do.
6. `nx release --dry-run` proposes a version for the backend read from `Directory.Build.props`.
7. `tools/deploy/build.sh <app> local` builds without credentials; `nx validate proxy` passes
   `nginx -t`.
8. `grep -rnE '<(app-name|AppName|registry|image-namespace|namespace|environment|Realm)>' .`
   returns nothing.

## Suggested build order

1. Copy `skeleton/`, substitute placeholders, `pnpm install`.
2. Husky + commitlint — prove a bad commit message is rejected before anything else lands.
3. Nx wiring: `targetDefaults`, `namedInputs`, per-app `project.json`.
4. Local stack: Postgres, Redis, Keycloak first; add apps as they exist.
5. Build the apps — `dotnet-webapi` and `fe-ssr-tanstack`.
6. Test and coverage scripts, once there are tests to run.
7. Proxy, once both apps serve.
8. Release config, then `build.sh` and the registry.
9. Write your `deploy` target and wire CI to the targets above.
