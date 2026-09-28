#!/usr/bin/env bash
# Prove studies on the live stack (Part 4, studies): testuser imports a study (and a broken one is refused), saves a
# variation, loses a stale save to a 409, keeps it private from player, shares it, and player reads it and its PGN;
# a finished game becomes a study; the studies are deleted again.
#
#   tools/localdev/verify-part4a.sh
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

step "testuser imports two studies; the one with an illegal move is refused"
imported="$(send "$SID_T" POST -d '{"studies":[
  {"title":"verify ruy","white":"ann","black":"bob","tree":[{"uci":"e2e4","children":[{"uci":"e7e5"}]}]},
  {"title":"verify broken","tree":[{"uci":"e2e5"}]}]}' "http://$API_HOST/api/studies")"
STUDY="$(field id <<<"$imported")"
[[ -n "$STUDY" ]] || fail "no study created: $imported"
grep -q '"refused":\[{"index":1' <<<"$imported" || fail "the broken study was not refused: $imported"
echo "ok ($STUDY)"

step "a variation is saved and replayed by the server; a stale save is a 409"
opened="$(as "$SID_T" "http://$API_HOST/api/studies/$STUDY")"
V="$(num version <<<"$opened")"
saved="$(send "$SID_T" PUT -d "{\"title\":\"verify ruy\",\"version\":$V,\"tree\":[{\"uci\":\"e2e4\",\"children\":[{\"uci\":\"e7e5\"},{\"uci\":\"c7c5\"}]}]}" "http://$API_HOST/api/studies/$STUDY")"
grep -q '"san":"c5"' <<<"$saved" || fail "the variation was not saved: $saved"
[[ "$(code "$SID_T" PUT -d "{\"title\":\"x\",\"version\":$V,\"tree\":[]}" "http://$API_HOST/api/studies/$STUDY")" == "409" ]] \
  || fail "a stale save was not refused"
echo "ok"

step "private: player gets 404; shared: player reads it and its PGN"
[[ "$(code "$SID_P" GET "http://$API_HOST/api/studies/$STUDY")" == "404" ]] || fail "player could read a private study"
send "$SID_T" POST -d '{"shared":true}' "http://$API_HOST/api/studies/$STUDY/share" | grep -q '"shared":true' || fail "share failed"
seen="$(as "$SID_P" "http://$API_HOST/api/studies/$STUDY")"
grep -q '"mine":false' <<<"$seen" || fail "player's view is not read-only: $seen"
as "$SID_P" "http://$API_HOST/api/studies/$STUDY/pgn" | grep -q '1\. e4 e5 (1\.\.\. c5) \*' || fail "the PGN has no variation"
echo "ok"

step "a finished game becomes a study"
INVITE="$(send "$SID_T" POST -d '{"timeControl":"5+3","color":"white"}' "http://$API_HOST/api/invites" | field inviteId)"
GAME="$(send "$SID_P" POST "http://$API_HOST/api/invites/$INVITE/accept" | field gameId)"
for mv in "$SID_T f2f3" "$SID_P e7e5" "$SID_T g2g4" "$SID_P d8h4"; do
  read -r sid uci <<<"$mv"
  [[ "$(code "$sid" POST -d "{\"uci\":\"$uci\"}" "http://$API_HOST/api/games/$GAME/moves")" == "200" ]] || fail "move $uci refused"
done
FROM=""
for _ in $(seq 1 40); do
  FROM="$(send "$SID_P" POST "http://$API_HOST/api/games/$GAME/study" | field id || true)"
  [[ -n "$FROM" ]] && break
  sleep 0.25 # the moves reach the database a moment after the game ends
done
[[ -n "$FROM" ]] || fail "the game did not become a study"
as "$SID_P" "http://$API_HOST/api/studies/$FROM" | grep -q '"san":"Qh4#"' || fail "the study lacks the game's moves"
echo "ok ($FROM)"

step "clean up"
[[ "$(code "$SID_P" DELETE "http://$API_HOST/api/studies/$STUDY")" == "404" ]] || fail "player could delete testuser's study"
[[ "$(code "$SID_T" DELETE "http://$API_HOST/api/studies/$STUDY")" == "204" ]] || fail "delete failed"
[[ "$(code "$SID_P" DELETE "http://$API_HOST/api/studies/$FROM")" == "204" ]] || fail "delete failed"
echo "ok"

printf '\nAll part-4 (studies) checks passed.\n'
