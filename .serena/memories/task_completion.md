# Task completion checklist

Run before claiming a change done (current state — extend once apps exist):

```bash
pnpm exec nx run-many -t lint test build      # once frontend/backend have targets; second run must hit cache
pnpm lint:md
pnpm exec prettier --check "**/*.{json,md,yml,yaml}"
grep -rnE '<(app-name|AppName|registry|image-namespace|namespace|environment|Realm)>' . --exclude-dir=node_modules --exclude-dir=.git   # must be empty
```

If touched:

- `apps/proxy/**` → `pnpm exec nx validate proxy` (must print "test is successful").
- `tools/localdev/**` → `tools/localdev/stack.sh up <affected svcs>`; check `docker compose -f tools/localdev/docker-compose.yml ps` healthy; `stack.sh down -v`.
- `nx.json` release block → `pnpm exec nx release version --dry-run`.
- commit message rules → `echo "<msg>" | pnpm exec commitlint`.
- `.claude/settings.json` → run `llm-setup-audit` skill.
- `.md` files → `pnpm lint:md:fix` then re-check.

Cache-isolation check (once apps exist): touch a `.cs` file → frontend targets stay cached; touch a `.ts` → backend stays cached.
