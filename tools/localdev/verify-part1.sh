#!/usr/bin/env bash
# Prove Part 1's first real game on the live stack: two Keycloak logins → testuser invites (white) → player
# accepts → the fool's mate over the API → the read side (replica) shows the game ended 0-1 with a PGN that
# names testuser as White. Also a quick matchmaking pairing on 5+3.
#
#   tools/localdev/verify-part1.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# Same guarded login as verify-part0.sh: surface verify-auth's diagnostics instead of dying silently.
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

step "log in testuser and player"
SID_T="$(login testuser 'Test123!')"
SID_P="$(login player 'Player123!')"
echo "ok"

# as <sid> <curl args...>: one API call as that session.
as() { local sid="$1"; shift; curl -sS --resolve "$API_HOST:80:$EDGE_IP" -H "Cookie: mp_sid=$sid" "$@"; }
# post <sid> [curl args...]: a POST; JSON content type only when there is a body (an empty JSON body is a 400).
post() {
  local sid="$1"; shift
  if [[ " $* " == *" -d "* ]]; then as "$sid" -X POST -H 'content-type: application/json' "$@"; else as "$sid" -X POST "$@"; fi
}
# field <name>: the first string value of a JSON field (ids and statuses here never contain quotes).
field() { grep -oE "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }

step "matchmaking: testuser waits on 5+3, player is matched into the same game"
waiting="$(post "$SID_T" "http://$API_HOST/api/matchmaking/5+3")"
[[ "$(field status <<<"$waiting")" == "waiting" ]] || fail "testuser not waiting: $waiting"
paired="$(post "$SID_P" "http://$API_HOST/api/matchmaking/5+3")"
[[ "$(field status <<<"$paired")" == "matched" ]] || fail "player not matched: $paired"
[[ "$(post "$SID_T" "http://$API_HOST/api/matchmaking/5+3?heartbeat=true" | field gameId)" == "$(field gameId <<<"$paired")" ]] \
  || fail "testuser's heartbeat did not learn the same game"
echo "ok (game $(field gameId <<<"$paired"))"

step "testuser creates a 5+3 invite as white"
invite="$(post "$SID_T" -d '{"timeControl":"5+3","color":"white"}' "http://$API_HOST/api/invites")"
INVITE="$(field inviteId <<<"$invite")"
[[ "$(field status <<<"$invite")" == "open" && -n "$INVITE" ]] || fail "invite not created: $invite"
echo "ok ($INVITE)"

step "player accepts; a second accept is 409"
accepted="$(post "$SID_P" "http://$API_HOST/api/invites/$INVITE/accept")"
GAME="$(field gameId <<<"$accepted")"
[[ "$(field status <<<"$accepted")" == "accepted" && -n "$GAME" ]] || fail "accept failed: $accepted"
[[ "$(post "$SID_P" -o /dev/null -w '%{http_code}' "http://$API_HOST/api/invites/$INVITE/accept")" == "409" ]] \
  || fail "second accept was not a conflict"
echo "ok (game $GAME)"

step "the fool's mate: f3 e5 g4 Qh4#"
for mv in "$SID_T f2f3" "$SID_P e7e5" "$SID_T g2g4" "$SID_P d8h4"; do
  read -r sid uci <<<"$mv"
  code="$(post "$sid" -o /dev/null -w '%{http_code}' -d "{\"uci\":\"$uci\"}" "http://$API_HOST/api/games/$GAME/moves")"
  [[ "$code" == "200" ]] || fail "move $uci answered $code"
done
echo "ok"

step "GET /api/games/$GAME (replica) shows it ended 0-1 within 10s"
for i in $(seq 1 40); do
  game="$(as "$SID_P" "http://$API_HOST/api/games/$GAME")"
  if grep -qi '"status":"ended"' <<<"$game" && grep -q '"result":"0-1"' <<<"$game"; then echo "ok (~$((i*250))ms)"; break; fi
  [[ "$i" -eq 40 ]] && fail "read side did not show the ended game: $game"
  sleep 0.25
done

step "the PGN names testuser as White and ends 0-1"
pgn="$(as "$SID_T" "http://$API_HOST/api/games/$GAME/pgn")"
grep -q '\[White "testuser"\]' <<<"$pgn" || fail "PGN White tag wrong: $pgn"
grep -q '\[Result "0-1"\]' <<<"$pgn" || fail "PGN Result tag wrong: $pgn"
echo "ok"

printf '\nAll part-1 checks passed.\n'
