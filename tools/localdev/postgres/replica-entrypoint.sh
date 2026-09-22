#!/bin/bash
# Entrypoint for the REPLICA: on an empty data dir, seed it from the primary with pg_basebackup -R
# (writes primary_conninfo + standby.signal), then hand over to the stock entrypoint as a hot standby.
# Re-runs with an existing data dir skip the seed; `stack.sh down -v` re-seeds from scratch.
set -euo pipefail
: "${PGDATA:?PGDATA must be set by the image}"
PRIMARY_HOST="${PRIMARY_HOST:-postgres}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "replica: empty data dir, seeding from $PRIMARY_HOST…"
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  until pg_isready -h "$PRIMARY_HOST" -U replicator -d postgres >/dev/null 2>&1; do
    echo "replica: waiting for primary…"; sleep 2
  done
  PGPASSWORD=replicator gosu postgres pg_basebackup \
    -h "$PRIMARY_HOST" -U replicator -D "$PGDATA" -Fp -Xs -R -P
  echo "replica: seeded."
fi

# hot_standby=on so the replica accepts read-only connections while replaying WAL.
exec docker-entrypoint.sh postgres -c hot_standby=on "$@"
