#!/usr/bin/env bash
# Run the full test suite across both apps.
#
#   tools/test-all.sh              # unit + lint + backend integration + frontend E2E
#   tools/test-all.sh --no-e2e     # skip the browser E2E (still runs unit + backend integration)
#   tools/test-all.sh --personal   # use the personal stack for E2E (reuses PCC's Traefik)
#
# Layers:
#   - unit + lint      → fast, Docker-free (frontend vitest, backend xUnit InMemory)
#   - integration      → backend Testcontainers (needs Docker)
#   - e2e              → frontend Playwright against the live stack (needs Docker + the stack up)
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_E2E=1
E2E_FLAG=""
for a in "$@"; do
  [[ "$a" == "--no-e2e" ]] && RUN_E2E=0
  [[ "$a" == "--personal" ]] && E2E_FLAG="--personal"
done

echo "==> Unit + lint (fast, Docker-free)…"
pnpm exec nx run-many -t test lint --projects=frontend,backend

echo "==> Backend integration (Testcontainers — needs Docker)…"
pnpm exec nx integration-test backend

if [[ "$RUN_E2E" == "1" ]]; then
  echo "==> Frontend E2E (Playwright — brings the stack up if needed)…"
  # shellcheck disable=SC2086
  tools/e2e.sh $E2E_FLAG
else
  echo "==> Skipping E2E (--no-e2e)."
fi

echo "==> All requested test layers passed."
