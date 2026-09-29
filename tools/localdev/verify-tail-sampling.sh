#!/usr/bin/env bash
# Prove the sampling setup (tail-sampling): synthetic traces go to the gateway (otel-collector), which routes them by
# trace id to two samplers. Every error trace and every trace with a slow operation — a request over 1 s, an actor
# message over 500 ms, a projection record over 2 s — is kept whole; about a tenth of the rest is kept; a 7 s engine
# think and a long-lived WebSocket are not "slow"; and span metrics count every trace, not only the kept ones.
#
# Each trace has two spans from two services, sent in two requests a second apart: a kept trace must have both, so a
# late span reached the same sampler as the first.
#
#   tools/localdev/stack.sh up --tail-sampling      (the telemetry services are enough: the apps may be down)
#   tools/localdev/verify-tail-sampling.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
compose() { docker compose -f docker-compose.yml -f docker-compose.tail-sampling.yml "$@"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# The curl container runs as its own user: it reads the payloads and writes each fetched trace here.
chmod 0777 "$work"
curl_net() { docker run --rm --network chess -v "$work:/work" curlimages/curl:8.16.0 "$@"; }

step "the sampling setup is running"
samplers="$(compose ps --format '{{.Service}}' | grep -cx otel-sampler || true)"
(( samplers >= 2 )) || fail "want 2 samplers, have ${samplers}; start the stack with stack.sh up --tail-sampling"
echo "ok ($samplers samplers)"

step "send synthetic traces to the gateway"
RUN="ts$(date +%s)"
python3 - "$work" "$RUN" <<'PY'
import json, os, random, sys, time
work, run = sys.argv[1], sys.argv[2]
now = time.time_ns()
MS = 1_000_000

def span(trace, span_id, parent, name, kind, dur_ms, attrs=None, error=False):
    end = now - 30_000 * MS  # well inside the decision wait and every retention
    return {
        "traceId": trace, "spanId": span_id, "parentSpanId": parent or "", "name": name, "kind": kind,
        "startTimeUnixNano": str(end - int(dur_ms * MS)), "endTimeUnixNano": str(end),
        "attributes": [{"key": k, "value": ({"intValue": str(v)} if isinstance(v, int) else {"stringValue": v})}
                       for k, v in (attrs or {}).items()],
        "status": {"code": 2} if error else {},
    }

SERVER, CONSUMER, INTERNAL = 2, 5, 1
# category: (count, first span, second span); spans are (name, kind, ms, attrs, error)
cats = {
    "fast": (200, ("GET /api/fast", SERVER, 20, {"http.response.status_code": 200}, False),
                  ("game MakeMove", INTERNAL, 5, {"actor.type": "game"}, False)),
    "error": (10, ("POST /api/fail", SERVER, 20, {"http.response.status_code": 200}, False),
                  ("game MakeMove", INTERNAL, 5, {"actor.type": "game"}, True)),
    "slow-request": (10, ("POST /api/slow", SERVER, 1500, {"http.response.status_code": 200}, False),
                         ("game MakeMove", INTERNAL, 5, {"actor.type": "game"}, False)),
    "slow-actor": (10, ("POST /api/moves", SERVER, 800, {"http.response.status_code": 200}, False),
                       ("game MakeMove", INTERNAL, 700, {"actor.type": "game"}, False)),
    "slow-projection": (10, ("publish game.events", 4, 5, {}, False),
                            ("consume chess.rm-games", CONSUMER, 2500, {"messaging.consumer.group.name": "chess.rm-games"}, False)),
    "engine": (30, ("consume chess.engine-requests", CONSUMER, 20, {}, False),
                   ("engine move", CONSUMER, 7000, {"engine.job": "move"}, False)),
    "websocket": (10, ("GET /hub/live", SERVER, 60_000, {"http.response.status_code": 101}, False),
                      ("hub push game", 4, 2, {}, False)),
}
manifest, first, second = [], [], []
for cat, (n, a, b) in cats.items():
    for _ in range(n):
        trace, s1, s2 = os.urandom(16).hex(), os.urandom(8).hex(), os.urandom(8).hex()
        first.append(span(trace, s1, None, *a))
        second.append(span(trace, s2, s1, *b))
        manifest.append(f"{cat} {trace}")

def payload(service, spans):
    return {"resourceSpans": [{"resource": {"attributes": [{"key": "service.name", "value": {"stringValue": service}}]},
                               "scopeSpans": [{"scope": {"name": "verify-tail-sampling"}, "spans": spans}]}]}
json.dump(payload(f"{run}-api", first), open(f"{work}/first.json", "w"))
json.dump(payload(f"{run}-worker", second), open(f"{work}/second.json", "w"))
open(f"{work}/manifest.txt", "w").write("\n".join(manifest) + "\n")
for name in ("first.json", "second.json"):
    os.chmod(f"{work}/{name}", 0o644)
PY
post() { curl_net -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' --data-binary "@/work/$1" http://otel-collector:4318/v1/traces; }
[[ "$(post first.json)" == "200" ]] || fail "the gateway refused the first spans"
sleep 1
[[ "$(post second.json)" == "200" ]] || fail "the gateway refused the second spans"
echo "ok ($(wc -l < "$work/manifest.txt") traces as $RUN, two spans each)"

step "wait for the decision (10 s) and Tempo"
sleep 40
cut -d' ' -f2 "$work/manifest.txt" > "$work/ids.txt"
chmod 0644 "$work/ids.txt"
# One pass over every trace id, inside the network: "<id> <span count>" (0 when Tempo has no such trace).
curl_net sh -c 'while read -r id; do
  code=$(curl -s -o /work/t.json -w "%{http_code}" "http://tempo:3200/api/traces/$id")
  if [ "$code" = 200 ]; then echo "$id $(grep -o "\"spanId\"" /work/t.json | wc -l)"; else echo "$id 0"; fi
done < /work/ids.txt' > "$work/found.txt"
echo "ok"

step "errors and slow operations are kept whole; the rest about a tenth"
python3 - "$work" <<'PY' || exit 1
import sys
work = sys.argv[1]
found = dict(line.split() for line in open(f"{work}/found.txt"))
cats = {}
for line in open(f"{work}/manifest.txt"):
    cat, trace = line.split()
    cats.setdefault(cat, []).append(int(found.get(trace, 0)))
fail = []
for cat, spans in cats.items():
    kept = [s for s in spans if s > 0]
    partial = [s for s in kept if s != 2]
    print(f"   {cat:16} kept {len(kept):3} of {len(spans):3}" + (f"   PARTIAL: {len(partial)}" if partial else ""))
    if partial:
        fail.append(f"{cat}: {len(partial)} kept traces are missing spans (split between samplers?)")
    if cat in ("error", "slow-request", "slow-actor", "slow-projection") and len(kept) != len(spans):
        fail.append(f"{cat}: {len(spans) - len(kept)} traces dropped, all must be kept")
if not 5 <= sum(1 for s in cats["fast"] if s) <= 40:
    fail.append("fast: the 10 % share is off (want 5–40 of 200)")
if sum(1 for s in cats["engine"] if s) > 12:
    fail.append("engine: a 7 s engine think made traces 'slow'")
if sum(1 for s in cats["websocket"] if s) > 6:
    fail.append("websocket: long-lived sockets were kept as slow requests")
if fail:
    print("FAIL: " + "; ".join(fail), file=sys.stderr)
    sys.exit(1)
PY

step "span metrics count every trace, kept or not"
calls="$(compose exec -T prometheus wget -qO- "http://localhost:9090/api/v1/query?query=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "sum(traces_spanmetrics_calls_total{service_name=\"$RUN-api\", span_name=\"GET /api/fast\"})")" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; print(int(float(r[0]["value"][1])) if r else 0)')"
[[ "$calls" == "200" ]] || fail "span metrics counted $calls fast requests, want 200"
echo "ok (200 of 200 counted)"

printf '\nAll tail-sampling checks passed.\n'
