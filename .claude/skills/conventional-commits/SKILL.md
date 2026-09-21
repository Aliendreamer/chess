---
name: conventional-commits
description:
  Write commit messages that follow the Conventional Commits specification so tooling can derive versions and
  changelogs.
type: skill
disable-model-invocation: false
user-invocable: true
tags: [git, commits, conventions]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
---

# Conventional Commits

Use Conventional Commits so release tooling can compute semver bumps and changelogs.

## Format

```text
<type>(<optional scope>): <description>

<optional body>

<optional footer(s)>
```

## Types

- `feat:` a new feature → minor bump
- `fix:` a bug fix → patch bump
- `docs:` documentation only
- `refactor:` neither a fix nor a feature
- `test:` adding or fixing tests
- `chore:` build, tooling, deps
- `perf:` a performance improvement

## Breaking changes

Add `!` after the type/scope or a `BREAKING CHANGE:` footer → major bump.

```text
feat(api)!: drop support for legacy auth header
```

## Rules

- One logical change per commit.
- Imperative, present tense: "add", not "added".
- Keep the description under ~72 characters; put detail in the body.
