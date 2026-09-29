#!/usr/bin/env bash
# Prove observability on the live stack (the observability change): a move against the engine made through the API is
# one trace in Tempo — the endpoint, the game actor, the persist, the journal publisher, the consumers and the engine
# worker — found by the game's id; the backend's logs for that trace are in Loki, each line once; both backend nodes
# report actor metrics to Prometheus; and Pyroscope has profiles from both backend nodes and the BFF.
#
# Needs the cluster: tools/localdev/stack.sh up --cluster
#
#   tools/localdev/verify-observability.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
compose() { docker compose -f docker-compose.yml "$@"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# Same guarded login as verify-part1.sh.
login() {
  local err sid
  err="$(mktemp)"
  if sid="$(SID_ONLY=1 USER_NAME="$1" PASSWORD="$2" ./verify-auth.sh 2>"$err" | tail -n1)"; then
    rm -f "$err"
  else
    cat "$err" >&2
    rm -f "$err"
    fail "login as $1 failed — see diagnostics above"
  fi
  [[ -n "$sid" ]] || fail "no session for $1; run verify-auth.sh to see why"
  printf '%s' "$sid"
}

as() { curl -sS --resolve "$API_HOST:80:$EDGE_IP" -H "Cookie: mp_sid=$SID" "$@"; }
post() { as -X POST -H 'content-type: application/json' "$@"; }
field() { grep -oE "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }
num() { grep -oE "\"$1\":-?[0-9]+" | head -n1 | cut -d: -f2; }
# The stores are read from inside the network (they publish no ports), through the Grafana container.
get() { compose exec -T grafana wget -qO- "$1" 2>/dev/null || true; }
post_json() { compose exec -T grafana wget -qO- --header 'content-type: application/json' --post-data "$2" "$1" 2>/dev/null || true; }
enc() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1"; }

step "the cluster is up"
compose ps --format '{{.Service}}' | grep -qx backend-2 || fail "backend-2 is not running; start the stack with stack.sh up --cluster"
echo "ok"

step "a move against the engine through the API"
SID="$(login testuser 'Test123!')"
GAME="$(post -d '{"level":"1320","color":"white"}' "http://$API_HOST/api/engine-games" | field gameId)"
[[ -n "$GAME" ]] || fail "no engine game started"
[[ "$(post -o /dev/null -w '%{http_code}' -d '{"uci":"e2e4"}' "http://$API_HOST/api/games/$GAME/moves")" == "200" ]] || fail "e4 refused"
for _ in $(seq 1 60); do
  (( $(as "http://$API_HOST/api/games/$GAME/live" | num ply) >= 2 )) && break
  sleep 1
done
(( $(as "http://$API_HOST/api/games/$GAME/live" | num ply) >= 2 )) || fail "the engine did not answer within 60 s"
ID="$(tr -d '-' <<<"$GAME")"
echo "ok (game $ID, the engine answered)"

step "Tempo has the move's trace, found by the game's id"
# service|span name, one line per span of the trace.
SPANS_PY="$(cat <<'PY'
import json, sys
trace = json.load(sys.stdin)["trace"]
for rs in trace["resourceSpans"]:
    service = next(a["value"]["stringValue"] for a in rs["resource"]["attributes"] if a["key"] == "service.name")
    for ss in rs["scopeSpans"]:
        for span in ss["spans"]:
            print(service + "|" + span["name"])
PY
)"
now=$(date +%s)
TRACE=""
# The engine's own move is a trace too; the player's is the one with the HTTP request in it.
for _ in $(seq 1 30); do
  TRACE="$(get "http://tempo:3200/api/search?q=$(enc "{ span.game.id = \"$ID\" } && { name = \"POST /api/games/{id}/moves\" }")&start=$((now - 600))&end=$((now + 600))&limit=5" \
    | python3 -c 'import json,sys; t=json.load(sys.stdin).get("traces",[]); print(t[0]["traceID"] if t else "")' 2>/dev/null || true)"
  [[ -n "$TRACE" ]] && break
  sleep 2
done
[[ -n "$TRACE" ]] || fail "no trace for game $ID in Tempo"
spans=""
for _ in $(seq 1 30); do
  spans="$(get "http://tempo:3200/api/v2/traces/$TRACE" | python3 -c "$SPANS_PY" 2>/dev/null || true)"
  grep -q '^chess-engine|engine move$' <<<"$spans" && grep -q '|consume chess.rm-games$' <<<"$spans" && break
  sleep 2
done
for want in 'chess-backend|POST /api/games/{id}/moves' 'chess-backend|game MakeMove' 'chess-backend|game persist' \
  'chess-backend|publish game.events' 'chess-backend|consume chess.rm-games' 'chess-backend|consume chess.engine-requests' \
  'chess-engine|engine move'; do
  grep -qxF "$want" <<<"$spans" || fail "trace $TRACE has no span '$want' (has: $(sort -u <<<"$spans" | tr '\n' ';'))"
done
echo "ok (trace $TRACE: $(wc -l <<<"$spans") spans across $(cut -d'|' -f1 <<<"$spans" | sort -u | tr '\n' ' '))"

step "Loki has the trace's backend logs, each once"
lines="$(get "http://loki:3100/loki/api/v1/query_range?limit=500&start=$((now - 600))000000000&end=$((now + 600))000000000&query=$(enc "{service_name=\"chess-backend\"} | trace_id=\"$TRACE\"")" \
  | python3 -c '
import json, sys
values = [tuple(v) for r in json.load(sys.stdin)["data"]["result"] for v in r["values"]]
print(len(values), len(set(values)))' 2>/dev/null || echo "0 0")"
read -r total distinct <<<"$lines"
(( total > 0 )) || fail "no backend log line carries trace $TRACE"
(( total == distinct )) || fail "backend log lines arrived twice ($total lines, $distinct distinct)"
services="$(get 'http://loki:3100/loki/api/v1/label/service_name/values')"
for s in keycloak postgres; do grep -q "\"$s\"" <<<"$services" || fail "no logs from $s in Loki"; done
echo "ok ($total lines with the trace id, none twice; keycloak and postgres present)"

step "Prometheus has actor metrics from both backend nodes"
nodes="$(get "http://prometheus:9090/api/v1/query?query=$(enc 'count by (service_instance_id) (chess_actor_messages_total)')" \
  | python3 -c 'import json,sys; print(" ".join(sorted(r["metric"]["service_instance_id"] for r in json.load(sys.stdin)["data"]["result"])))')"
[[ "$nodes" == "backend backend-2" ]] || fail "chess_actor_messages_total from: '$nodes' (want backend backend-2)"
echo "ok ($nodes)"

step "Pyroscope has profiles from both backend nodes and the BFF"
ms=$(( now * 1000 ))
names="$(post_json http://pyroscope:4040/querier.v1.QuerierService/LabelValues "{\"name\":\"service_name\",\"start\":$((ms - 900000)),\"end\":$ms}")"
instances="$(post_json http://pyroscope:4040/querier.v1.QuerierService/LabelValues "{\"name\":\"service_instance_id\",\"start\":$((ms - 900000)),\"end\":$ms}")"
for s in chess-backend chess-frontend; do grep -q "\"$s\"" <<<"$names" || fail "no profiles from $s (have: $names)"; done
for i in backend backend-2; do grep -q "\"$i\"" <<<"$instances" || fail "no profiles from node $i (have: $instances)"; done
echo "ok"

printf '\nAll observability checks passed.\n'
