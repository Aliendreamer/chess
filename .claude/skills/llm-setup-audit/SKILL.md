---
name: llm-setup-audit
description:
  "Use when reviewing or hardening Claude Code agent configuration (.claude/settings.json / settings.local.json) —
  before committing config changes or onboarding a repo. Covers permissions, sandbox, hooks, MCP servers, plugins,
  committed secrets, and secrets-file gitignore. For application/infra security use web-security-audit."
type: skill
disable-model-invocation: false
user-invocable: true
tags: [security, audit, claude-code, configuration]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
---

# Agent Setup Audit (.claude/settings.json)

## Overview

Checks the **Claude Code harness configuration** for permission-bypass and supply-chain risk: who can run what, what
runs automatically (hooks), what code is pulled in (MCP servers, plugins), and whether secrets leaked into a committed
file. Run each from the repo root, report **PASS** or **FLAG**, investigate every FLAG.

This audits **how the agent is allowed to act**. For the security of the code/infra you ship, use
**web-security-audit**.

## When to use

- Before committing changes to `.claude/settings.json` / `settings.local.json`.
- When onboarding or reviewing a repo whose agent config you didn't write.
- When an automated commit-review flags a permission/bypass issue.

## Checks

### 1. No blanket Bash allow

```bash
jq -e '.permissions.allow[]? | select(. == "Bash" or . == "Bash(*)")' .claude/settings.json
```

PASS: exit ≠ 0 (no match). Bash should be a **narrow toolchain allowlist** (`Bash(git *)`, `Bash(dotnet *)`, …). FLAG:
`Bash(*)` / `Bash` — any-command bypass.

### 2. Permission mode isn't silently permissive

```bash
jq -r '.permissions.defaultMode // "default"' .claude/settings.json
```

FLAG (unless deliberate + documented): `bypassPermissions` or `dontAsk` / `acceptEdits` as the standing default.

### 3. Deny list is present (but not relied upon)

```bash
jq -e '.permissions.deny' .claude/settings.json     # exists = ok
```

A literal-prefix `deny` list (`Bash(rm -rf*)`) is **best-effort only** — bypassed by spacing, chaining (`&&`), or
aliasing. It's defense-in-depth, never the primary control. FLAG: a deny list used _instead of_ an allowlist.

### 4. Sandbox state is intentional

```bash
jq -r '.sandbox.enabled // "unset"' .claude/settings.json
```

The value must be deliberate and documented (commit/CLAUDE.md/memory). If `false`, the Bash allowlist (check 1) is the
guardrail. If `true`, confirm it actually engages on this host (it can silently fall back to unsandboxed without
`bwrap`/`socat`).

### 5. No secrets in the committed settings

```bash
jq -e '(.env // {}) | to_entries[] | select(.value|test("(?i)(secret|token|api[_-]?key|password)"))' .claude/settings.json
git check-ignore .claude/settings.json    # PASS: NOT ignored → it's committed → must hold no secrets
```

`settings.json` is git-tracked. FLAG: secrets in `.env`, in a hook `command`, or in `mcpServers` args. Real secrets
belong in **`.claude/settings.local.json`** (which must be gitignored).

For agent behavioral rules around reading and echoing secrets at runtime, see **`secrets-safety`**.

### 6. Hooks are safe (they run automatically = RCE surface)

```bash
jq -r '(.hooks // {}) | to_entries[] | .key as $e | .value[].hooks[] | "\($e): \(.command // .url // .type)"' .claude/settings.json
```

Review each: does it write **outside** the repo, `curl`/exfiltrate, or pipe untrusted tool input into a shell? A hook
fires on every matching event — a hostile one is silent code execution. FLAG: network calls to unknown hosts, writes to
`~`/system paths, or `eval` of tool output.

### 7. MCP servers are from trusted sources

```bash
jq -r '(.mcpServers // {}) | to_entries[] | "\(.key): \(.value.command) \(.value.args|join(" "))"' .claude/settings.json
jq -r '.enableAllProjectMcpServers // false' .claude/settings.json
```

FLAG: a server pulling from an unpinned/untrusted source, or `enableAllProjectMcpServers: true` (auto-approves every
server in `.mcp.json`) without having reviewed `.mcp.json`.

### 8. Plugins / marketplaces are trusted

```bash
jq -r '(.enabledPlugins // {}) | keys[]' .claude/settings.json
jq -r '(.extraKnownMarketplaces // {}) | to_entries[] | "\(.key): \(.value.source)"' .claude/settings.json
```

FLAG: a plugin from a marketplace you don't recognize/control.

### 9. The file is valid JSON

```bash
jq -e . .claude/settings.json >/dev/null && echo PASS
[ -f .claude/settings.local.json ] && jq -e . .claude/settings.local.json >/dev/null
```

**Invalid JSON silently disables every setting in that file** — including your permission and hook config. Always
validate after editing.

### 10. Secrets source is gitignored

The user's secrets may live as a single file, a folder, or a file pattern. Check whichever
applies (ask the user if unsure):

```bash
# Single file (default: config.conf)
git check-ignore -v config.conf

# Folder
git check-ignore -v secrets/

# File pattern (e.g. .env.*)
git ls-files --others --exclude-standard | grep -E '^\.env\.' | head -5
# All matches should be untracked (gitignored); any tracked file is a FLAG
```

PASS: the secrets source is fully gitignored. FLAG: any file, folder, or pattern match that
is **not** gitignored — it can be committed and leaked. The sandbox filesystem restriction is
a runtime guardrail, not a substitute for keeping secrets out of version control.

## Report format

List checks `1–10` as **PASS** / **FLAG** with the offending key for any FLAG and a one-line fix.

## Common mistakes

| Mistake                                       | Why it's wrong                                                      |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `Bash(*)` "for a smooth dev loop"             | Any-command bypass — narrow to a toolchain allowlist                |
| Trusting the `deny` list to block `rm -rf`    | Prefix denies are bypassable; only an allowlist actually constrains |
| Secrets in `.claude/settings.json`            | It's committed — put secrets in gitignored `settings.local.json`    |
| A broad hook with no `matcher`/path guard     | Fires on everything; perf cost + a standing execution surface       |
| `enableAllProjectMcpServers: true` unreviewed | Auto-trusts arbitrary servers declared in `.mcp.json`               |
| Secrets source (file/folder/`.env.*`) not gitignored | Sandbox blocks runtime reads; git doesn't — can be committed   |
