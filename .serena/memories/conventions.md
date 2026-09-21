# Conventions

## Commits (enforced by commitlint on commit-msg)

- Conventional commits, **scope required**, from: `frontend | backend | repo | deps | proxy | ci | release`.
- Subject lower-case. Example: `chore(repo): scaffold nx workspace`.
- Nx Release attributes commits to projects by scope → wrong/missing scope = wrong/no version bump.
- Release: `projectsRelationship: independent`, tag `{projectName}@{version}`, per-project changelogs only.
  Backend version = MSBuild `<Version>` in `apps/backend/Directory.Build.props` (via
  `tools/nx-release/dotnet-version-actions.cjs`, `currentVersionResolver: disk`).

## Formatting

- lint-staged (pre-commit, `--no-stash` — keep it) runs prettier on json/md/yml/yaml only.
  Code formatting belongs to each app's own `lint` target.
- `.prettierignore`: `pnpm-lock.yaml`, `.claude/skills/`, generated openapi/schema, `apps/backend/Config/`.
- `.md` files pass markdownlint (MD013 line-length disabled; MD033/MD041 disabled).
- Claude Code PostToolUse hook runs prettier on written ts/tsx/js/jsx/scss/css.

## Placeholders / skeleton hygiene

- Skeleton placeholders were `<app-name>` etc.; `<Version>`, `<PropertyGroup>` are MSBuild tags, not placeholders.
- `grep -rnE '<(app-name|AppName|registry|image-namespace|namespace|environment|Realm)>' .` must return nothing.
- Env-specific values live in: `tools/deploy/build.sh` (image names), `apps/proxy/Dockerfile` (base image),
  `apps/proxy/files/nginx.conf` (upstreams), `tools/localdev/docker-compose.yml` (realm/issuer).

## nginx proxy

- Add exact-match `location = /api/x` before a `/api/x/` prefix when a bare path exists (prefix + proxy_pass
  301s the slashless URI and drops DELETE bodies).
- `proxy_buffering off` for responses > 256k; `proxy_request_buffering off` + raised timeouts for large uploads.
- No CSP at the proxy — the SSR layer owns it (per-request nonce).
