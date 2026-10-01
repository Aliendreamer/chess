#!/usr/bin/env bash
# Prove Part 1's first real game on the live stack: two Keycloak logins → testuser invites (white) → player
# accepts → the fool's mate over the API → the read side (replica) shows the game ended 0-1 with a PGN that
# names testuser as White. Also a quick matchmaking pairing on 5+3.
#
#   tools/localdev/verify-part1.sh
#   tools/localdev/verify-part1.sh --cluster   # also: a game survives losing backend-1 (stack up with --cluster)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
compose() { docker compose -f docker-compose.yml "$@"; }
CLUSTER=0; [[ "${1:-}" == "--cluster" ]] && CLUSTER=1
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
# num <name>: the first numeric value of a JSON field.
num() { grep -oE "\"$1\":-?[0-9]+" | head -n1 | cut -d: -f2; }
# invite_game: testuser invites as white on 5+3, player accepts; prints the game id.
invite_game() {
  local inv
  inv="$(post "$SID_T" -d '{"timeControl":"5+3","color":"white"}' "http://$API_HOST/api/invites" | field inviteId)"
  [[ -n "$inv" ]] || fail "invite not created"
  post "$SID_P" "http://$API_HOST/api/invites/$inv/accept" | field gameId
}
# move <sid> <game> <uci>: one move that must be accepted.
move() {
  local code
  code="$(post "$1" -o /dev/null -w '%{http_code}' -d "{\"uci\":\"$3\"}" "http://$API_HOST/api/games/$2/moves")"
  [[ "$code" == "200" ]] || fail "move $3 answered $code"
}

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

if [[ "$CLUSTER" == "1" ]]; then
  # Games are spread over 50 shards on two nodes, and nothing says which node holds which. So: several games, and
  # their clocks tell afterwards. A game recovered from the journal gets its side to move's clock back as of the last
  # event (D14); a game that stayed on the survivor has kept counting down through the pause below.
  GAMES=6; PAUSE=12
  step "cluster: $GAMES games at 5+3 with running clocks (1.e4 e5 each)"
  declare -a CG SEQ FEN BLACK_MS WHITE_MS
  for n in $(seq 0 $((GAMES - 1))); do
    CG[n]="$(invite_game)"
    [[ -n "${CG[n]}" ]] || fail "no game for the cluster check"
    move "$SID_T" "${CG[n]}" e2e4
    move "$SID_P" "${CG[n]}" e7e5
  done
  for n in $(seq 0 $((GAMES - 1))); do
    v="$(as "$SID_T" "http://$API_HOST/api/games/${CG[n]}/live")"
    SEQ[n]="$(num seq <<<"$v")"; FEN[n]="$(field fen <<<"$v")"
    BLACK_MS[n]="$(num blackMs <<<"$v")"; WHITE_MS[n]="$(num whiteMs <<<"$v")"
  done
  echo "ok"

  step "cluster: SIGTERM backend-1's app, wait until it is gone and out of rotation"
  # Same stop as verify-part0.sh --cluster: PID 1 in the dev image is `dotnet watch`, which ignores SIGTERM, so
  # signal the app itself (a real deploy's SIGTERM reaches it); `dotnet watch` then idles until `restart`.
  compose exec -T backend sh -c "pkill -TERM -f '^/src/bin/Debug/net10.0/Chess.Backend'" \
    || fail "could not signal the backend-1 app process"
  # While it shuts down gracefully it still answers, which would prove nothing: wait for the process to exit.
  for i in $(seq 1 30); do
    compose exec -T backend sh -c "! pgrep -f '^/src/bin/Debug/net10.0/Chess.Backend'" >/dev/null 2>&1 && break
    [[ "$i" -eq 30 ]] && fail "backend-1's app did not exit"
    sleep 1
  done
  sleep "$PAUSE"
  # The edge (traefik/dynamic.yml) health-checks every 5 s and round-robins, so a dead node gets every other request
  # until it is marked down; four answers in a row mean only the survivor is left.
  ok=0
  for i in $(seq 1 60); do
    if [[ "$(as "$SID_T" "http://$API_HOST/api/me" -o /dev/null -w '%{http_code}' 2>/dev/null)" == "200" ]]; then
      ok=$((ok + 1))
    else
      ok=0
    fi
    [[ "$ok" -ge 4 ]] && break
    [[ "$i" -eq 60 ]] && fail "the edge never settled on the survivor"
    sleep 0.5
  done
  echo "ok"

  step "cluster: every game answers from the survivor with its seq, position and waiting clock"
  MOVED=""; stayed=0
  for n in $(seq 0 $((GAMES - 1))); do
    after="$(as "$SID_T" "http://$API_HOST/api/games/${CG[n]}/live")"
    [[ "$(num seq <<<"$after")" == "${SEQ[n]}" ]] || fail "game ${CG[n]} lost its seq: $after"
    [[ "$(field fen <<<"$after")" == "${FEN[n]}" ]] || fail "game ${CG[n]} changed position: $after"
    [[ "$(num blackMs <<<"$after")" == "${BLACK_MS[n]}" ]] || fail "game ${CG[n]}: the waiting clock changed: $after"
    w="$(num whiteMs <<<"$after")"
    if (( w > WHITE_MS[n] - 6000 )); then
      [[ -z "$MOVED" ]] && MOVED="${CG[n]}"   # recovered from the journal: White's clock is back (D14)
    elif (( w <= WHITE_MS[n] - PAUSE * 1000 )); then
      stayed=$((stayed + 1))                   # was already on the survivor: its clock kept running
    else
      fail "game ${CG[n]}: white's clock is neither recovered nor running: $w (was ${WHITE_MS[n]})"
    fi
  done
  [[ -n "$MOVED" ]] || fail "all $GAMES games happened to live on backend-2 (1 in 64); run again"
  echo "ok ($((GAMES - stayed)) recovered on the survivor, $stayed already there)"

  step "cluster: play on in a recovered game — white's clock runs, then white resigns"
  moved="$(post "$SID_T" -d '{"uci":"g1f3"}' "http://$API_HOST/api/games/$MOVED/moves")"
  [[ "$(num ply <<<"$moved")" == "3" ]] || fail "the move after the failover was not taken: $moved"
  (( $(num whiteMs <<<"$moved") < 303000 )) || fail "white's clock did not run: $moved"
  [[ "$(post "$SID_T" -o /dev/null -w '%{http_code}' "http://$API_HOST/api/games/$MOVED/resign")" == "200" ]] \
    || fail "resign was refused"
  for i in $(seq 1 40); do
    game="$(as "$SID_P" "http://$API_HOST/api/games/$MOVED")"
    if grep -q '"result":"0-1"' <<<"$game" && grep -q '"reason":"resignation"' <<<"$game"; then echo "ok"; break; fi
    [[ "$i" -eq 40 ]] && fail "read side did not show the resignation: $game"
    sleep 0.25
  done

  step "cluster: restart backend-1"
  compose restart backend >/dev/null 2>&1
  echo "ok"
fi

printf '\nAll part-1 checks passed.\n'
