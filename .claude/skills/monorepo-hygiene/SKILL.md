---
name: monorepo-hygiene
description:
  'Audit an existing Nx + pnpm monorepo against the nx-monorepo workspace skeleton and report what is missing — task
  wiring and caching, commit hygiene, local-dev stack, test and coverage runs, release automation, deployment. Use
  when a repo predates the skeleton, when CI is slower than it should be, when releases are manual, or when onboarding
  a repo someone else set up. Read-only until you approve each change. Covers workspace tooling only; setup-flow owns
  the agent instruction file and .claude/settings.json.'
type: skill
disable-model-invocation: false
user-invocable: true
tags: [monorepo, nx, pnpm, audit, tooling, release, workspace, retrofit]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
author: Aliendreamer
---

# Monorepo Hygiene

## Overview

Retrofits an existing workspace toward the shape the `nx-monorepo` prompt defines. That prompt is
greenfield — it scaffolds a workspace from nothing. This is the other end: a repo already exists,
already works, and the question is what it is missing and whether that matters.

**The skeleton is the reference, and it lives in the prompt.** This skill names what is absent and
points there for the content. It deliberately carries no copy of the skeleton's files: two
descriptions of one shape drift, and the one that drifts is always the copy.

## When to Use

- A repo predates the skeleton and you want to know the gap.
- CI is slower than it should be and caching is the suspect.
- Releases or version bumps are manual.
- Onboarding a workspace someone else set up.

**When NOT to use:** scaffolding a new workspace (use the `nx-monorepo` prompt); configuring the
agent's instruction file or `.claude/settings.json` (that is `setup-flow`); auditing an app's
internals rather than the workspace around them.

## Rules

- **Report first, change nothing.** Complete the audit, present every finding, and write nothing
  until the user agrees. Each proposal names the exact file and the exact edit, so it can be judged
  from the report alone.
- **Read, do not run.** Determine what a repo has by reading its configuration, not by executing
  it. No builds, no test suites, no bringing up container stacks, no deploy commands — those have
  side effects, and in an unfamiliar repo a "just check it works" can be slow or destructive. When
  confirming a finding would require running something, say what you could not verify and leave it
  to the user.
- **A difference is not a defect.** A repo that configures a tool differently has made a choice.
  Report the divergence and preserve what is there. Only propose *adding* what is absent.
- **Preserve hand edits.** If a file you would write has local modifications, say so and leave them
  alone unless the user asks for a replacement.
- **Every finding carries a verdict**, with one line of reasoning. If the repo does not give you
  enough signal to judge, say that explicitly — silence and a guess are both worse.

## The six areas

Audit in this order; each is independent, so a repo can adopt one and skip the rest.

### 1. Task wiring

- Is there an Nx workspace at all, and a pnpm workspace file?
- Are `build`, `test`, `lint` cached in `targetDefaults`? Does `build` depend on `^build`?
- **Is there a language-specific named input?** The highest-value finding in this area: without one,
  a change to any file in a project invalidates that project's cache. In a mixed .NET/JS repo that
  means every JS commit rebuilds the backend.
- Is `packageManager` pinned, with a hash?
- Do the apps expose a consistent target set, or does each invent its own names?

### 2. Commit hygiene

- Is there a `commit-msg` hook running commitlint, and is the config conventional?
- Is there a `pre-commit` hook running `lint-staged`?
- **Does `lint-staged` run with `--no-stash`?** Without it, a hook failing mid-run can lose unstaged
  work.
- Are formatting and spelling configured at the root, or only per-app?
- If release automation derives versions from commits, commit hygiene is **load-bearing**, not
  cosmetic — say so when both are present, and flag it hard when release automation exists without
  it.

### 3. Local development

- Is there a one-command way to bring the system up?
- Does it cover the real dependencies — database, cache, identity provider — or only the apps?
- Is the identity provider's issuer URL resolvable **identically inside containers and from the
  browser**? A mismatch shows up as a broken login, not as a DNS error, so it is worth reading the
  config for rather than waiting to hit it.
- Is the runner container-runtime agnostic, or does it hardcode one?

### 4. Test and coverage

- Is there one command that runs every test across every language?
- Is there a combined coverage report, or one per language that nobody aggregates?
- Are E2E tests wired to the local stack, or do they assume something already running?
- Is coverage gated anywhere, or only measured?

### 5. Release

- Are versions bumped by hand?
- If `nx release` is configured: independent or fixed projects? Conventional commits?
  Per-project changelogs or one workspace changelog?
- **A non-JS project needs a version-actions shim** to participate — Nx versions JS from
  `package.json`, and a .NET project's version lives in MSBuild. If such a project is in the release
  groups without a shim, the release is silently incomplete.
- Are tags patterned so a project's releases are distinguishable?

### 6. Deployment

- Is there a repeatable image build, and is its tag **immutable and traceable to a commit**? A
  `:latest` tag is the finding here.
- Do credentials come from the environment, or from a file path outside the repo?
- Is there a documented contract between "image pushed" and "image running", even if the mechanism
  itself is not in this repo?

## Reporting

Group findings by area. Per finding: what is missing or divergent, the verdict, one line of
reasoning, and — for anything you propose changing — the exact file and edit.

```text
### 1. Task wiring

  ✗ No `dotnet` named input          ADD    every JS commit invalidates the backend's cache
  ✓ build/test/lint cached
  ~ `build` has no `^build` depends  ADD    cross-project builds may race
  ? packageManager unpinned          ASK    intentional, or an oversight?
```

Close with a count and the one change you would make first if only one were possible.

## Common mistakes

- **Running the repo's tooling to find out what it has.** Read the config.
- **Treating a divergence as a defect.** The repo may be right and the skeleton wrong for it.
- **Copying the skeleton's content into the report.** Name the gap, link the skeleton.
- **Applying changes before the report is accepted.** The report *is* the deliverable; the edits
  are optional.
- **Listing findings with no verdict.** An unranked list of twelve gaps is not an audit.
- **Overwriting a hand-edited file** because it does not match the skeleton.
- **Straying into `setup-flow`'s files.** `.claude/settings.json` and the agent instruction file are
  not this skill's.
