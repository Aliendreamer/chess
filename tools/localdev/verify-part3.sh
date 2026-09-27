#!/usr/bin/env bash
# Prove Part 3 on the live stack: a correspondence game (correspondence-games). testuser invites player at 7d (a week
# per move) and they play; the game's deadline, the "your turn" list, the deadline row the sweeper reads and the mails
# in Mailpit are checked; testuser resigns and both hear the result.
#
# Forfeits and passivation take days and half an hour on the live stack: they are proved by the integration tests
# (CorrespondenceFlowTests, deadline shortened to seconds) and the actor's unit tests.
#
#   tools/localdev/verify-part3.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
MAIL="${MAIL:-http://mail.chess.localhost}"
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
post() {
  local sid="$1"; shift
  if [[ " $* " == *" -d "* ]]; then as "$sid" -X POST -H 'content-type: application/json' "$@"; else as "$sid" -X POST "$@"; fi
}
field() { grep -oE "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }

# mails <address>: the subjects Mailpit holds for <address>, one per line.
mails() {
  curl -sS "$MAIL/api/v1/messages?limit=500" | python3 -c '
import json, sys
for m in json.load(sys.stdin)["messages"]:
    if any(t["Address"] == sys.argv[1] for t in m["To"]):
        print(m["Subject"])' "$1"
}

# wait_mail <address> <subject>: until Mailpit has that mail (the consumer runs after the event reaches Kafka).
wait_mail() {
  for _ in $(seq 1 40); do
    mails "$1" | grep -qxF "$2" && return
    sleep 0.5
  done
  fail "no mail \"$2\" for $1"
}

step "log in testuser and player; empty Mailpit"
SID_T="$(login testuser 'Test123!')"
SID_P="$(login player 'Player123!')"
curl -sS -o /dev/null -X DELETE "$MAIL/api/v1/messages" || fail "Mailpit is not reachable at $MAIL"
echo "ok"

step "testuser invites player to a correspondence game (7d) as White; player accepts"
INVITE="$(post "$SID_T" -d '{"timeControl":"7d","color":"white"}' "http://$API_HOST/api/invites" | field inviteId)"
[[ -n "$INVITE" ]] || fail "no 7d invite"
GAME="$(post "$SID_P" "http://$API_HOST/api/invites/$INVITE/accept" | field gameId)"
[[ -n "$GAME" ]] || fail "accept did not start a game"
view="$(as "$SID_T" "http://$API_HOST/api/games/$GAME/live")"
[[ "$(field timeControl <<<"$view")" == "7d" ]] || fail "not a 7d game: $view"
deadline="$(field deadlineAt <<<"$view")"
python3 -c 'import sys, datetime as d; t=d.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00")); left=(t-d.datetime.now(d.timezone.utc)).total_seconds()/86400; sys.exit(0 if 6.99 < left <= 7.0 else 1)' "$deadline" \
  || fail "the first deadline is not a week away: $deadline"
echo "ok ($GAME, deadline $deadline)"

step "testuser is told it is their move; after 1.e4 player is"
wait_mail testuser@chess.localhost "Your move against player"
[[ "$(post "$SID_T" -o /dev/null -w '%{http_code}' -d '{"uci":"e2e4"}' "http://$API_HOST/api/games/$GAME/moves")" == "200" ]] || fail "e4 refused"
wait_mail player@chess.localhost "Your move against testuser"
echo "ok"

step "the game is in player's \"your turn\" list, not testuser's"
for _ in $(seq 1 40); do
  as "$SID_P" "http://$API_HOST/api/me/games?turn=mine&limit=50" | grep -q "\"gameId\":\"$GAME\"" && break
  sleep 0.25
done
as "$SID_P" "http://$API_HOST/api/me/games?turn=mine&limit=50" | grep -q "\"gameId\":\"$GAME\"" || fail "not in player's turn list"
as "$SID_T" "http://$API_HOST/api/me/games?turn=mine&limit=50" | grep -q "\"gameId\":\"$GAME\"" && fail "in testuser's turn list"
echo "ok"

step "the sweeper's row has the new deadline"
due="$(docker exec chess-postgres-1 psql -U chess -d chess -tAc \
  "select extract(epoch from \"DueAt\" - now())/86400 from game_deadlines where \"GameId\" = '$GAME'")"
python3 -c 'import sys; sys.exit(0 if 6.99 < float(sys.argv[1]) <= 7.0 else 1)' "${due:-0}" || fail "game_deadlines row: $due days"
echo "ok (${due%%.*}+ days)"

step "testuser resigns; both hear the result"
[[ "$(post "$SID_T" -o /dev/null -w '%{http_code}' "http://$API_HOST/api/games/$GAME/resign")" == "200" ]] || fail "resign refused"
wait_mail testuser@chess.localhost "Your game against player: You lost"
wait_mail player@chess.localhost "Your game against testuser: You won"
echo "ok"

printf '\nAll part-3 checks passed.\n'
