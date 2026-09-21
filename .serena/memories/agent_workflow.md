# Agent workflow — user preferences for this repo

- **No `developer-flow` skill here.** Do not install it, do not add setup-flow's `## MANDATORY workflow`
  block to CLAUDE.md, do not wire `dev-flow-reminder.sh`. Only setup-flow Phase 2 (settings.json, hooks,
  .vscode) applies. (User, 2026-09-21: "we dont use developer flow here but settings we want".)
- Project memory lives **here, in `.serena/memories/`** (per-project), not in the agent's private memory dir.
- `.claude/settings.json`: sandbox on, `failIfUnavailable: false` (WSL2), npm + NuGet domains/paths,
  Serena MCP via uvx, `prefer-serena.sh` PreToolUse hook (Grep/Bash, once per session), prettier PostToolUse
  hook, `enabledPlugins` mirrors the user-level set. Edit it with the Edit tool — Bash writes to it are
  sandbox-denied.
- `.vscode/settings.json` hides sandbox shell dotfiles + `.idea` + `.gitmodules` (display only).
- Nothing is committed on the user's behalf unless asked.
- Skeleton source of truth: `~/projects/ai.skills/prompts/nx-monorepo/skeleton/` (the copy in
  `.claude/commands/` has no skeleton beside it).
