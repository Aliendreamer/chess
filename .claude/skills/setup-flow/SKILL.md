---
name: setup-flow
description:
  "Use when onboarding a repository or agent to the standard development workflow — installs the required
  skills from the ai.skills store, installs or updates a MANDATORY workflow block in the agent's
  instruction file (CLAUDE.md, AGENTS.md, GEMINI.md, Copilot or Cursor rules), AND configures
  .claude/settings.json with Serena MCP, sandbox, permissions, hooks, and plugins. Hooks are wired to the
  context-hooks kit, which speaks once per session instead of injecting text on every turn; re-running
  replaces earlier inline hooks rather than adding to them. Also writes .vscode/settings.json to hide the
  empty shell dotfiles an agent sandbox leaves in the repo root. Use when setting up a new repo,
  switching agents, or refreshing the workflow rules."
type: skill
disable-model-invocation: false
user-invocable: true
tags: [setup, onboarding, workflow, agent-config, developer-flow, serena, settings]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.6.0
author: Aliendreamer
---

# Setup Flow

## Overview

Onboards a repository in three parts: **Phase 0** installs the required skills from the ai.skills store
(so the workflow it wires up actually exists — no manual install); **Phase 1** seeds the **agent
instruction file** with a neutral, reusable **`## MANDATORY workflow`** block so every agent in that
repo follows the same loop (`developer-flow` for all changes, semantic code tools over raw text
search, post-task skill optimization when there's concrete feedback); **Phase 2** configures
`.claude/settings.json`.

**Core principle: idempotent.** The block is wrapped in markers and inserted-or-replaced — running this
skill again updates the block in place, never duplicates it, and never disturbs the rest of the file.

## When to Use

- Onboarding a new repository, or starting work in a repo that has no workflow rules.
- Switching to or adding a different agent (the rules need to live in that agent's file).
- Refreshing the workflow block after `developer-flow` or the conventions change.

**When NOT to use:** for one-off project-specific rules (write those directly in the instruction file);
this skill manages only the shared, neutral workflow block.

## Target file (by agent)

Resolve the instruction file for the active agent. Create it (with a top-level `# <Project>` heading)
if it doesn't exist.

| Agent | Instruction file |
| ----- | ---------------- |
| Claude / Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/workflow.md` (or `.cursorrules`) |

If the agent is unknown, default to `CLAUDE.md` (and `AGENTS.md` as a cross-agent fallback), or ask.

## Phase 0 — Install the required skills

**Runs first**, before injecting the workflow block. setup-flow provisions a mandatory skill set from
the ai.skills store so the workflow it wires up actually exists — the user never installs skills by
hand. Idempotent: re-running re-installs/updates each skill in place.

### 0.1 Build the install list

Always install:

- `developer-flow` — the canonical workflow skill the block and hook point at.
- `context-hooks` — supplies the hook kit Phase 2.5 wires up. Required: Phase 2.5 no longer embeds
  hook text in `settings.json`, so without this skill there are no hook scripts to point at.
- `web-security-audit`
- `llm-setup-audit`
- `md-files-audit` — also the baseline reference used by Phase 2.7.

Conditionally install:

- `audit-package-version` — only when the repo root has a `package.json` (JS / Node project).

Optional (opt-in — install when detected, or when the user asks):

- `azure-devops-workflow` — when the repo uses Azure DevOps: an `azure-pipelines.yml`, a
  `.azuredevops/` directory, or a git remote on `dev.azure.com` / `*.visualstudio.com`.

### 0.2 Resolve the target agent

Use the same agent as the Target file table below (`--agent` value): `claude`, `codex`, `cursor`,
`gemini`, or `copilot`. Default to `claude` if unknown.

### 0.3 Install via the store CLI

Run the installer non-interactively — it fetches from the store and drops each skill into the agent's
skills dir (e.g. `.claude/skills/<id>/`):

```bash
npx -y @aliendreamer/ai-skills add developer-flow web-security-audit llm-setup-audit \
  md-files-audit [audit-package-version] [azure-devops-workflow] \
  --agent <resolved-agent> --project --yes
```

- Include `audit-package-version` in the id list only when `package.json` was detected in 0.1.
- Include `azure-devops-workflow` only when Azure DevOps was detected in 0.1, or the user opts in.
- `--project` installs into the current repo; use `--global` (`~/`) instead only if the user wants the
  skills available across all their repos.
- `-y` / `--yes` skips prompts (it requires `--agent`). Re-running is safe and idempotent.

### 0.4 Verify & report

Confirm each expected skill folder now exists under the agent's skills dir, and report the list
installed (and anything skipped — e.g. `audit-package-version` on a non-JS repo).

**OpenSpec is not installed here.** `developer-flow` treats OpenSpec as optional; if the repo wants
it, set it up separately.

## The block to inject

Insert this verbatim, including the marker comments. It is intentionally **neutral** — no project, org,
stack, or gate count baked in:

```markdown
<!-- setup-flow:start -->
## MANDATORY workflow

**For ANY feature, change, or bugfix you MUST follow the `developer-flow` skill.** Invoke it at the
start of implementation work; do not skip or reorder its steps: brainstorm → plan/proposal →
implement (TDD) → simplify → code review → run the repo's quality gates → report → user approval and
manual verification before archive/commit. If a change adds or modifies a web endpoint, create or
update its `.http` file as part of the same change.

**Prefer semantic code tools for code search and edits** — e.g. Serena MCP or your editor's LSP
(`find_symbol`, `replace_symbol_body`, `find_referencing_symbols`) — over raw text/grep where a
semantic tool applies.

**After finishing a task, optimize skills when there's concrete feedback for it.** If the session
surfaced specific learnings about how a skill performed — an activation gap, a regression, missing or
misleading guidance, or a confirmed improvement — refine that skill (use a skill-optimizing skill if
one is available) before moving on. Only when the feedback is specific; skip it otherwise.
<!-- setup-flow:end -->
```

## Procedure

1. **Resolve the target file** for the active agent (table above). If it doesn't exist, create it with a
   `# <Project name>` heading first.
2. **Look for the markers** `<!-- setup-flow:start -->` … `<!-- setup-flow:end -->` in the file.
   - **Present:** replace everything between (and including) the markers with the current block.
   - **Absent:** append the block to the end of the file, preceded by one blank line.
3. **Leave all other content untouched** — never reorder, dedupe, or rewrite the rest of the file.
4. **Verify** the file has exactly one `setup-flow:start`/`setup-flow:end` pair and the block reads
   correctly, then report which file you changed.

## Common mistakes

- **Duplicating the block.** Appending without checking for the markers first. Always insert-or-replace.
- **Editing project-specific rules.** This skill owns only the marked block; don't touch the rest.
- **Hardcoding specifics.** Keep the block neutral — no org, stack, repo path, or gate count. Repos add
  their own details outside the markers.
- **Writing to the wrong file.** Match the file to the active agent; don't put `CLAUDE.md` rules in a
  Gemini repo.
- **Renaming the skill reference.** It points at `developer-flow` — the canonical skill name.

---

## Phase 2: `.claude/settings.json`

**Claude Code only.** `.claude/settings.json` is read exclusively by Claude Code. Skip Phase 2 when
the active agent is Gemini, Cursor, Copilot, or Codex — Phase 1 (the instruction file) is sufficient
for those agents.

Runs immediately after Phase 1. Configures `.claude/settings.json` for the repo with Serena MCP,
sandbox, permissions, hooks, and plugins. Idempotent on re-run (merge mode preserves existing
customisation).

### 2.1 Existing file check

Check whether `.claude/settings.json` already exists.

- **Absent** → proceed, composing from scratch.
- **Present** → ask the user: **merge** (add missing keys, union lists, preserve existing values)
  or **replace** (overwrite entirely)?

### 2.2 Project type detection

Scan the repo root for these files to determine the sandbox domain and path lists:

| Detected file | Project type | Network domains to add | Filesystem write paths to add |
|---|---|---|---|
| `package.json` | npm / Node | `registry.npmjs.org`, `*.npmjs.org`, `registry.yarnpkg.com`, `github.com`, `codeload.github.com`, `*.githubusercontent.com` | `~/.npm`, `~/.cache`, `~/.local/share/pnpm`, `/usr/local/share/.yarn-global` |
| `*.csproj` or `*.sln` | .NET | `api.nuget.org`, `*.nuget.org`, `github.com`, `codeload.github.com`, `*.githubusercontent.com` | `~/.nuget`, `~/.dotnet` |
| `pyproject.toml`, `setup.py`, or `requirements*.txt` | Python | `pypi.org`, `files.pythonhosted.org`, `github.com`, `codeload.github.com`, `*.githubusercontent.com` | `~/.cache/pip`, `~/.local` |
| `Cargo.toml` | Rust | `crates.io`, `static.crates.io`, `github.com`, `codeload.github.com`, `*.githubusercontent.com` | `~/.cargo` |
| `go.mod` | Go | `proxy.golang.org`, `sum.golang.org`, `github.com`, `codeload.github.com`, `*.githubusercontent.com` | `~/go` |

Multiple types may match (e.g. a repo with both `package.json` and `*.csproj`) — union all matching entries.

**Fallback (nothing detected):** use the curated baseline:

> **Note:** The curated fallback is npm- and Python-biased (covers the most common cases). For Rust
> or Go projects whose manifest is not at the repo root (preventing auto-detection), manually add
> `crates.io`/`~/.cargo` or `proxy.golang.org`/`~/go` entries after setup.

```json
{
  "network": {
    "allowedDomains": [
      "*.githubusercontent.com",
      "*.npmjs.org",
      "codeload.github.com",
      "files.pythonhosted.org",
      "github.com",
      "pypi.org",
      "registry.npmjs.org",
      "registry.yarnpkg.com"
    ]
  },
  "filesystem": {
    "allowWrite": [
      "/usr/local/share/.yarn-global",
      "~/.cache",
      "~/.local/share/pnpm",
      "~/.npm"
    ]
  }
}
```

### 2.3 Prettier detection

Check `package.json` in the repo root:

- `devDependencies` or `dependencies` contains a key starting with `prettier` → **prettier present**.
- OR `scripts` contains any value that references `prettier` → **prettier present**.
- Otherwise → **prettier absent**; skip the PostToolUse hook.

### 2.4 Plugin detection

Discover available plugins by checking (in order):

1. Read `~/.claude/settings.json` → collect keys from its `enabledPlugins` object.
2. List directory entries under `~/.claude/plugins/` if it exists.

Union the two sets into a list of plugin IDs. Present them to the user:

> "Detected plugins: [list]. Which should be enabled? (Select all that apply, or say 'all' / 'none'.)"

Wait for the user's answer before continuing. Build the `enabledPlugins` map: `{ "<id>": true/false }` per the user's selection.

### 2.5 Compose and write `.claude/settings.json`

Assemble the settings object from all gathered inputs and write (or merge into) `.claude/settings.json`.

#### Always-included sections

**`mcpServers`:**

```json
{
  "serena": {
    "command": "uvx",
    "args": [
      "--from",
      "git+https://github.com/oraios/serena",
      "serena",
      "start-mcp-server",
      "--context",
      "claude-code",
      "--project-from-cwd",
      "--open-web-dashboard",
      "false"
    ]
  }
}
```

**`sandbox`** (defaults shown; the root flags are tunable per environment — see the flag guidance
below. Domain/path lists come from 2.2):

```json
{
  "enabled": true,
  "failIfUnavailable": true,
  "allowUnsandboxedCommands": false,
  "network": { "allowedDomains": ["<from 2.2>"] },
  "filesystem": { "allowWrite": ["<from 2.2>"] }
}
```

**Flag guidance — set these to fit the environment the agent runs in.** Ask the user where this repo
runs (local dev, CI, WSL2) if it isn't obvious; default as shown and call out the exceptions:

- **`enabled`** — keep `true`. Disabling removes the protection entirely; prefer widening the `2.2`
  `network`/`filesystem` lists, or `allowUnsandboxedCommands`, over turning the sandbox off.
- **`failIfUnavailable`** — `true` refuses to start Claude Code when the sandbox can't initialise, so
  you never silently run unsandboxed. Keep `true` for local dev on a supported platform. Set
  **`false`** where sandboxing is unavailable or flaky — **CI runners**, **some WSL2 configs**, and
  platforms with no sandbox support — otherwise the agent won't start there.
- **`allowUnsandboxedCommands`** — `false` blocks any command from escaping the sandbox. Keep `false`
  by default. Set **`true`** only when specific tooling genuinely needs it (e.g. build tools that fail
  under the sandbox — some Nx / `tsx` / native-toolchain invocations); the agent then runs such
  commands unsandboxed on approval. Where the agent supports per-command overrides, narrow to the
  offending commands instead of a blanket `true`.

**`permissions`** (fixed baseline — always the same):

```json
{
  "allow": [
    "Bash(git*)",
    "SKILL(*)",
    "mcp__azure-devops__core_list_projects",
    "mcp__azure-devops__search_workitem",
    "mcp__azure-devops__wit_get_work_item",
    "mcp__azure-devops__wit_get_work_item_attachment",
    "mcp__azure-devops__wit_get_work_items_batch_by_ids",
    "mcp__azure-devops__wit_list_work_item_comments",
    "mcp__azure-devops__wit_query_by_wiql",
    "mcp__plugin_serena_serena__*"
  ],
  "deny": [
    "Bash(git branch --delete --force*)",
    "Bash(git branch -D*)",
    "Bash(git push --force*)",
    "Bash(git push -f*)",
    "Bash(git reset --hard*)",
    "Bash(rm -rf*)"
  ]
}
```

**`hooks`** (always included):

Hook text is NOT embedded here. A hook's `additionalContext` is injected on **every fire** and is
never compacted away, so an inline string is re-paid on every prompt and every search — measured at
roughly 4.8k tokens per session on a repo running the previous inline version of this block. The
hooks below point at the `context-hooks` kit instead, which says each thing once per session and
keeps the wording in project-owned text files.

**Run Phase 2.5a (below) first** — it installs the kit. These entries are wiring only; they are
inert until the scripts exist.

> **Note:** `UserPromptSubmit` does not support a `matcher` field — the entry object contains only
> `hooks`. Do not add a `matcher` key here (unlike `PreToolUse` and `PostToolUse` entries).

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/claude-hooks/dev-flow-reminder.sh\"",
          "statusMessage": "Loading development flow"
        }
      ]
    }
  ],
  "PreToolUse": [
    {
      "matcher": "Grep",
      "hooks": [
        {
          "type": "command",
          "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/claude-hooks/prefer-serena.sh\""
        }
      ]
    },
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/claude-hooks/prefer-serena.sh\""
        }
      ]
    }
  ]
}
```

### 2.5a Install the hook kit

Invoke the `context-hooks` skill and follow it. In summary:

1. Copy its `kit/` to `.claude/claude-hooks/` and ensure the `.sh` files are executable.
2. `context/prefer-serena.txt` ships ready to use — keep it, unless the agent instruction file
   already carries that guidance always-loaded, in which case delete it so the hook stays silent.
3. `context/dev-flow.full.txt` is repo-specific. **Ask before producing it** — writing it means
   scanning the repo's instruction file and authoring a file on the user's behalf:

   > "Shall I scan `CLAUDE.md` and write `dev-flow.full.txt` — the workflow specifics it doesn't
   > already carry? I'll show you the text first."

   Declined is a valid outcome: leave the `.example` unrenamed, that hook stays silent, and the rest
   of setup completes.

4. Verify `jq` is on PATH. Without it the hooks exit 0 and stay silent by design — which is
   indistinguishable from working, so check rather than assume.

### 2.5b Replace old inline hooks — do not append

The `hooks` row of the Merge rules table below is append-if-absent, keyed on event plus command
string, and this step is what makes it safe. Earlier versions of
this skill wrote hook commands that embed an `additionalContext` string inline. Those commands do
not match the new ones, so appending would leave the repo running **both** generations — the
every-turn hook and its replacement together, strictly worse than before setup ran.

Before merging, scan the existing `hooks` for entries whose `command` contains
`hookSpecificOutput` or `additionalContext` as literal text. Each one is a previous-generation
inline hook: **replace it** with the corresponding entry above rather than adding alongside it.
Leave any hook that does real work (formatters, linters, validators) untouched — this rule applies
only to hooks whose whole purpose is injecting text.

**PostToolUse prettier hook** (only if prettier detected in 2.3):

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null); case \"$f\" in *.ts|*.tsx|*.js|*.jsx|*.scss|*.css) [ -f \"$f\" ] && ./node_modules/.bin/prettier --ignore-unknown --write \"$f\" >/dev/null 2>&1 ;; esac; exit 0",
          "statusMessage": "Formatting with prettier…"
        }
      ]
    }
  ]
}
```

