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

step "login (reusing verify-auth's flow) and capture mp_sid"
SID="$(SID_ONLY=1 ./verify-auth.sh 2>/dev/null | tail -n1)"
[[ -n "$SID" ]] || fail "could not obtain a session; run verify-auth.sh to see why"
api() { curl -sS --resolve "$API_HOST:80:$EDGE_IP" -H "Cookie: mp_sid=$SID" "$@"; }

ID="p-$(date +%s)"
step "POST /api/pings/$ID → actor state count=1"
body="$(api -X POST -H 'content-type: application/json' -d '{"text":"hello"}' "http://$API_HOST/api/pings/$ID")"
grep -q '"count":1' <<<"$body" || fail "unexpected: $body"
echo "ok"

step "GET /api/pings/$ID/live → count=1 (actor)"
api "http://$API_HOST/api/pings/$ID/live" | grep -q '"count":1' || fail "live read wrong"
echo "ok"

step "GET /api/pings → row for $ID (replica via projection) within 5s"
for i in $(seq 1 20); do
  if api "http://$API_HOST/api/pings?pageSize=200" | grep -q "\"pingId\":\"$ID\""; then echo "ok (~$((i*250))ms)"; break; fi
  [[ "$i" -eq 20 ]] && fail "projection did not reach the replica"
  sleep 0.25
done

step "rm_pings on the replica matches"
[[ "$(compose exec -T postgres-replica psql -U chess -d chess -tA -c "select count from rm_pings where ping_id='$ID'")" == "1" ]] || fail "replica row mismatch"
echo "ok"

step "hub negotiate is gated"
[[ "$(curl -sS --resolve "$API_HOST:80:$EDGE_IP" -o /dev/null -w '%{http_code}' -X POST "http://$API_HOST/hub/pings/negotiate?negotiateVersion=1")" == "401" ]] || fail "hub not gated"
echo "ok"

if [[ "$CLUSTER" == "1" ]]; then
  step "cluster: stop backend-1, $ID must answer from backend-2 with count=1"
  compose stop backend >/dev/null
  for i in $(seq 1 30); do
    if api "http://$API_HOST/api/pings/$ID/live" 2>/dev/null | grep -q '"count":1'; then echo "ok (~$((i))s)"; break; fi
    [[ "$i" -eq 30 ]] && fail "entity did not recover on backend-2"
    sleep 1
  done
  compose start backend >/dev/null
fi

printf '\nAll part-0 checks passed.\n'
