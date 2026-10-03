#!/usr/bin/env bash
# Prove the data plane of the local stack: the replica streams from the primary (write on primary, read
# on replica), Redpanda is healthy with the roadmap topics, and the console is routed. Then the observability stack:
# the collector is healthy, Prometheus scrapes every target, Grafana needs a login and its four datasources answer,
# and container logs (multi-line entries joined) reach Loki under their service name.
#
#   tools/localdev/verify-stack.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
compose() { docker compose -f docker-compose.yml "$@"; }
psql_primary() { compose exec -T postgres psql -U chess -d chess -tA -c "$1"; }
psql_replica() { compose exec -T postgres-replica psql -U chess -d chess -tA -c "$1"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

step "replica is a hot standby"
[[ "$(psql_replica 'select pg_is_in_recovery()')" == "t" ]] || fail "replica is not in recovery"
[[ "$(psql_primary 'select pg_is_in_recovery()')" == "f" ]] || fail "primary reports recovery"
echo "ok"

step "primary sees a streaming replica"
state="$(psql_primary "select state from pg_stat_replication where usename='replicator' limit 1")"
[[ "$state" == "streaming" ]] || fail "no streaming replica on the primary (state='${state:-none}')"
echo "ok (state=$state)"

step "write on primary → visible on replica"
probe="probe-$(date +%s%N)"
psql_primary "create table if not exists replication_probe(id text primary key, at timestamptz default now())" >/dev/null
psql_primary "insert into replication_probe(id) values ('$probe')" >/dev/null
for i in $(seq 1 20); do
  if [[ "$(psql_replica "select count(*) from replication_probe where id='$probe'")" == "1" ]]; then
    echo "ok (visible after ~$((i * 250))ms)"; break
  fi
  [[ "$i" -eq 20 ]] && fail "row not replicated within 5s"
  sleep 0.25
done
psql_primary "delete from replication_probe where id='$probe'" >/dev/null

step "replica rejects writes"
if psql_replica "insert into replication_probe(id) values ('must-fail')" >/dev/null 2>&1; then
  fail "replica accepted a write"
fi
echo "ok (read-only)"

step "redpanda healthy"
health="$(compose exec -T redpanda rpk cluster health 2>/dev/null)"
grep -qE 'Healthy:\s+true' <<<"$health" || fail "rpk cluster health: $health"
echo "ok"

step "roadmap topics exist"
topics="$(compose exec -T redpanda rpk topic list 2>/dev/null | awk 'NR>1 {print $1}')"
for t in game.events matchmaking.events analysis.requests analysis.review.requests analysis.results; do
  grep -qx "$t" <<<"$topics" || fail "missing topic $t (have: $(tr '\n' ' ' <<<"$topics"))"
done
echo "ok ($(wc -l <<<"$topics" | tr -d ' ') topics)"

step "produce/consume round-trip on game.events"
msg="probe-$(date +%s%N)"
# Pin both ends to partition 0: game.events has three, so "last record" without a partition is
# whichever partition answers first — which is a real ping event once the backend is publishing.
compose exec -T redpanda bash -c "echo '$msg' | rpk topic produce game.events -k probe -p 0" >/dev/null
got="$(compose exec -T redpanda rpk topic consume game.events -p 0 -o -1 -n 1 -f '%v\n' 2>/dev/null | tr -d '\r')"
[[ "$got" == "$msg" ]] || fail "consumed '$got', expected '$msg'"
echo "ok"

step "console routed at console.chess.localhost"
code="$(curl -sS -o /dev/null -w '%{http_code}' --resolve console.chess.localhost:80:127.0.0.1 http://console.chess.localhost/)"
[[ "$code" =~ ^(200|30[0-9])$ ]] || fail "console returned $code"
echo "ok ($code)"

step "otel collector healthy"
code="$(compose exec -T grafana wget -qO /dev/null -S http://otel-collector:13133/ 2>&1 | awk '/HTTP\//{print $2}' | tail -1)"
[[ "$code" == "200" ]] || fail "collector health returned '${code:-nothing}'"
echo "ok"

step "prometheus scrapes every target"
targets="$(compose exec -T prometheus wget -qO- 'http://localhost:9090/api/v1/targets?state=active')"
down="$(python3 -c 'import json,sys; t=json.load(sys.stdin)["data"]["activeTargets"]; print(" ".join(x["labels"]["job"] for x in t if x["health"]!="up"))' <<<"$targets")"
count="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)["data"]["activeTargets"]))' <<<"$targets")"
[[ -z "$down" ]] || fail "targets not up: $down"
echo "ok ($count targets up)"

step "consumer lag is a metric"
lag="$(compose exec -T prometheus wget -qO- 'http://localhost:9090/api/v1/query?query=count(redpanda_kafka_consumer_group_lag_sum)')"
grep -q '"result":\[{' <<<"$lag" || fail "no redpanda_kafka_consumer_group_lag_sum (enable_consumer_group_metrics lacks consumer_lag?)"
echo "ok"

grafana() { curl -sS --resolve grafana.chess.localhost:80:127.0.0.1 "$@"; }
step "grafana needs a login; viewer reads, admin's datasources answer"
[[ "$(grafana -o /dev/null -w '%{http_code}' http://grafana.chess.localhost/api/search)" == "401" ]] || fail "anonymous access is open"
[[ "$(grafana -o /dev/null -w '%{http_code}' -u 'viewer:Viewer123!' http://grafana.chess.localhost/api/search)" == "200" ]] || fail "viewer cannot read"
[[ "$(grafana -o /dev/null -w '%{http_code}' -u 'viewer:Viewer123!' -H 'content-type: application/json' \
  -d '{"dashboard":{"title":"verify"}}' http://grafana.chess.localhost/api/dashboards/db)" == "403" ]] || fail "viewer can save a dashboard"
for ds in prometheus tempo loki pyroscope; do
  grafana -u 'admin:Admin123!' "http://grafana.chess.localhost/api/datasources/uid/$ds/health" | grep -q '"status":"OK"' \
    || fail "datasource $ds is not healthy"
done
echo "ok (prometheus, tempo, loki, pyroscope)"

loki() { compose exec -T grafana wget -qO- "http://loki:3100/loki/api/v1/query_range?limit=20&query=$1"; }
step "container logs reach loki, one entry per multi-line message"
probe="probe$(date +%s%N)"
docker run --rm --log-driver json-file --log-opt tag=chess-verifyprobe-1 alpine:3 \
  sh -c "printf '$probe Exception: boom\n\tat A.run(A.java:1)\n\tat B.run(B.java:2)\n$probe next\n'" >/dev/null
entries=""
for _ in $(seq 1 30); do
  entries="$(loki '%7Bservice_name%3D%22verifyprobe%22%7D' | python3 -c 'import json,sys; print(sum(len(r["values"]) for r in json.load(sys.stdin)["data"]["result"]))' || true)"
  [[ "$entries" == "2" ]] && break
  sleep 1
done
[[ "$entries" == "2" ]] || fail "expected the probe's 4 lines as 2 entries in Loki, got '${entries:-none}'"
services="$(compose exec -T grafana wget -qO- 'http://loki:3100/loki/api/v1/label/service_name/values')"
for s in keycloak postgres redpanda proxy frontend; do
  grep -q "\"$s\"" <<<"$services" || fail "no logs from $s in Loki (have: $services)"
done
for s in backend backend-2 engine; do
  if grep -q "\"$s\"" <<<"$services"; then fail "$s's container output is in Loki; its logs must only come over OTLP"; fi
done
echo "ok"

printf '\nAll stack checks passed.\n'