**`enabledPlugins`** — map from 2.4 with user-selected true/false values.

> **Note:** `SKILL(*)` pre-approves skill invocations. This is supported in Claude Code with the
> superpowers plugin; verify it is supported in your agent before including it.

#### Merge rules (when user chose merge in 2.1)

| Section | Merge behaviour |
|---|---|
| `mcpServers.serena` | Add key only if absent; leave other servers untouched |
| `sandbox.network.allowedDomains` | Union with existing (deduplicate + sort) |
| `sandbox.filesystem.allowWrite` | Union with existing (deduplicate + sort) |
| `sandbox` root flags | Set only if the key is absent; never overwrite |
| `permissions.allow` | Append entries not already present |
| `permissions.deny` | Append entries not already present |
| `hooks` | **Replace, then add.** First apply 2.5b: any existing entry whose `command` contains literal `hookSpecificOutput` or `additionalContext` is a previous-generation inline hook — replace it with this version's entry for the same event/matcher. Then add remaining missing entries; skip true duplicates — for entries with a `matcher`: match on event + matcher + command; for `UserPromptSubmit` (no matcher): match on event + command string. Never append a text-injecting hook beside one it supersedes: both would fire |
| `enabledPlugins` | Add new keys from detection; preserve existing values; only update values user explicitly chose |

