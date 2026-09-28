#!/usr/bin/env bash
# Prove engine analysis on the live stack (Part 4, engine-analysis): testuser asks for a position nobody has asked for
# (a random rook ending), the engine worker evaluates it with three lines, the answer is stored, and then player — another
# user — gets it straight from the shared cache, also at a shorter think time; a deeper think is a new request; nonsense
# (a bad FEN or think, more than 10 positions) is a 400.
#
#   tools/localdev/verify-part4b.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
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

as() { local sid="$1"; shift; curl -sS --resolve "$API_HOST:80:$EDGE_IP" -H "Cookie: mp_sid=$sid" "$@"; }
send() {
  local sid="$1" method="$2"; shift 2
  if [[ " $* " == *" -d "* ]]; then as "$sid" -X "$method" -H 'content-type: application/json' "$@"; else as "$sid" -X "$method" "$@"; fi
}
field() { grep -oE "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }
num() { grep -oE "\"$1\":-?[0-9]+" | head -n1 | cut -d: -f2; }
code() { local sid="$1" method="$2"; shift 2; send "$sid" "$method" -o /dev/null -w '%{http_code}' "$@"; }

step "log in testuser and player"
SID_T="$(login testuser 'Test123!')"
SID_P="$(login player 'Player123!')"
echo "ok"

# White king on rank 1, black king on rank 8, a white rook on rank 4 off the black king's file: 448 positions, so a
# run almost never finds its position already evaluated.
files=(a b c d e f g h)
wk=$((RANDOM % 8)); bk=$((RANDOM % 8)); rook=$(( (bk + 1 + RANDOM % 7) % 8 ))
rank() { local at="$1" piece="$2"; local before=$at after=$((7 - at)) out=""
  (( before > 0 )) && out+="$before"; out+="$piece"; (( after > 0 )) && out+="$after"; printf '%s' "$out"; }
FEN="$(rank "$bk" k)/8/8/8/$(rank "$rook" R)/8/8/$(rank "$wk" K) w - - 0 1"
analyse() { send "$1" POST -d "{\"positions\":[\"$FEN\"],\"think\":\"$2\"}" "http://$API_HOST/api/analysis"; }
known() { grep -q '"evaluation":{' <<<"$1"; }

step "testuser asks for $FEN (normal); the engine evaluates it"
first="$(analyse "$SID_T" normal)"
grep -q '"thinkMs":3000' <<<"$first" || fail "no analysis answer: $first"
known "$first" && echo "(already evaluated by an earlier run)"
answer="$first"
for _ in $(seq 1 60); do
  known "$answer" && break
  sleep 1.5
  answer="$(analyse "$SID_T" normal || true)"
done
known "$answer" || fail "the engine did not answer within 90 s: $answer"
[[ "$(grep -o '"pv":\[' <<<"$answer" | wc -l)" == "3" ]] || fail "not three lines: $answer"
depth="$(num depth <<<"$answer")"
(( depth > 5 )) || fail "a shallow evaluation (depth $depth): $answer"
echo "ok (depth $depth)"

step "player gets it from the shared cache, also at a shorter think"
known "$(analyse "$SID_P" normal)" || fail "player did not get the cached evaluation"
quick="$(analyse "$SID_P" quick)"
known "$quick" && grep -q '"thinkMs":3000,"depth"' <<<"$quick" || fail "a quick request was not answered by the normal think: $quick"
echo "ok"

step "a deeper think is not answered by a shorter one"
known "$(analyse "$SID_P" deep)" && fail "a deep request was answered by a shorter think"
echo "ok (asked the engine)"

step "nonsense is a 400"
[[ "$(code "$SID_T" POST -d '{"positions":["not a fen"],"think":"normal"}' "http://$API_HOST/api/analysis")" == "400" ]] || fail "a bad FEN was accepted"
[[ "$(code "$SID_T" POST -d "{\"positions\":[\"$FEN\"],\"think\":\"forever\"}" "http://$API_HOST/api/analysis")" == "400" ]] || fail "a bad think was accepted"
eleven="\"$FEN\""; for _ in $(seq 1 10); do eleven+=",\"$FEN\""; done
[[ "$(code "$SID_T" POST -d "{\"positions\":[$eleven],\"think\":\"quick\"}" "http://$API_HOST/api/analysis")" == "400" ]] \
  || fail "more than 10 positions were accepted"
[[ "$(curl -sS --resolve "$API_HOST:80:$EDGE_IP" -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d "{\"positions\":[\"$FEN\"],\"think\":\"quick\"}" "http://$API_HOST/api/analysis")" == "401" ]] || fail "anonymous analysis was allowed"
echo "ok"

printf '\nAll part-4 (engine analysis) checks passed.\n'
