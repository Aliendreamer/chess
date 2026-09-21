# Task completion checklist

Run before claiming a change done. From repo root unless noted.

```bash
pnpm exec nx run-many -t lint test build      # second run must be served from cache
pnpm lint:md
pnpm exec prettier --check "**/*.{json,md,yml,yaml}"
grep -rnE '<(app-name|AppName|registry|image-namespace|namespace|environment|Realm)>' . --exclude-dir=node_modules --exclude-dir=.git   # must be empty
```

Per app (what the Nx targets run):

- backend: `dotnet build Chess.Backend.csproj` warning-clean → `./build_test.sh` (119+ tests, ≥90% lines)
  → `dotnet format Chess.Backend.slnx --verify-no-changes`. Inside the agent sandbox use the flags in
  `mem:agent_workflow`; coverage % and `dotnet format` need a human run.
- frontend (`apps/frontend`): `pnpm generate-routes` (if routes changed) → `pnpm typecheck` → `pnpm lint`
  → `pnpm check` → `pnpm test` → `pnpm build`.

If touched:

- auth/session code (either app) → `tools/localdev/stack.sh up && tools/localdev/verify-auth.sh` (human),
  and `tools/e2e.sh` for the browser flow incl. revocation.
- `apps/proxy/**` → `pnpm exec nx validate proxy` (must print "test is successful").
- `tools/localdev/**` → `stack.sh up <svcs>`; `docker compose -f tools/localdev/docker-compose.yml ps` healthy; `down -v`.
- `tools/localdev/keycloak/*.json` → `stack.sh down -v` first (import only happens into fresh state).
- `nx.json` release block or `project.json#release` → `pnpm exec nx release version --dry-run`.
- commit message rules → `echo "<msg>" | pnpm exec commitlint`.
- `.claude/settings.json` → run `llm-setup-audit` skill.
- `.md` files → `pnpm lint:md:fix` then re-check.
