#!/usr/bin/env bash
# Prove Part 2 on the live stack: games against Stockfish through the API (engine-play). testuser plays White; its
# moves come from the same Stockfish binary in the engine container, at full strength, 200 ms a move.
#
#   1. 10 moves each at 1320, 2000 and max: the engine answers every time, under its level's name on the read side;
#   2. the engine container restarts while it thinks, and its move still arrives;
#   3. one full game against 1320, to the end, with the result and the PGN on the replica.
#
#   tools/localdev/verify-part2.sh            # all three
#   tools/localdev/verify-part2.sh --quick    # 1 and 2 only
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
compose() { docker compose -f docker-compose.yml "$@"; }
QUICK=0; [[ "${1:-}" == "--quick" ]] && QUICK=1
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
live() { as "http://$API_HOST/api/games/$1/live"; }

# our_move <fen>: White's move, from Stockfish at full strength in the engine container (200 ms).
our_move() {
  { printf 'uci\nposition fen %s\ngo movetime 200\n' "$1"; sleep 1; } \
    | compose exec -T engine /opt/stockfish/stockfish | grep -m1 '^bestmove' | awk '{print $2}'
}

# start <level>: a new game against <level> with testuser as White; prints the game id.
start() {
  local g
  g="$(post -d "{\"level\":\"$1\",\"color\":\"white\"}" "http://$API_HOST/api/engine-games" | field gameId)"
  [[ -n "$g" ]] || fail "no game against $1"
  printf '%s' "$g"
}

# wait_reply <game> <ply> [seconds]: until the game is past <ply> (the engine answered) or over.
wait_reply() {
  local v
  for _ in $(seq 1 $((${3:-45} * 2))); do
    v="$(live "$1")"
    if (( $(num ply <<<"$v") > $2 )) || grep -q '"status":"Ended"' <<<"$v"; then printf '%s' "$v"; return; fi
    sleep 0.5
  done
  fail "the engine did not answer ply $2 in game $1 within ${3:-45}s"
}

# play <game> <moves>: up to <moves> of White's moves, each answered by the engine; prints the last view.
play() {
  local v fen uci ply
  v="$(live "$1")"
  for _ in $(seq 1 "$2"); do
    grep -q '"status":"Ended"' <<<"$v" && break
    fen="$(field fen <<<"$v")"; ply="$(num ply <<<"$v")"
    uci="$(our_move "$fen")"
    [[ -n "$uci" && "$uci" != "(none)" ]] || fail "no move for White in $fen"
    [[ "$(post -o /dev/null -w '%{http_code}' -d "{\"uci\":\"$uci\"}" "http://$API_HOST/api/games/$1/moves")" == "200" ]] \
      || fail "White's move $uci was refused in game $1"
    v="$(wait_reply "$1" $((ply + 1)))"
  done
  printf '%s' "$v"
}

step "log in testuser"
SID="$(login testuser 'Test123!')"
echo "ok"

for level in 1320 2000 max; do
  step "10 moves against $level"
  G="$(start "$level")"
  v="$(play "$G" 10)"
  name="$( [[ "$level" == "max" ]] && echo "Stockfish" || echo "Stockfish $level")"
  [[ "$(as "http://$API_HOST/api/games/$G" | field black)" == "$name" ]] || fail "the read side does not name Black $name"
  echo "ok ($G, ply $(num ply <<<"$v"), Black is $name)"
done

step "the engine container restarts mid-think; its move still arrives"
G="$(start 2000)"
v="$(live "$G")"
[[ "$(post -o /dev/null -w '%{http_code}' -d '{"uci":"e2e4"}' "http://$API_HOST/api/games/$G/moves")" == "200" ]] || fail "e4 refused"
sleep 1 # the request is on its way or being searched
compose restart engine >/dev/null 2>&1
v="$(wait_reply "$G" 1 120)"
echo "ok ($G: $(field lastSan <<<"$v") after the restart)"

if [[ "$QUICK" == "0" ]]; then
  step "a full game against 1320, to the end"
  G="$(start 1320)"
  v="$(play "$G" 150)"
  grep -q '"status":"Ended"' <<<"$v" || fail "the game did not end within 150 moves: $v"
  result="$(field result <<<"$v")"; reason="$(field reason <<<"$v")"
  for _ in $(seq 1 40); do
    game="$(as "http://$API_HOST/api/games/$G")"
    grep -qi '"status":"ended"' <<<"$game" && break
    sleep 0.25
  done
  pgn="$(as "http://$API_HOST/api/games/$G/pgn")"
  grep -q '\[Black "Stockfish 1320"\]' <<<"$pgn" || fail "PGN Black tag wrong: $pgn"
  grep -q "\[Result \"$result\"\]" <<<"$pgn" || fail "PGN Result tag is not $result"
  echo "ok ($G: $result by $reason after $(num ply <<<"$v") plies)"
fi

printf '\nAll part-2 checks passed.\n'
