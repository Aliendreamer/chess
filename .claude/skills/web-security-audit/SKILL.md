---
name: web-security-audit
description:
  "Use when reviewing a change, PR, or repo for application security regressions before committing or merging —
  especially after touching auth, cookies, CORS, OIDC, endpoints, secrets/.env, dependencies, or reverse-proxy/compose.
  Built for BFF cookie-session apps (.NET + TanStack + Keycloak behind a proxy) but the checks generalize. For the
  Claude Code agent config itself (settings.json permissions/sandbox/hooks), use llm-setup-audit instead."
type: skill
disable-model-invocation: false
user-invocable: true
tags: [security, audit, web, dotnet]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
---

# Security Audit (application / repo)

## Overview

A fixed set of checks for known security-regression classes in the **application and its deployment**. Run each from the
repo root, report **PASS** or **FLAG** per check, and investigate every FLAG. The goal is to catch mistakes that are
easy to reintroduce in a single edit (a wildcard CORS, a token in `localStorage`, a committed `.env`, an unsanitized
redirect).

This skill audits the **code and infra you ship**. To audit the **agent's own setup** (`.claude/settings.json` — Bash
permissions, sandbox, hooks), use **llm-setup-audit**.

## When to use

- Before committing/merging changes to auth, cookies, CORS, OIDC, endpoints, secrets, or compose.
- As a periodic whole-repo sweep.
- When an automated commit-review flags something and you want the full application picture.

## Checks

Run from repo root. Each line is the command, then what PASS vs FLAG looks like.

### 1. CORS is never `*` with credentials

```bash
# source only (avoid bin/obj artifacts), CORS-specific patterns:
grep -rn --include='*.cs' -E 'AllowAnyOrigin\(|SetIsOriginAllowed|WithOrigins\("\*"\)' apps/core-api   # PASS: no matches
grep -rn --include='*.cs' 'AllowCredentials' apps/core-api    # must pair with WithOrigins(<explicit>)
```

FLAG: `AllowAnyOrigin()`, `SetIsOriginAllowed(_ => true)`, or `WithOrigins("*")` — especially together with
`AllowCredentials()` (browser rejects it, and it's an exfiltration footgun).

### 2. Session cookies are hardened

```bash
grep -rnE 'HttpOnly|SameSite|Secure|Domain' apps/core-api/Auth/AuthCookies.cs
```

PASS: `HttpOnly = true`, `SameSite` set (`Lax`/`Strict`), `Secure` outside Development, `Domain` scoped. FLAG: any auth
cookie missing `HttpOnly`, or `Secure=false` in production.

### 3. Tokens stay server-side (BFF invariant)

```bash
grep -rnE 'localStorage|sessionStorage|Authorization|access_token|Bearer' apps/web/src   # PASS: none
grep -rn 'TokenHash|HashToken' apps/core-api/Auth                                         # cookie stores a HASH, not the raw/JWT
```

FLAG: any access/refresh token in the browser (localStorage, JS-readable cookie, `Authorization` header from the SPA),
or a raw token persisted instead of its hash.

### 4. OIDC has PKCE + state + sanitized returnTo

```bash
grep -rnE 'code_challenge|S256|SanitizeReturnTo|Nonce' apps/core-api/Auth
```

PASS: PKCE `S256`, the callback verifies the `state` nonce against the PKCE cookie, and `returnTo` is reduced to a
single-slash relative path. FLAG: missing state/nonce check (CSRF) or an unsanitized redirect target (open redirect).

### 5. Endpoints are behind auth

```bash
grep -rn --include='*.cs' 'AllowAnonymous' apps/core-api plugins libs                     # only auth endpoints + health
```

FLAG: data/plugin endpoints marked `AllowAnonymous`, or a default-allow auth policy.

### 6. No secrets committed

```bash
git ls-files | grep -E '(^|/)\.env$'        # PASS: empty (real .env is gitignored)
git check-ignore .env                        # PASS: prints .env
git grep -nIE '(password|secret|api[_-]?key|token)[[:space:]]*[:=]'   # review each hit
```

FLAG: a tracked `.env`, or a real credential in source. Dev/harness placeholders (`Test123!`, `dev-secret`, default
Postgres password) in clearly-local harness files are acceptable — confirm they're not reused as production values.

### 7. Build & supply-chain hardening

```bash
grep -n 'TreatWarningsAsErrors' Directory.Build.props     # PASS: true (CA security analyzers fail the build)
ls pnpm-lock.yaml                                         # PASS: lockfile present + committed
```

### 8. Reverse proxy / exposure

```bash
grep -nE '^\s+ports:' docker-compose.yml     # PASS: only the reverse proxy maps a host port
grep -rn 'RequireHttpsMetadata' apps/core-api # derived from the Authority scheme, not blindly true/false
```

FLAG: an internal service (db, keycloak, api) publishing a host port directly; or `RequireHttpsMetadata=false` for an
`https` authority.

## Report format

List each check `1–8` as **PASS** / **FLAG**, with the offending file:line for any FLAG and a one-line fix. Don't claim
PASS for a check you didn't run.

## Common mistakes

| Mistake                                             | Why it's wrong                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| "It's internal-only, so SSRF/CORS don't matter"     | Internal services are common SSRF/IDOR targets; audit them too          |
| Storing the access token to "make the SPA simpler"  | Breaks the BFF invariant — tokens must never reach JS                   |
| Treating dev placeholder secrets as fine everywhere | Fine in local harness files; never reuse them as real prod values       |
| Publishing a db/keycloak port "just for debugging"  | Widens the attack surface; route through the proxy or use `docker exec` |
