#!/usr/bin/env bash
# Prove the spine: login → POST ping (actor) → GET live (actor) → GET list (replica, projected) → hub
# negotiate gated; with --cluster: stop backend-1 and the same ping keeps its count on backend-2.
#
#   tools/localdev/verify-part0.sh              # single-node checks
#   tools/localdev/verify-part0.sh --cluster    # also proves Akka failover to backend-2
#                                                # (requires the stack started with --profile cluster)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
compose() { docker compose -f docker-compose.yml "$@"; }
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
CLUSTER=0; [[ "${1:-}" == "--cluster" ]] && CLUSTER=1
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# Exact match on the count field, not a substring: `"count":1` alone would also match 10, 19, ...
# Prefer jq (exact numeric compare) when it's on PATH; otherwise anchor the grep on the terminator
# that always follows a JSON number (`,` mid-object or `}` at the end).
HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1
count_is_1() {
  if [[ "$HAVE_JQ" == "1" ]]; then
    jq -e '.count == 1' >/dev/null 2>&1
  else
    grep -qE '"count":1[,}]'
  fi
}

step "login (reusing verify-auth's flow) and capture mp_sid"
# A bare `SID="$(... | tail -n1)"` would let `set -e` kill the script on login failure right here,
# before the emptiness check below ever runs — and with verify-auth's own diagnostics thrown away.
# Guard the assignment in an `if` (errexit does not fire on a command tested by `if`) so a failure
# is caught, verify-auth's stderr (its `FAIL:` line and context) is surfaced, and the script still
# dies loudly via `fail`.
LOGIN_ERR="$(mktemp)"
if SID="$(SID_ONLY=1 ./verify-auth.sh 2>"$LOGIN_ERR" | tail -n1)"; then
  rm -f "$LOGIN_ERR"
else
  cat "$LOGIN_ERR" >&2
  rm -f "$LOGIN_ERR"
  fail "login failed (SID_ONLY run of verify-auth.sh) — see diagnostics above"
fi
[[ -n "$SID" ]] || fail "could not obtain a session; run verify-auth.sh to see why"
api() { curl -sS --resolve "$API_HOST:80:$EDGE_IP" -H "Cookie: mp_sid=$SID" "$@"; }

# $RANDOM keeps two runs in the same second from colliding on one id (both still match
# ^[a-z0-9-]{1,64}$, the backend's id validation).
ID="p-$(date +%s)-$RANDOM"
step "POST /api/pings/$ID → actor state count=1"
body="$(api -X POST -H 'content-type: application/json' -d '{"text":"hello"}' "http://$API_HOST/api/pings/$ID")"
count_is_1 <<<"$body" || fail "unexpected: $body"
echo "ok"

step "GET /api/pings/$ID/live → count=1 (actor)"
api "http://$API_HOST/api/pings/$ID/live" | count_is_1 || fail "live read wrong"
echo "ok"

step "GET /api/pings → row for $ID (replica via projection) within 5s"
for i in $(seq 1 20); do
  if api "http://$API_HOST/api/pings?limit=200" | grep -q "\"pingId\":\"$ID\""; then echo "ok (~$((i*250))ms)"; break; fi
  [[ "$i" -eq 20 ]] && fail "projection did not reach the replica"
  sleep 0.25
done

step "rm_pings on the replica matches"
[[ "$(compose exec -T postgres-replica psql -U chess -d chess -tA -c "select \"Count\" from rm_pings where \"PingId\"='$ID'")" == "1" ]] || fail "replica row mismatch"
echo "ok"

step "hub negotiate is gated"
[[ "$(curl -sS --resolve "$API_HOST:80:$EDGE_IP" -o /dev/null -w '%{http_code}' -X POST "http://$API_HOST/hub/pings/negotiate?negotiateVersion=1")" == "401" ]] || fail "hub not gated"
echo "ok"

if [[ "$CLUSTER" == "1" ]]; then
  step "cluster: stop backend-1, $ID must answer from backend-2 with count=1"
  # SIGTERM the app itself, not the container: PID 1 in the dev image is `dotnet watch`, which ignores
  # SIGTERM and SIGINT, so `compose stop` SIGKILLs the app after 10 s with no cluster leave — and in a
  # two-node keep-majority cluster a crashed oldest node makes SBR down the survivor. A real deploy's
  # SIGTERM reaches the app, so this is the stop worth proving. `dotnet watch` then idles, it does not
  # restart the app, hence `compose restart` below rather than `start`.
  compose exec -T backend sh -c "pkill -TERM -f '^/src/bin/Debug/net10.0/Chess.Backend'" \
    || fail "could not signal the backend-1 app process"
  for i in $(seq 1 30); do
    if api "http://$API_HOST/api/pings/$ID/live" 2>/dev/null | count_is_1; then echo "ok (~$((i))s)"; break; fi
    [[ "$i" -eq 30 ]] && fail "entity did not recover on backend-2"
    sleep 1
  done
  compose restart backend >/dev/null
fi

printf '\nAll part-0 checks passed.\n'
