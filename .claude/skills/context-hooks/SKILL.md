---
name: context-hooks
description:
  'Install Claude Code context-injection hooks that speak once per session instead of once per fire, so standing
  guidance stops accumulating in the conversation. Use when hooks are re-injecting the same text every turn, when
  token usage grows with session length, or when setting up a repo''s hooks for the first time. Requires jq at
  runtime. Ships shell scripts, so it reaches folder-based agents only — cursor gets this guidance without the kit.'
type: skill
disable-model-invocation: false
user-invocable: true
tags: [hooks, context, tokens, claude-code, settings, setup, performance]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
author: Aliendreamer
---

# Context Hooks

## Overview

A hook's `additionalContext` is injected into the conversation on **every fire** and is never
compacted away. A `UserPromptSubmit` hook that states a workflow contract pays for that text on
every prompt; a `PreToolUse` nudge pays on every matching tool call. Measured over 16 sessions of
one repo before this kit: a dev-flow contract fired 255 times (~49k tokens) and a prefer-semantic-
search nudge 880 times (~28k tokens) — about **4.8k tokens per session**, re-stating text that had
not changed, growing with session length.

This kit keeps both hooks and makes each say its piece **once per session**. Same guidance, ~103 and
~60 tokens per session, flat regardless of how long the session runs.

The saving comes from two moves, and the second matters as much as the first:

1. **Claim a per-session marker**, so a hook that has spoken stays quiet.
2. **Move the wording out of `settings.json`** into project-owned text files, so it can be edited,
   reviewed, and trimmed to the delta against what is already always-loaded.

## When to Use

- Hook text is being re-injected every turn and context is filling with repeats.
- Setting up a repo's hooks for the first time and you want the once-per-session shape from the
  start.
- A repo's `settings.json` carries long `additionalContext` strings inline.
- Token usage climbs with session length for no visible reason.

**When NOT to use:** hooks that must act on every fire (formatters, linters, validators). This kit
is for hooks that *say* something, not hooks that *do* something. A prettier-on-write hook must run
every time and is unaffected by any of this.

## Prerequisites

`jq` must be on PATH. Without it every hook no-ops silently — by design, since a hook must never
fail a turn, but it means missing `jq` shows up as guidance that simply never appears:

```sh
command -v jq || echo "install jq first — the hooks will stay silent without it"
```

**Agent support.** The kit is shell scripts, so it installs for folder-based agents only. On
`cursor` this skill arrives as guidance with no scripts; wire the hooks by hand or skip it.

## What ships

```text
kit/state.sh                          # shared marker helper — universal, copy unchanged
kit/dev-flow-reminder.sh              # UserPromptSubmit hook — universal, copy unchanged
kit/prefer-serena.sh                  # PreToolUse hook       — universal, copy unchanged
kit/context/prefer-serena.txt         # READY TO USE — repo-neutral; delete if already always-loaded
kit/context/dev-flow.full.txt.example # PROJECT-SPECIFIC — derived from this repo, on request
```

The three `.sh` files contain no project-specific text. Everything a repo needs to change lives
under `context/`.

## Install

### 1. Copy the kit

```sh
mkdir -p .claude/claude-hooks
cp -R <installed-skill>/kit/. .claude/claude-hooks/
chmod +x .claude/claude-hooks/*.sh
```

`claude-hooks`, not `hooks` — many repos gitignore `.claude/hooks`, which would make the kit vanish
on a fresh clone. Check your own `.gitignore` before choosing a different name.

Re-running this step later refreshes the three scripts. **It must never overwrite `context/`** —
that text is the repo's, not the kit's.

### 2. Context files

Two files, handled differently, because only one of them depends on the repo.

**`prefer-serena.txt` ships ready to use.** Its message — prefer semantic code tools for code
search, raw grep for non-code — does not vary by repository, so there is nothing to author. One
check only: if the repo's always-loaded instruction file *already* says this on every turn, **delete
the file** rather than keep it. Injecting a sentence that is already always-loaded is the exact
duplication this kit exists to remove.

**`dev-flow.full.txt` must be derived from this repo, so ask before writing it.** It ships only as
`dev-flow.full.txt.example`. Producing the real one means reading the repo's instruction file and
writing a file on the user's behalf, so put the question first:

> "Shall I scan `CLAUDE.md` and write `dev-flow.full.txt` as the delta against it — the workflow
> specifics it doesn't already carry? I'll show you the text before saving."

- **They agree** → read the instruction file, draft the delta, show it, write
  `context/dev-flow.full.txt` once they're happy.
