#!/usr/bin/env bash
# Instrumented end-to-end coverage: build a production coverage stack (SSR BFF instrumented with istanbul
# via the custom vite plugin, backend under dotnet-coverage), drive it with the Playwright suite, then
# flush + report line coverage from both.
#
#   tools/e2e-coverage.sh              # full run: build → up → e2e → collect → report → down
#   tools/e2e-coverage.sh --keep-up    # leave the stack running (skip the final `down`)
#
# First-cut instrumentation — expect to iterate on the sourcemap mapping (SSR) and the flush timing.
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP_UP=0
for a in "$@"; do
  case "$a" in
    --keep-up) KEEP_UP=1 ;;
  esac
done

COVDIR="tools/localdev/coverage-e2e"
COMPOSE=(docker compose -f tools/localdev/docker-compose.coverage.yml)
BASE_URL="http://app.chess.localhost"
BE_SVC=backend
FE_SVC=frontend
export E2E_BASE_URL="$BASE_URL"

# Fresh output dirs. The in-container collectors write as root via the bind mounts, so a prior run's
# files are root-owned and a host rm can't remove them — wipe with a throwaway root container. The
# dirs are world-writable so the collectors can write in.
mkdir -p "$COVDIR/ssr" "$COVDIR/backend"
docker run --rm -v "$PWD/$COVDIR:/wipe" alpine:3 sh -c 'rm -rf /wipe/ssr/* /wipe/backend/* /wipe/ssr/tmp 2>/dev/null || true'
chmod -R 777 "$COVDIR" 2>/dev/null || true

echo "==> Building the SSR .output on the host (COVERAGE=1 → sourcemaps; the frontend image bind-mounts it)…"
# routeTree.gen.ts is committed + current; skip `generate-routes` (its .tanstack/tmp write can EACCES).
COVERAGE=1 pnpm --filter chess-frontend build

echo "==> Building the coverage images sequentially (serial avoids flaky-network contention)…"
"${COMPOSE[@]}" build "$BE_SVC"
"${COMPOSE[@]}" build "$FE_SVC"
echo "==> Starting the coverage stack…"
"${COMPOSE[@]}" up -d

echo "==> Waiting for the app to serve through the backend (cold start: build + migrate)…"
for i in $(seq 1 150); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/" || echo 000)
  case "$code" in
    3??) echo "    ready (login redirect, HTTP ${code})."; break ;;
  esac
  if [[ "$i" -eq 150 ]]; then
    echo "    timed out (last HTTP ${code}). Recent logs:" >&2
    "${COMPOSE[@]}" logs --tail 40 frontend backend >&2
    "${COMPOSE[@]}" down
    exit 1
  fi
  sleep 2
done

echo "==> Installing Playwright browsers…"
pnpm -C apps/frontend exec playwright install --with-deps chromium

echo "==> Running the E2E suite (instrumented)…"
# The Playwright fixture harvests each test's client-side window.__coverage__ into this dir — the SAME
# dir the SSR server dumps into — so nyc merges client + server into one report (both key coverage by the
# identical host src paths, since both bundles were instrumented from the same build).
export CLIENT_COVERAGE_DIR="$PWD/$COVDIR/ssr/out"
mkdir -p "$CLIENT_COVERAGE_DIR"
# Cap workers: the backend runs under dotnet-coverage (slower), so fewer concurrent loaders avoids the
# transient 500s that otherwise flake the create-heavy specs. Keep going even if a spec fails — we still
# want whatever coverage was exercised.
export PW_WORKERS="${PW_WORKERS:-4}"
pnpm -C apps/frontend exec playwright test || echo "    (some specs failed — collecting coverage anyway)"

echo "==> Flushing the collectors — SSR flushes on SIGINT (the node preload dumps __coverage__); the backend"
echo "    collector is finalized via its named session's shutdown command run inside the container…"
"${COMPOSE[@]}" kill -s SIGINT "$FE_SVC" 2>/dev/null || true
# `dotnet-coverage shutdown <session>` stops the collect session, writes the cobertura, and exits the
# server — the documented reliable path for a long-running server (signals to the collector don't flush).
"${COMPOSE[@]}" exec -T "$BE_SVC" dotnet-coverage shutdown ccbackend 2>/dev/null || true
# Wait for BOTH artifacts before stopping. dotnet-coverage takes several seconds post-signal to finalize
# and write its report; the previous code waited only for the SSR dump, so the follow-up `stop` (SIGKILL
# after the grace period) truncated dotnet-coverage mid-write — that's why the cobertura was never there.
echo "    waiting up to 90s for both coverage artifacts to land…"
for _ in $(seq 1 90); do
  ssr_ready=0
  be_ready=0
  [[ -n "$(ls "$COVDIR/ssr/out"/*.json 2>/dev/null)" ]] && ssr_ready=1
  [[ -s "$COVDIR/backend/backend.cobertura.xml" ]] && be_ready=1
  [[ "$ssr_ready" == 1 && "$be_ready" == 1 ]] && break
  sleep 1
done
"${COMPOSE[@]}" stop "$FE_SVC" "$BE_SVC" >/dev/null 2>&1 || true

echo
echo "================= Frontend (client + SSR BFF) E2E coverage ================="
SSR_OUT="$PWD/$COVDIR/ssr/out"
SSR_REPORT="$PWD/$COVDIR/ssr"
if [[ -n "$(ls "$SSR_OUT"/*.json 2>/dev/null)" ]]; then
  # istanbul dumps → nyc report on the host (the source paths in __coverage__ resolve here).
  pnpm -C apps/frontend exec nyc report --temp-dir "$SSR_OUT" --report-dir "$SSR_REPORT" \
    --reporter=json-summary --reporter=lcovonly --reporter=text-summary 2>&1 | sed 's/^/  /' | tail -20 || true
else
  echo "  (no istanbul dumps in $SSR_OUT — the SSR preload didn't write __coverage__. Check the build"
  echo "   was COVERAGE=1 (istanbul active) and the SSR exited cleanly: ${COMPOSE[*]} logs $FE_SVC)"
fi

echo
echo "===================== Backend E2E coverage ================================"
BE="$COVDIR/backend/backend.cobertura.xml"
if [[ -f "$BE" ]]; then
  rate=$(grep -oE 'line-rate="[0-9.]+"' "$BE" | head -1 | grep -oE '[0-9.]+' || echo "")
  [[ -n "$rate" ]] && awk -v r="$rate" 'BEGIN{ printf "  lines %.1f%%\n", r*100 }' || echo "  (cobertura found but no line-rate parsed — see $BE)"
else
  echo "  (no $BE — dotnet-coverage didn't flush. Check: ${COMPOSE[*]} logs backend)"
fi

echo
echo "Full reports: $COVDIR/ssr/lcov.info , $BE"
if [[ "$KEEP_UP" == "0" ]]; then
  echo "==> Tearing down…"
  "${COMPOSE[@]}" down
else
  echo "==> Leaving the stack up (--keep-up)."
fi
