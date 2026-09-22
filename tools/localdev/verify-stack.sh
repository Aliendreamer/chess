#!/usr/bin/env bash
# Prove the data plane of the local stack: the replica streams from the primary (write on primary, read
# on replica), Redpanda is healthy with the roadmap topics, and the console is routed.
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
for t in game.events matchmaking.events analysis.requests analysis.results; do
  grep -qx "$t" <<<"$topics" || fail "missing topic $t (have: $(tr '\n' ' ' <<<"$topics"))"
done
echo "ok ($(wc -l <<<"$topics" | tr -d ' ') topics)"

step "produce/consume round-trip on game.events"
msg="probe-$(date +%s%N)"
compose exec -T redpanda bash -c "echo '$msg' | rpk topic produce game.events -k probe" >/dev/null
got="$(compose exec -T redpanda rpk topic consume game.events -o -1 -n 1 -f '%v\n' 2>/dev/null | tr -d '\r')"
[[ "$got" == "$msg" ]] || fail "consumed '$got', expected '$msg'"
echo "ok"

step "console routed at console.chess.localhost"
code="$(curl -sS -o /dev/null -w '%{http_code}' --resolve console.chess.localhost:80:127.0.0.1 http://console.chess.localhost/)"
[[ "$code" =~ ^(200|30[0-9])$ ]] || fail "console returned $code"
echo "ok ($code)"

printf '\nAll stack checks passed.\n'