- **They decline** → leave the `.example` unrenamed. That hook stays silent, everything else works,
  and they can come back to it.

**Write only the delta.** Delete from the draft every sentence the instruction file already makes.
A worked example of the trap: one repo's first draft was 817 characters, of which ~500 restated the
workflow list and the search-tool mandate that `CLAUDE.md` already carried on every turn. What
survived was what `CLAUDE.md` genuinely omitted — the literal command names, that TDD means
red-green-refactor, and the definition of done. Roughly 300 characters.

**A missing or empty context file means "stay silent".** That is how a repo opts out of one hook
without touching `settings.json`: rename the file to `*.off`, or delete it.

### 3. Wire `settings.json`

Paths use `${CLAUDE_PROJECT_DIR:-.}` so the repo stays relocatable. Note that `UserPromptSubmit`
entries take no `matcher` field, unlike `PreToolUse`.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command",
        "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/claude-hooks/dev-flow-reminder.sh\"" }] }
    ],
    "PreToolUse": [
      { "matcher": "Grep", "hooks": [{ "type": "command",
        "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/claude-hooks/prefer-serena.sh\"" }] },
      { "matcher": "Bash", "hooks": [{ "type": "command",
        "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/claude-hooks/prefer-serena.sh\"" }] }
    ]
  }
}
```

**If the repo already has inline hooks carrying `additionalContext` strings, replace them — do not
append.** Adding these alongside the old ones leaves both firing, which is worse than before you
started. Report every entry you replaced so the swap is reviewable in `git diff`.

## Contract

- **A hook never fails a turn.** Malformed stdin, an unreadable marker directory, a missing context
  file and an absent `jq` all exit 0 with no output.
- **Markers live in `$TMPDIR/cc-hook-state-<uid>/`**, outside the repo, so they never show up in
  `git status` and vanish with the machine's temp sweep. Markers older than 7 days are pruned
  opportunistically, and only on the path that claims a marker — the already-spoken path does no
  filesystem scanning.
- **Session ids are sanitised before becoming paths.** Hook input is machine-generated but it
  becomes a filename, so it is filtered rather than trusted.
- **`prefer-serena.sh` filters its `Bash` arm** to command lines that actually run
  `grep`/`egrep`/`fgrep`/`rg`, so a session that never searches never sees the reminder. The `Grep`
  tool is a text search by definition and is never filtered.

## Per-prompt text — deliberately absent

There is no `context/dev-flow.short.txt` in this kit, and the bar for adding one is high.

An earlier revision injected a 160-character pointer on every prompt after the first. At ~40 tokens
a turn that is ~2k tokens in a 50-prompt session and ~4k in a 100-prompt one — it overtakes the
one-shot full contract after about five prompts. It also re-stated a sentence the root instruction
file already carried always-loaded, which is the same failure this kit exists to fix, only cheaper
per fire.

The capability still works: create `context/dev-flow.short.txt` and it is injected from the second
prompt on. Before you do, it must say something the always-loaded instructions do not, and be worth
~40 tokens on every turn of every session forever.

## Testing a change

Pipe the stdin payload the hook will receive rather than waiting for a real session:

```sh
echo '{"session_id":"t1"}' | .claude/claude-hooks/dev-flow-reminder.sh          # emits
echo '{"session_id":"t1"}' | .claude/claude-hooks/dev-flow-reminder.sh          # silent
echo '{"session_id":"t2","tool_name":"Bash","tool_input":{"command":"grep -rn x ."}}' \
  | .claude/claude-hooks/prefer-serena.sh                                       # emits
echo '{"session_id":"t2","tool_name":"Bash","tool_input":{"command":"pnpm test"}}' \
  | .claude/claude-hooks/prefer-serena.sh                                       # silent
```

Clear the markers between runs:

```sh
find "${TMPDIR:-/tmp}/cc-hook-state-$(id -u)" -type f -delete
```

## Common mistakes

- **Appending these hooks next to existing inline ones.** Both fire. Replace, don't append.
- **Copying the example context text verbatim.** It is placeholder prose, not a default. Text that
  duplicates the always-loaded instruction file is the problem, not the fix.
- **Adding a per-prompt file because it seems cheap.** ~40 tokens a turn is not cheap; read the
  section above.
- **Installing into `.claude/hooks`** when that path is gitignored — the kit disappears on clone.
- **Editing the wording inside the `.sh` files.** They are universal; the text lives in `context/`.
- **Overwriting `context/` when refreshing the scripts.** That text is the repo's.
- **Assuming silence means working.** Without `jq` the hooks are also silent. Check it.