### 2.6 Report

After writing `.claude/settings.json`, tell the user:

- Path written: `.claude/settings.json`
- Sections written: which top-level keys were added/updated
- Prettier hook: included or skipped (reason)
- Plugins enabled/disabled: the final map
- If merge: which keys already existed and were preserved
- **Hooks replaced (2.5b): one line per replaced entry, quoting the old command.** This rewrites
  configuration the user may have hand-edited, so it must be visible here and reviewable in
  `git diff` — never a silent swap. Say "no inline hooks found" when none were replaced.
- Hook kit: whether `.claude/claude-hooks/` was installed, whether `dev-flow.full.txt` was authored
  or declined, and whether `jq` was found

### 2.7 Markdown lint detection (optional)

Check whether the repo tracks `.md` files and has `markdownlint-cli2` configured:

- `package.json` scripts contain `markdownlint-cli2` → **markdownlint present**.
- OR `.markdownlint-cli2.jsonc` / `.markdownlintrc.json` exists at repo root → **markdownlint
  present**.
- Otherwise → **markdownlint absent**; skip this step and do not add lint:md scripts.

When markdownlint is present, verify:

1. `lint:md` and `lint:md:fix` scripts exist in `package.json` (add if missing).
2. `.markdownlint-cli2.jsonc` exists and covers the right globs (use **md-files-audit** as the
   reference for a correct baseline config).
