# Local Postgres for the Chess dev stack: the major version the cluster runs, plus the two
# extensions the cluster image carries (pg_cron, pg_partman). Mirrors
# docker.io/aliendreamer/postgres:current, which is likewise a Postgres 18 base with these
# extensions added.
#
# Debian-based rather than Alpine on purpose: there is no pg_partman package for Alpine, so the previous
# postgres:18-alpine image cannot grow the extension. Switching base means an existing pgdata volume must
# be recreated — a data directory initialised under musl and then read under glibc can order text indexes
# differently, which is not worth risking even on a throwaway database.
#
# The extensions exist here so the partitioning behaviour prod relies on can be EXERCISED locally rather
# than inferred. Nothing in the application calls either of them at runtime: the integration suite still
# runs a plain postgres image, and a stack that predates this file still works.
FROM postgres:18

# Both packages come from the PGDG repository the official image already configures.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-18-cron \
        postgresql-18-partman; \
    rm -rf /var/lib/apt/lists/*
