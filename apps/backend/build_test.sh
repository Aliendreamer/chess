#!/usr/bin/env bash
# Run the unit tests with coverage and enforce the line-coverage gate (default 90%).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
THRESHOLD="${COVERAGE_THRESHOLD:-90}"
RESULTS="Chess.Backend.Tests/TestResults"
rm -rf "$RESULTS"

dotnet test Chess.Backend.Tests/Chess.Backend.Tests.csproj \
  --collect:"XPlat Code Coverage" --settings coverage.runsettings --results-directory "$RESULTS" "$@"

REPORT="$(find "$RESULTS" -name 'coverage.cobertura.xml' | head -n1)"
[ -n "$REPORT" ] || { echo "coverage report not found under $RESULTS" >&2; exit 1; }
RATE="$(grep -o '<coverage [^>]*line-rate="[0-9.]*"' "$REPORT" | head -n1 | sed -E 's/.*line-rate="([0-9.]+)".*/\1/')"
PCT="$(awk -v r="$RATE" 'BEGIN { printf "%.1f", r * 100 }')"
echo "Line coverage: ${PCT}% (gate ${THRESHOLD}%)"
awk -v p="$PCT" -v t="$THRESHOLD" 'BEGIN { exit (p + 0 >= t + 0) ? 0 : 1 }' \
  || { echo "coverage ${PCT}% is below the ${THRESHOLD}% gate" >&2; exit 1; }
