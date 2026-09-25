#!/usr/bin/env bash
# Manage the Chess local-dev stack (compose file sits next to this script).
# Container-runtime agnostic: uses `docker compose`, `podman compose`, or `docker-compose`,
# whichever is available.
#
#   tools/localdev/stack.sh up             # build + start (detached)
#   tools/localdev/stack.sh up --cluster   # same, plus the second Akka node (backend-2, 'cluster' profile)
#   tools/localdev/stack.sh down           # stop + remove containers, every profile included
#   tools/localdev/stack.sh down -v        # also drop volumes (fresh DB/Keycloak)
#   tools/localdev/stack.sh logs [svc]     # follow logs (backend-2 included)
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
# Every profile at once: `down` and `ps` must see backend-2 even when it was started with --cluster,
# otherwise a plain `down` leaves it running on its own.
all_profiles() { compose --profile '*' "$@"; }

cmd="${1:-up}"
[ $# -gt 0 ] && shift

case "$cmd" in
  up)
    profile=()
    if [ "${1:-}" = "--cluster" ]; then
      profile=(--profile cluster)
      shift
    fi
    compose "${profile[@]}" up --build -d "$@"
    echo "Stack up via '${RUNTIME[*]}' →"
    echo "  frontend     http://app.chess.localhost"
    echo "  backend api  http://api.chess.localhost"
    echo "  keycloak     http://keycloak.chess.localhost (admin/admin)"
    echo "  redisinsight http://redisinsight.chess.localhost"
    echo "  console      http://console.chess.localhost (Redpanda)"
    echo "  postgres     127.0.0.1:5432 primary · 127.0.0.1:5433 replica (chess/chess)"
    echo "  redpanda     127.0.0.1:19092 (kafka api)"
    echo "  traefik ui   http://127.0.0.1:${TRAEFIK_DASHBOARD_PORT:-8090}"
    if [ ${#profile[@]} -gt 0 ]; then
      echo "  cluster      backend-2 is up (second Akka node)"
    else
      echo "  cluster mode: tools/localdev/stack.sh up --cluster adds a second Akka node (backend-2)"
    fi
    ;;
  down)    all_profiles down "$@" ;;
  restart) all_profiles restart "$@" ;;
  logs)    all_profiles logs -f "$@" ;;
  ps)      all_profiles ps "$@" ;;
  *)
    echo "usage: stack.sh {up|down|restart|logs|ps} [args]" >&2
    exit 1
    ;;
esac