3. Run `pnpm lint:md` — if it exits non-zero, run `pnpm lint:md:fix` and re-check.

### 2.8 Editor noise — `.vscode/settings.json`

Running an agent in a sandbox leaves **empty shell dotfiles** in the repo root. They are artifacts,
never project files, and they clutter the explorer and file-search for everyone who works in the
repo. Hide them.

Write `.vscode/settings.json` with this `files.exclude` block:

```json
{
  "files.exclude": {
    ".bashrc": true,
    ".bash_profile": true,
    ".profile": true,
    ".zshrc": true,
    ".zprofile": true,
    ".gitconfig": true,
    ".ripgreprc": true,
    ".gitmodules": true,
    ".idea": true
  }
}
```

**Merge, never overwrite.** If `.vscode/settings.json` exists, add only the missing keys inside
`files.exclude` and leave every other setting — and every existing exclusion — untouched. A
developer's editor config is theirs.

**Do not change `.gitignore`.** Write the file whether or not `.vscode` is ignored, and leave the
repo's ignore policy alone:

- `.vscode` **ignored** → the exclusions are per-developer. Each person gets them when they run
  setup-flow.
- `.vscode` **tracked** → the exclusions are shared, which is usually right: the artifacts appear
  for everyone using the agent, so hiding them once helps the whole team.

