---
name: audit-package-version
description: "Audit dependency manifests for non-exact versions — flag ^, ~, ranges, wildcards, and 'latest'; require exact pins (e.g. 9.17.0, not ^9.17.0). Covers npm (package.json) and .NET (.csproj)."
type: skill
disable-model-invocation: false
user-invocable: true
tags: [dependencies, versioning, quality, audit, npm, dotnet]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
author: Aliendreamer
---

# Audit Package Versions (exact pins only)

## Overview

Enforce **exact** dependency versions everywhere: `9.17.0`, never `^9.17.0`, `~9.17.0`,
`>=9.17.0`, `9.*`, or `latest`. Exact pins make installs reproducible and remove silent
minor/patch drift. Run each check from the repo root, report **PASS** or **FLAG** per check, and
fix every FLAG.

**Input**: the manifests to audit. If omitted, audit every `package.json` and `*.csproj` in the
repo (excluding `node_modules`).

## When to use

- After adding or bumping any dependency (mandatory quality gate).
- Before committing changes to `package.json`, `*.csproj`, or lockfiles.
- When reviewing a PR that touches dependencies.

## Checks

### 1. npm — no range specifiers in package.json

Every value under `dependencies`, `devDependencies`, `peerDependencies`, and
`optionalDependencies` must be a single exact version. **FLAG** any `^`, `~`, `>`, `<`, `>=`,
`<=`, `||`, an `x`/`*` wildcard, a hyphen range, or a `latest`/`next` dist-tag. The `workspace:`
and `catalog:` protocols are allowed (they are not version ranges).

```sh
# FLAG: a caret/tilde/range/wildcard at the start of any version value
grep -rnoE '"[^"]+":[[:space:]]*"[\^~><*]' --include=package.json . | grep -v node_modules
```

PASS when every value reads like `"react": "19.2.7"`.

### 2. npm — pin new installs by default

`.npmrc` should set `save-exact=true` (and an empty `save-prefix=`) so `npm install <pkg>` writes
an exact version instead of a caret range.

```sh
grep -q '^save-exact=true' .npmrc && echo PASS || echo "FLAG: add save-exact=true to .npmrc"
```

### 3. .NET — no floating PackageReference versions

Every `<PackageReference>` must use an exact `Version`. **FLAG** floating notations: a `*` wildcard
(`9.*`, `9.0.*`), a version range bracket (`[9.0,)`, `(,10.0)`), or a missing `Version` attribute.

```sh
grep -rnoE 'PackageReference[^>]*Version="[^"]*[*,()[]][^"]*"' --include=*.csproj .
```

PASS when every reference reads like `Version="9.17.0"`.

### 4. .NET — central package versions are also exact

If central package management is used (`Directory.Packages.props`), every `<PackageVersion>` must
be exact too — the same rule as check 3.

```sh
grep -rnoE 'PackageVersion[^>]*Version="[^"]*[*,()[]][^"]*"' --include=Directory.Packages.props .
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| `"eslint": "^9.17.0"` | `"eslint": "9.17.0"` |
| `"typescript": "~5.7.2"` | `"typescript": "5.7.2"` |
| `npm install x` adds a caret | set `save-exact=true` in `.npmrc` |
| `Version="9.*"` in a `.csproj` | `Version="9.17.0"` |
| Flagging `workspace:*` | allowed — workspace/catalog protocols are not version ranges |
