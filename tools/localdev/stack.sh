#!/usr/bin/env bash
# Manage the Chess local-dev stack (compose file sits next to this script).
# Container-runtime agnostic: uses `docker compose`, `podman compose`, or `docker-compose`,
# whichever is available.
#
#   tools/localdev/stack.sh up             # build + start (detached)
#   tools/localdev/stack.sh up --cluster   # same, plus the second Akka node (backend-2, 'cluster' profile)
#   tools/localdev/stack.sh up --tail-sampling  # the collectors as in production: gateway + 2 samplers (combinable)
#   tools/localdev/stack.sh down           # stop + remove containers, every profile included
#   tools/localdev/stack.sh down -v        # also drop volumes (fresh DB/Keycloak)
#   tools/localdev/stack.sh logs [svc]     # follow logs (backend-2 included)
#   tools/localdev/stack.sh ps
#   tools/localdev/stack.sh restart [svc]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
SAMPLING_FILE="$SCRIPT_DIR/docker-compose.tail-sampling.yml"

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
# Every profile and the sampling override at once: `down` and `ps` must see backend-2 and the samplers even when they
# were started with --cluster or --tail-sampling, otherwise a plain `down` leaves them running on their own.
all_profiles() { "${RUNTIME[@]}" -f "$COMPOSE_FILE" -f "$SAMPLING_FILE" --profile '*' "$@"; }

cmd="${1:-up}"
[ $# -gt 0 ] && shift

case "$cmd" in
  up)
    profile=()
    files=(-f "$COMPOSE_FILE")
    while [ $# -gt 0 ]; do
      case "$1" in
        --cluster) profile=(--profile cluster); shift ;;
        # The sampling setup (tail-sampling): a gateway collector and two samplers instead of the single collector.
        --tail-sampling) files+=(-f "$SAMPLING_FILE"); shift ;;
        *) break ;;
      esac
    done
    # --remove-orphans: going back from --tail-sampling to the plain stack removes the samplers.
    "${RUNTIME[@]}" "${files[@]}" "${profile[@]}" up --build -d --remove-orphans "$@"
    echo "Stack up via '${RUNTIME[*]}' →"
    echo "  frontend     http://app.chess.localhost"
    echo "  backend api  http://api.chess.localhost"
    echo "  keycloak     http://keycloak.chess.localhost (admin/admin)"
    echo "  redisinsight http://redisinsight.chess.localhost"
    echo "  console      http://console.chess.localhost (Redpanda)"
    echo "  mail         http://mail.chess.localhost (Mailpit: every mail the stack sends)"
    echo "  grafana      http://grafana.chess.localhost (admin/Admin123! edits · viewer/Viewer123! views)"
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
