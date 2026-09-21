# Deploy: build and push app images

`build.sh` builds one app's container image and pushes it to a registry. It is the only deploy
step this skeleton ships — **it stops at the push**. Choosing which pushed image runs, and rolling
back, is your deployment mechanism's job and is deliberately not modelled here.

## Usage

```bash
tools/deploy/build.sh <proxy|frontend|backend> [push|local|validate]
```

Or through Nx (each app has a `push` target that calls the script):

```bash
nx push proxy       # = tools/deploy/build.sh proxy   (build + push)
nx push frontend
nx push backend

nx run-many -t push                      # build + push ALL three images
nx run-many -t push -p proxy frontend    # or a subset

nx validate proxy   # build locally, then `nginx -t` (build.sh proxy validate)
```

Or as pnpm scripts (no global Nx needed — they wrap the Nx `push` targets above):

```bash
pnpm push            # build + push ALL three images
pnpm push:backend    # one app (also push:frontend, push:proxy)
```

The proxy has no compile step, so its `build` target is the same as `push`. For `frontend` and
`backend`, `build` is the app compile (Vite / `dotnet build`); use their `push` target to publish.
To publish everything use `nx run-many -t push`, not `-t build`.

### Modes

| Mode             | What it does                                              | Needs credentials |
| ---------------- | --------------------------------------------------------- | ----------------- |
| `push` (default) | build the image, log in, push, print the tag              | yes               |
| `local`          | build the image locally only (`<image>:local`), no push   | no                |
| `validate`       | build locally, then run `nginx -t` inside it (proxy only) | no                |

## What the script does (push mode)

1. Resolves the per-app **image name**, **build context**, and **Dockerfile** from a `case` on the
   app argument:
   - `proxy` → `aliendreamer/chess-proxy`, context `apps/proxy`, `apps/proxy/Dockerfile`
   - `frontend` → `aliendreamer/chess-frontend`, context repo root,
     `apps/frontend/Dockerfile` (the SSR/BFF build needs the pnpm workspace root)
   - `backend` → `aliendreamer/chess-backend`, context `apps/backend`,
     `apps/backend/Dockerfile`
2. Computes the tag `TAG=$(date +%Y%m%d).$(git rev-parse --short HEAD)` — e.g. `20260720.f0a04ce`.
   **This tag is the deployable version and the rollback unit.**
3. Reads credentials from the environment: `ACR_REGISTRY`, `ACR_USER`, `ACR_PASS`. Missing values
   fail fast, before any build. There is no config-file fallback — supply them from your own
   credential store so nothing here reaches for a path outside the repo.
4. Builds `$ACR_REGISTRY/<image>:$TAG`, logs in (`--password-stdin`), and pushes. `ACR_REGISTRY` is
   the **bare** registry host; the `aliendreamer/` path is part of `<image>`, so the full ref
   is e.g. `docker.io/aliendreamer/chess-backend:$TAG`.
5. Prints the tag as the final stdout line (everything else goes to stderr), so it can be captured:
   `TAG=$(tools/deploy/build.sh proxy)`.

`build.sh` never edits a deployment manifest or triggers a sync.

## The `deploy` step is yours to write

Each app has a `deploy` target whose command is a **placeholder**. The skeleton ships no deploy
script, because the mechanism — GitOps repo, Helm release, `kubectl` apply, a platform API — is
environment-specific, and a generic one would fail on first run for nearly everyone.

The contract to implement is small:

> `push` prints a tag on stdout. `deploy` takes that tag and puts it wherever your target reads
> the image version from, then triggers or awaits a rollout.

A GitOps flow, for example, pipes one into the other and patches a value file in a deploy repo:

```bash
tools/deploy/build.sh backend push | your-deploy-script backend
```

Whatever you write, keep two properties the tagging scheme gives you: the tag is **immutable** and
**traceable to a commit**, so rolling back is re-pointing at a previous tag rather than rebuilding.

## Registry: Docker Hub

Images live under `docker.io/aliendreamer/`. `ACR_*` is the historical variable name — the
script is registry-agnostic. For Docker Hub:

```bash
export ACR_REGISTRY=docker.io ACR_USER=aliendreamer ACR_PASS=<access-token>
```

## Deploy target: Docker (compose / swarm)

Not implemented yet. When it is, `deploy` should take the tag printed by `push`, set it as the
image for the service in the deployment compose/stack file, and roll the service.

## Prerequisites

- A container runtime (`docker` or `podman`) on PATH.
- `ACR_REGISTRY`, `ACR_USER`, `ACR_PASS` exported for `push` mode.
- A clean git worktree is not required, but the tag carries the **current** short SHA — pushing
  from a dirty tree produces a tag that does not describe what was built.
