#!/usr/bin/env bash
# Prove member admin against the stack's Keycloak (club-members): player is refused the admin list; testuser (Admin)
# creates a member, who is listed at once, signs in with the temporary password and chooses their own; nobody can
# deactivate themselves or drop their own Admin; an offline member cannot be challenged; deactivating signs the member
# out (the old session is a 401) and Keycloak refuses them; reactivated, they sign in with their own password; reset
# gives a new temporary one. Members cannot be deleted, so each run makes a fresh `verify-<time>` and leaves it
# deactivated.
#
#   tools/localdev/verify-members.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
API_HOST="${API_HOST:-api.chess.localhost}"; EDGE_IP="${EDGE_IP:-127.0.0.1}"
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# Same guarded login as verify-part1.sh; a third argument answers Keycloak's update-password form.
login() {
  local err sid
  err="$(mktemp)"
  if sid="$(SID_ONLY=1 USER_NAME="$1" PASSWORD="$2" NEW_PASSWORD="${3:-}" ./verify-auth.sh 2>"$err" | tail -n1)"; then
    rm -f "$err"
  else
    cat "$err" >&2
    rm -f "$err"
    fail "login as $1 failed — see diagnostics above"
  fi
  [[ -n "$sid" ]] || fail "no session for $1; run verify-auth.sh to see why"
  printf '%s' "$sid"
}
refused() { ! SID_ONLY=1 USER_NAME="$1" PASSWORD="$2" ./verify-auth.sh >/dev/null 2>&1; }

as() { local sid="$1"; shift; curl -sS --resolve "$API_HOST:80:$EDGE_IP" -H "Cookie: mp_sid=$sid" "$@"; }
send() {
  local sid="$1" method="$2"; shift 2
  if [[ " $* " == *" -d "* ]]; then as "$sid" -X "$method" -H 'content-type: application/json' "$@"; else as "$sid" -X "$method" "$@"; fi
}
field() { grep -oE "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }
num() { grep -oE "\"$1\":-?[0-9]+" | head -n1 | cut -d: -f2; }
code() { local sid="$1" method="$2"; shift 2; send "$sid" "$method" -o /dev/null -w '%{http_code}' "$@"; }

NAME="verify-$(date +%s)"
OWN='Verify123!x'

step "log in testuser (Admin) and player"
SID_T="$(login testuser 'Test123!')"
SID_P="$(login player 'Player123!')"
ME_T="$(as "$SID_T" "http://$API_HOST/api/me" | num id)"
[[ "$(code "$SID_P" GET "http://$API_HOST/api/admin/members")" == "403" ]] || fail "player could read the admin members list"
echo "ok"

step "testuser creates $NAME; a second one by that name is refused; it is listed at once"
created="$(send "$SID_T" POST -d "{\"username\":\"$NAME\",\"fullName\":\"Verify Member\"}" "http://$API_HOST/api/admin/members")"
ID="$(num id <<<"$created")"
TEMP="$(field temporaryPassword <<<"$created")"
[[ -n "$ID" && -n "$TEMP" ]] || fail "no member created: $created"
[[ "$(code "$SID_T" POST -d "{\"username\":\"$NAME\",\"fullName\":\"Again\"}" "http://$API_HOST/api/admin/members")" == "409" ]] \
  || fail "a taken username was not refused"
as "$SID_P" "http://$API_HOST/api/members" | grep -q "\"username\":\"$NAME\"" || fail "$NAME is not in the members list"
echo "ok ($ID)"

step "an offline member cannot be challenged"
[[ "$(code "$SID_P" POST -d "{\"opponentId\":$ID,\"timeControl\":\"5+3\",\"color\":\"random\"}" "http://$API_HOST/api/challenges")" == "409" ]] \
  || fail "player could challenge an offline member"
echo "ok"

step "$NAME signs in with the temporary password and chooses their own"
SID_N="$(login "$NAME" "$TEMP" "$OWN")"
as "$SID_N" "http://$API_HOST/api/me" | grep -q "\"id\":$ID" || fail "$NAME's session is not theirs"
echo "ok"

step "testuser cannot deactivate themselves or drop their own Admin"
[[ "$(code "$SID_T" POST "http://$API_HOST/api/admin/members/$ME_T/deactivate")" == "400" ]] || fail "testuser deactivated themselves"
[[ "$(code "$SID_T" PUT -d '{"admin":false}' "http://$API_HOST/api/admin/members/$ME_T/admin")" == "400" ]] \
  || fail "testuser dropped their own Admin"
echo "ok"

step "deactivated: the old session is a 401 and Keycloak refuses the sign-in"
send "$SID_T" POST "http://$API_HOST/api/admin/members/$ID/deactivate" | grep -q '"active":false' || fail "deactivate failed"
[[ "$(code "$SID_N" GET "http://$API_HOST/api/me")" == "401" ]] || fail "$NAME's session survived the deactivation"
refused "$NAME" "$OWN" || fail "a deactivated member could sign in"
echo "ok"

step "reactivated: $NAME signs in with their own password"
send "$SID_T" POST "http://$API_HOST/api/admin/members/$ID/reactivate" | grep -q '"active":true' || fail "reactivate failed"
sleep 1 # Keycloak's quick-login check locks a user signed in twice within a second
SID_N="$(login "$NAME" "$OWN")"
[[ "$(code "$SID_N" GET "http://$API_HOST/api/me")" == "200" ]] || fail "$NAME's new session is refused"
echo "ok"

step "a password reset gives a new temporary password, changed at the next sign-in"
TEMP="$(send "$SID_T" POST "http://$API_HOST/api/admin/members/$ID/reset-password" | field temporaryPassword)"
[[ -n "$TEMP" ]] || fail "no temporary password from the reset"
sleep 1
login "$NAME" "$TEMP" "$OWN-2" >/dev/null
echo "ok"

step "clean up: $NAME stays deactivated"
send "$SID_T" POST "http://$API_HOST/api/admin/members/$ID/deactivate" | grep -q '"active":false' || fail "deactivate failed"
echo "ok"

printf '\nAll club-members checks passed.\n'
