# Suggested commands

Run from repo root. Prefix Nx with `pnpm exec nx` (no global Nx).

```bash
pnpm install                                   # also installs husky hooks (prepare)
pnpm exec nx show projects
pnpm exec nx run-many -t lint test build       # cached; PR gate
pnpm exec nx affected -t lint test build
pnpm exec nx run-many -t push                  # publish images (NOT -t build)
pnpm exec nx validate proxy                    # build proxy image + nginx -t inside
pnpm exec nx release version --dry-run         # errors until frontend+backend projects exist

pnpm lint:md            # markdownlint-cli2
pnpm lint:md:fix
pnpm exec prettier --check "**/*.{json,md,yml,yaml}"

tools/localdev/stack.sh up [svc...]            # full stack; e.g. `up postgres redis redisinsight keycloak`
tools/localdev/stack.sh down -v                # drop volumes (fresh DB + Keycloak)
tools/localdev/stack.sh logs [svc] | ps | restart [svc]
tools/test-all.sh                              # all tests, both languages
tools/coverage-report.sh
tools/e2e.sh                                   # stack up -> Playwright -> down
tools/deploy/build.sh <proxy|frontend|backend> [push|local|validate]
```

Local URLs: `http://app.chess.localhost`, `api.chess.localhost`, `keycloak.chess.localhost`,
`redisinsight.chess.localhost`; Traefik dashboard `:8080`; Postgres `127.0.0.1:5432` user/pass/db `chess`.

Test commitlint without committing: `echo "feat(repo): x" | pnpm exec commitlint`.
