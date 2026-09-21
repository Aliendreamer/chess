#!/usr/bin/env bash
# One-shot Playwright E2E: bring the local-dev stack up, install deps + browsers, wait for the app,
# then run the suite against it.
#
#   tools/e2e.sh                 # standalone stack up + install + test
#   tools/e2e.sh --no-up         # assume the stack is already running (skip bringing it up)
#   tools/e2e.sh -- --headed     # pass everything after `--` straight to `playwright test`
#
# Override the target with E2E_BASE_URL (default http://app.chess.localhost).
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${E2E_BASE_URL:-http://app.chess.localhost}"
UP=1
STACK="tools/localdev/stack.sh"
PW_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-up) UP=0; shift ;;
    --) shift; PW_ARGS=("$@"); break ;;
    *) PW_ARGS+=("$1"); shift ;;
  esac
done

# Export so Playwright's config (process.env.E2E_BASE_URL) targets the same host we wait on.
export E2E_BASE_URL="$BASE_URL"

if [[ "$UP" == "1" ]]; then
  echo "==> Bringing the local-dev stack up (${STACK})…"
  "$STACK" up
fi

echo "==> Installing workspace deps…"
pnpm install

echo "==> Installing Playwright browsers (chromium)…"
pnpm -C apps/frontend exec playwright install --with-deps chromium

echo "==> Waiting for the app at ${BASE_URL} to serve through the backend (cold start compiles + migrates)…"
# Traefik answering isn't enough: on a cold `dotnet watch` start the SSR renders a 200 "fetch failed"
# error page until the backend binds :8080. Anonymous `/` 302s to the login only once the SSR's
# server-to-server call to the backend succeeds — so wait for that redirect, not just any response.
msg="no response yet"
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/" || echo 000)
  case "$code" in
    3??) echo "    app + backend ready (login redirect, HTTP ${code})."; break ;;
    200) msg="app up but backend not ready (SSR error page, HTTP 200)" ;;
    000) msg="app host not answering yet" ;;
    *)   msg="app returned HTTP ${code}" ;;
  esac
  if [[ "$i" -eq 120 ]]; then
    echo "    timed out: ${msg}" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Running Playwright E2E…"
pnpm -C apps/frontend exec playwright test "${PW_ARGS[@]}"
