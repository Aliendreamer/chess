#!/usr/bin/env bash
# One-shot code-coverage report for both apps.
#
#   tools/coverage-report.sh
#
# Frontend: vitest v8 (runs anywhere). Backend: unit + integration merged via ReportGenerator —
# the integration tests use Testcontainers, so a Docker daemon must be running.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "======================================================================"
echo " Frontend coverage (vitest v8)"
echo "======================================================================"
pnpm -C apps/frontend run test:coverage

echo ""
echo "======================================================================"
echo " Backend coverage — unit + integration, merged (needs Docker running)"
echo "======================================================================"
pnpm exec nx coverage backend
