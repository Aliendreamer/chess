# Agent workflow — user preferences and sandbox facts for this repo

- **No `developer-flow` skill here.** Do not install it, do not add setup-flow's `## MANDATORY workflow`
  block to CLAUDE.md, do not wire `dev-flow-reminder.sh`. Only setup-flow Phase 2 (settings.json, hooks,
  .vscode) applies. (User, 2026-09-21: "we dont use developer flow here but settings we want".)
- Project memory lives **here, in `.serena/memories/`** (per-project), not in the agent's private memory dir.
- `.claude/settings.json`: sandbox on, `failIfUnavailable: false` (WSL2), npm + NuGet domains/paths
  (`~/.local/share/NuGet` is required — NuGet's http-cache lives there on this machine), Serena MCP via
  uvx, `prefer-serena.sh` PreToolUse hook, prettier PostToolUse hook. Edit it with the Edit tool — Bash
  writes to it are sandbox-denied. `permissions.deny` includes `rm -rf*` — don't put that in commands.
- Nothing is committed on the user's behalf unless asked. Scaffold prompts' STEP 0 answers are already
  fixed by the skeleton (`Chess.Backend`, `chess-frontend`, slug `chess`) — don't re-ask.

## Sandbox limits (bubblewrap) and what to do

| Blocked | Symptom | Workaround inside sandbox |
| --- | --- | --- |
| MSBuild worker-node IPC | `dotnet restore/build <slnx>` fails with 0 errors | add `-m:1 -nr:false` |
| SourceLink reading `.gitmodules` (masked as /dev/null) | MSB error "Access to .gitmodules denied" | `-p:EnableSourceControlManagerQueries=false` |
| Named mutex (`/tmp/.dotnet/shm`) | coverlet reports 0% coverage, tests still pass | none — user runs `apps/backend/build_test.sh` |
| Roslyn build-host socket | `dotnet format` crashes (Socket permission denied) | `dotnet format whitespace . --folder` only; user runs full lint |
| Docker socket | `permission denied … docker.sock` | user runs `tools/localdev/stack.sh`, `verify-auth.sh`, `tools/e2e.sh` via `!` |
| TCP listen/connect on localhost | works | can run built SSR server + a fake API for proofs |

Sandbox masks (`.mcp.json`, `.claude/{loop.md,launch.json,…}`, shell dotfiles) appear as unreadable
device files in every cwd: they are ignored in `.prettierignore`, markdownlint, the backend csproj
`DefaultItemExcludes`, and `.vscode/settings.json`.
