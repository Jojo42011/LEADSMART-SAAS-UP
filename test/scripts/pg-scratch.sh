#!/usr/bin/env bash
# A throwaway Postgres for tests that must run against a real database.
#
# The rate limiter's whole purpose is to behave correctly when many
# requests arrive at once, and that property lives in Postgres, not in the
# TypeScript. Mocking it proved the shape of the code and would have
# shipped a limiter that allowed 40 of 40 requests against a limit of 5.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/var/tmp/ascent-pgdata}
PORT=${PORT:-55432}

case "${1:-start}" in
  start)
    if [ ! -d "$PGDATA/base" ]; then
      mkdir -p "$PGDATA"; chown -R postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
      su postgres -c "$PGBIN/initdb -D $PGDATA -U ascent --auth=trust" >/dev/null
    fi
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORT -k /var/tmp' -l $PGDATA/log start" >/dev/null 2>&1 || true
    sleep 2
    echo "postgresql://ascent@localhost:$PORT/postgres"
    ;;
  stop)
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true
    ;;
esac
