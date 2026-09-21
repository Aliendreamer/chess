#!/usr/bin/env bash
# Run the full test suite across both apps.
#
#   tools/test-all.sh              # unit + lint + backend integration + frontend E2E
#   tools/test-all.sh --no-e2e     # skip the browser E2E (still runs unit + backend integration)
#
# Layers:
#   - unit + lint      → fast, Docker-free (frontend vitest, backend xUnit InMemory)
#   - integration      → backend Testcontainers (needs Docker)
#   - e2e              → frontend Playwright against the live stack (needs Docker + the stack up)
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_E2E=1
for a in "$@"; do
  [[ "$a" == "--no-e2e" ]] && RUN_E2E=0
done

echo "==> Unit + lint (fast, Docker-free)…"
pnpm exec nx run-many -t test lint --projects=frontend,backend

if pnpm exec nx show project backend --json | jq -e '.targets["integration-test"]' >/dev/null 2>&1; then
  echo "==> Backend integration (Testcontainers — needs Docker)…"
  pnpm exec nx integration-test backend
else
  echo "==> No backend integration-test target yet; skipping."
fi

if [[ "$RUN_E2E" == "1" ]]; then
  echo "==> Frontend E2E (Playwright — brings the stack up if needed)…"
  tools/e2e.sh
else
  echo "==> Skipping E2E (--no-e2e)."
fi

echo "==> All requested test layers passed."
