#!/usr/bin/env bash
# Smoke-test the backend's cookie-session auth against the running local stack, with curl only:
#   login → Keycloak form → callback → GET /api/me (200) → logout → old cookie → GET /api/me (401).
#
#   tools/localdev/verify-auth.sh                       # via Traefik on 127.0.0.1:80
#   USER_NAME=player PASSWORD='Player123!' tools/localdev/verify-auth.sh
set -euo pipefail

API_HOST="${API_HOST:-api.chess.localhost}"
KC_HOST="${KC_HOST:-keycloak.chess.localhost}"
APP_HOST="${APP_HOST:-app.chess.localhost}"
EDGE_IP="${EDGE_IP:-127.0.0.1}"
USERNAME="${USER_NAME:-testuser}"
PASSWORD="${PASSWORD:-Test123!}"

JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
# *.localhost resolves in browsers, not in curl: pin every host to the edge.
CURL=(curl -sS --resolve "$API_HOST:80:$EDGE_IP" --resolve "$KC_HOST:80:$EDGE_IP" --resolve "$APP_HOST:80:$EDGE_IP" -c "$JAR" -b "$JAR")

# Keycloak treats *.localhost as a secure context (like browsers do) and marks its cookies Secure. curl discards
# Secure cookies received over plain http, so they never reach the jar: harvest them from the response headers
# of the login-form GET and replay them by hand on the POST. Browsers need none of this.
KC_COOKIES=""
kc_cookie_header() { printf '%s' "$KC_COOKIES"; }

step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
status() { "${CURL[@]}" -o /dev/null -w '%{http_code}' "$@"; }

step "anonymous GET /api/me → 401"
code="$(status "http://$API_HOST/api/me")"
[[ "$code" == "401" ]] || fail "expected 401, got $code"
echo "ok ($code)"

step "GET /api/auth/login → 302 to Keycloak with PKCE cookie"
headers="$("${CURL[@]}" -o /dev/null -D - "http://$API_HOST/api/auth/login?returnTo=/games")"
authorize="$(printf '%s' "$headers" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')"
[[ "$authorize" == http://$KC_HOST/* ]] || fail "expected redirect to Keycloak, got: $authorize"
grep -q "mp_pkce" "$JAR" || fail "PKCE cookie not set"
grep -q "code_challenge_method=S256" <<<"$authorize" || fail "no S256 challenge in authorize URL"
echo "ok"

step "Keycloak login form → POST credentials"
form_headers="$(mktemp)"
form="$("${CURL[@]}" -D "$form_headers" "$authorize")"
KC_COOKIES="$(awk 'tolower($1)=="set-cookie:" {sub(/^[^:]*: */, ""); sub(/;.*$/, ""); printf "%s; ", $0}' "$form_headers")"
action="$(printf '%s' "$form" | grep -o 'action="[^"]*"' | head -n1 | sed -E 's/action="([^"]*)"/\1/; s/&amp;/\&/g')"
if [[ -n "${DEBUG:-}" ]]; then
  { echo "--- form GET response headers ---"; cat "$form_headers"; echo "--- cookie jar (domain path name) ---"; sed -E 's/^#HttpOnly_//' "$JAR" | awk '!/^#/ && NF {print $1, $3, $6, ($7 ~ /^TRUE$/ ? "secure" : "")}' ; echo "--- form action ---"; echo "$action"; } >&2
fi
rm -f "$form_headers"
[[ -n "$action" ]] || fail "could not find the login form action"
post_headers="$(mktemp)"; post_body="$(mktemp)"
# No -c here: writing the jar from a session that never loaded it would drop the API's mp_pkce cookie.
curl -sS --resolve "$KC_HOST:80:$EDGE_IP" -b "$(kc_cookie_header)" -o "$post_body" -D "$post_headers" \
  --data-urlencode "username=$USERNAME" --data-urlencode "password=$PASSWORD" --data-urlencode "credentialId=" "$action"
callback="$(awk 'tolower($1)=="location:" {print $2}' "$post_headers" | tr -d '\r')"
if [[ "$callback" != http://$APP_HOST/api/auth/callback?* ]]; then
  echo "Keycloak answered: $(head -n1 "$post_headers")" >&2
  echo "cookies replayed: $(kc_cookie_header | sed -E 's/=[^;]*/=…/g')" >&2
  # Keycloak renders its reason into the page; surface the visible text instead of guessing.
  sed -E 's/<script.*<\/script>//g; s/<[^>]*>/ /g' "$post_body" | tr -s ' \n\t' ' ' | grep -oiE '.{0,60}(error|invalid|expired|cookie|not found|disabled|denied).{0,80}' | head -n4 >&2
  rm -f "$post_headers" "$post_body"
  fail "expected redirect to the app callback, got: ${callback:-<none>}"
fi
rm -f "$post_headers" "$post_body"
echo "ok → $callback"

step "callback (forwarded to the API host, as the BFF would) → 302 to app with session cookie"
query="${callback#*\?}"
cb_headers="$(mktemp)"; cb_body="$(mktemp)"
"${CURL[@]}" -o "$cb_body" -D "$cb_headers" "http://$API_HOST/api/auth/callback?$query"
location="$(awk 'tolower($1)=="location:" {print $2}' "$cb_headers" | tr -d '\r')"
if [[ "$location" != "http://$APP_HOST/games" ]]; then
  { echo "API answered: $(head -n1 "$cb_headers")"; head -c 600 "$cb_body"; echo; } >&2
  rm -f "$cb_headers" "$cb_body"
  fail "expected redirect to http://$APP_HOST/games, got: ${location:-<none>}"
fi
rm -f "$cb_headers" "$cb_body"
sid="$(awk '$6=="mp_sid" {print $7}' "$JAR")"
[[ -n "$sid" ]] || fail "mp_sid cookie not set"
echo "ok (mp_sid=${sid:0:8}…)"

step "GET /api/me with session → 200 + identity"
me="$("${CURL[@]}" -w '\n%{http_code}' "http://$API_HOST/api/me")"
code="${me##*$'\n'}"; body="${me%$'\n'*}"
[[ "$code" == "200" ]] || fail "expected 200, got $code: $body"
grep -q '"subject"' <<<"$body" || fail "no subject in /api/me: $body"
echo "ok: $body"

step "logout → 302 to Keycloak end-session"
loc="$("${CURL[@]}" -o /dev/null -D - "http://$API_HOST/api/auth/logout" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')"
[[ "$loc" == http://$KC_HOST/* ]] || fail "expected redirect to Keycloak logout, got: ${loc:-<none>}"
echo "ok → $loc"

step "REVOCATION: reuse the old mp_sid → 401"
code="$(curl -sS --resolve "$API_HOST:80:$EDGE_IP" -o /dev/null -w '%{http_code}' -H "Cookie: mp_sid=$sid" "http://$API_HOST/api/me")"
[[ "$code" == "401" ]] || fail "revoked session still accepted: $code"
echo "ok ($code)"

printf '\nAll auth checks passed.\n'
