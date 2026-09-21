---
name: md-files-audit
description: "Use when auditing markdown files for formatting and style compliance — after adding or editing
  .md files, when a lint gate fails, or when setting up markdownlint-cli2 in a new repo. Covers config setup,
  key rule explanations, running the linter, auto-fix, and per-violation guidance."
type: skill
disable-model-invocation: false
user-invocable: true
tags: [quality, audit, markdown, linting, documentation]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
---

# Markdown Files Audit

## Overview

Run `markdownlint-cli2` over authored `.md` files, report **PASS** or **FLAG** per check, and fix
every FLAG. The goal is consistent, readable markdown that passes automated gates without manual
cleanup.

## When to use

- After adding or editing any `.md` file (skills, prompts, specs, READMEs).
- When the `lint:md` gate fails in CI or as a pre-commit hook.
- When setting up markdownlint in a new repo.
- Before committing documentation changes.

## Setup

### 1. Install

```sh
pnpm add -D markdownlint-cli2
# or
npm install --save-dev markdownlint-cli2
```

### 2. Add scripts to `package.json`

```json
{
  "scripts": {
    "lint:md": "markdownlint-cli2",
    "lint:md:fix": "markdownlint-cli2 --fix"
  }
}
```

### 3. Create `.markdownlint-cli2.jsonc`

Recommended baseline (all rules on, line-length relaxed to 120, code blocks and tables exempt):

```jsonc
{
  // MD013: line length — 120 cols; code blocks and tables are unwrappable, so exempt them.
  "config": {
    "default": true,
    "MD013": {
      "line_length": 120,
      "code_blocks": false,
      "tables": false
    }
  },
  // Scope to authored content only.
  "globs": [
    "skills/**/*.md",
    "prompts/**/*.md",
    "CLAUDE.md",
    "README.md"
  ],
  "ignores": [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    ".claude/**"
  ]
}
```

`default: true` enables all rules. Only override rules that genuinely need to differ.

## Run the audit

```sh
pnpm lint:md            # report all violations
pnpm lint:md:fix        # auto-fix safe violations
```

**Safe to auto-fix** (markdownlint applies these without changing meaning):

- MD009 trailing spaces
- MD010 hard tabs
- MD012 multiple blank lines
- MD022 / MD031 / MD032 blank lines around headings, code blocks, lists
- MD029 ordered list numbering

**Must fix manually**: MD013 (line too long — wrap or rewrite), MD040 (add language to code fence),
MD041 (add `# H1` as first line).

## Checks

Run from repo root. Report **PASS** or **FLAG** per rule. Investigate every FLAG.

### 1. Run the linter

```sh
pnpm lint:md
```

PASS: `Summary: 0 error(s)`. FLAG: any reported violation — see rule table below.

### 2. Auto-fix safe violations

```sh
pnpm lint:md:fix && pnpm lint:md
```

PASS: zero errors after fix. FLAG: remaining violations that need manual attention.

## Key rules

| Rule | What it checks | Common cause |
| ---- | -------------- | ------------ |
| MD001 | Heading levels increment by 1 | Skipping `#` → `###` |
| MD003 | Consistent heading style (ATX `##`) | Mixing `===` underline style |
| MD009 | No trailing spaces | Editor not stripping on save |
| MD010 | No hard tabs | Copy-pasted content |
| MD012 | No multiple consecutive blank lines | Extra whitespace in draft |
| MD013 | Line ≤ 120 chars (code + tables exempt) | Long prose paragraphs |
| MD022 | Blank lines before and after headings | Dense content, no spacing |
| MD024 | No duplicate heading text in same file | Two `## Overview` sections |
| MD025 | Only one H1 per file | Multiple `# Title` lines |
| MD031 | Blank lines around fenced code blocks | Code inside a list, no surrounding blanks |
| MD032 | Blank lines around list blocks | List immediately after paragraph |
| MD040 | Fenced code blocks have a language | ` ``` ` without `sh`, `json`, etc. |
| MD041 | First line is a top-level H1 | File starts with prose or frontmatter body |

## Common violations

### MD031 — missing blank line around fenced code block (inside a list)

The code fence must be preceded and followed by blank lines, even when nested inside a list item.

Fix: add a blank line between the list item text and the opening fence, and between the closing
fence and the next list item.

```sh
# Before (FLAG): no blank line between item text and the opening fence
# After (PASS):  blank line before the opening fence and after the closing fence
```

### MD040 — missing language on code fence

Every fenced code block must declare a language after the opening backticks.

Fix: add `sh`, `json`, `ts`, `jsonc`, `text`, etc. immediately after the opening backticks.

```sh
# FLAG:  ```           (no language)
# PASS:  ```sh         (language declared)
```

### MD013 — line too long

Split long prose sentences at a natural break point. Tables and code blocks are exempt — do not
wrap them.

### MD041 — first line not an H1

Files with YAML frontmatter (`---` block) must have `# Heading` as the first line of body content,
immediately after the closing `---`.

## Disable a rule inline (use sparingly)

```markdown
<!-- markdownlint-disable MD013 -->
This line cannot be wrapped for technical reasons.
<!-- markdownlint-enable MD013 -->
```

Prefer fixing the content. Use inline disable only when a rule genuinely cannot be satisfied
(e.g. a long URL that must stay on one line).

## Report format

List the result as **PASS** / **FLAG** for each check. For every FLAG include file path, line
number, and rule ID. Do not claim PASS for any check you did not run.

## Common mistakes

| Mistake | Fix |
| ------- | --- |
| Running auto-fix without re-checking after | Always run `pnpm lint:md` after `--fix` to confirm zero errors |
| Suppressing MD013 for short lines | Only suppress when a line genuinely cannot be wrapped |
| Forgetting to add a language to code fences | Use `sh`, `json`, `ts`, `markdown`, `jsonc`, etc. |
| Globbing `node_modules/` | Add to `ignores` in the config |
| Editing the generated config comment | The comment is informational; `markdownlint-cli2` ignores JSON comments |
