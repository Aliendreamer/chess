#!/bin/bash
# Runs once at initdb time on the PRIMARY (mounted into /docker-entrypoint-initdb.d/).
# Creates the replication role and lets it connect for streaming replication. The official image's
# generated pg_hba.conf only has `host all all all`, and "all" does not match the replication pseudo-db.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator';
EOSQL
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
