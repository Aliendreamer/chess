#!/usr/bin/env bash
# Manage the Chess local-dev stack (compose file sits next to this script).
# Container-runtime agnostic: uses `docker compose`, `podman compose`, or `docker-compose`,
# whichever is available.
#
#   tools/localdev/stack.sh up          # build + start (detached)
#   tools/localdev/stack.sh down        # stop + remove containers
#   tools/localdev/stack.sh down -v     # also drop volumes (fresh DB/Keycloak)
#   tools/localdev/stack.sh logs [svc]  # follow logs
#   tools/localdev/stack.sh ps
#   tools/localdev/stack.sh restart [svc]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# Pick a compose-capable runtime.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  RUNTIME=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  RUNTIME=(podman compose)
else
  echo "error: need 'docker compose' or 'podman compose' on PATH" >&2
  exit 1
fi

compose() { "${RUNTIME[@]}" -f "$COMPOSE_FILE" "$@"; }

cmd="${1:-up}"
[ $# -gt 0 ] && shift

case "$cmd" in
  up)
    compose up --build -d "$@"
    echo "Stack up via '${RUNTIME[*]}' →"
    echo "  frontend     http://app.chess.localhost"
    echo "  backend api  http://api.chess.localhost"
    echo "  keycloak     http://keycloak.chess.localhost (admin/admin)"
    echo "  redisinsight http://redisinsight.chess.localhost"
    echo "  traefik ui   http://127.0.0.1:${TRAEFIK_DASHBOARD_PORT:-8090}"
    ;;
  down)    compose down "$@" ;;
  restart) compose restart "$@" ;;
  logs)    compose logs -f "$@" ;;
  ps)      compose ps "$@" ;;
  *)
    echo "usage: stack.sh {up|down|restart|logs|ps} [args]" >&2
    exit 1
    ;;
esac
