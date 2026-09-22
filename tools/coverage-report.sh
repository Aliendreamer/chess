#!/usr/bin/env bash
# One-shot code-coverage report for both apps.
#
#   tools/coverage-report.sh
#
# Frontend: vitest v8 (runs anywhere). Backend: the unit suite with its line gate
# (COVERAGE_THRESHOLD, default 75). The integration suite is NOT merged in — it runs the app against
# Testcontainers to prove the spine end to end, which is what the excluded startup glue relies on;
# run it separately with `pnpm exec nx integration-test backend` (needs Docker).
set -uo pipefail
cd "$(dirname "$0")/.."

echo "======================================================================"
echo " Frontend coverage (vitest v8)"
echo "======================================================================"
pnpm -C apps/frontend run test:coverage

echo ""
echo "======================================================================"
echo " Backend coverage — unit suite + line gate"
echo "======================================================================"
apps/backend/build_test.sh