Some teams deliberately share `.vscode`; others deliberately ignore it. Either is fine, and
neither is setup-flow's call to make.

Two entries in that list are **not** sandbox artifacts, and are included because they are ordinary
editor noise:

- `.idea` — JetBrains' project directory.
- `.gitmodules` — a real git file. Hiding it is a display choice only; say so in the report, so
  nobody debugging submodules concludes the file is missing.

**Do not add `.mcp.json` to the list.** It is a real project MCP configuration in most repos;
hiding it would conceal working config. It only looks like an artifact when a sandbox has masked
it.

**Never hide the repo's secrets file.** It is a file people legitimately open and edit, and making
it invisible causes more confusion than the screenshare exposure it would prevent. `.gitignore` and
the `permissions.deny` rules are the controls that matter there.

Report which keys were added and which already existed.

### Common mistakes (Phase 2)

| Mistake | Fix |
|---|---|
| Writing `PostToolUse` hook when prettier is absent | Check `package.json` first; skip the hook if not found |
| Overwriting existing sandbox flags on merge | Only `set` a root flag if the key is absent |
| Disabling the sandbox to unblock a command | Keep `enabled: true`; widen `network`/`filesystem` or use `allowUnsandboxedCommands` instead |
| Setting `failIfUnavailable: false` everywhere | Keep `true` for local dev; only relax it for CI / WSL2 / unsupported platforms |
| Assuming `.claude/settings.json` lives at repo root | It lives at `.claude/settings.json` relative to the repo |
| Not deduplicating domain/path lists | Use a Set merge; sort the result |
| Auto-enabling all detected plugins | Always ask the user; never auto-enable |
| Writing the PAT or any secret into settings.json | `secrets.json` is the home for secrets; never touch them here |
| Overwriting an existing `.vscode/settings.json` | Merge only the missing `files.exclude` keys; a developer's editor config is theirs |
| Adding `.vscode` to `.gitignore` | Leave the repo's ignore policy alone — sharing or ignoring `.vscode` is a team decision |
| Hiding `.mcp.json` or the secrets file | Both are real files people need; hiding them conceals working config |
