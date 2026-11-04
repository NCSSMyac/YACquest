#!/usr/bin/env bash
# Runs the YACquest database tests against a throwaway local Postgres 16.
#
#   supabase/tests/run_tests.sh            # uses a temp dir
#   PGWORK=/some/dir supabase/tests/run_tests.sh
#
# Steps: start cluster → fresh DB → stubs.sql (fake Supabase auth/storage) →
# all migrations → all migrations again (re-run safety) → tests.sql →
# all migrations on the populated DB → stop cluster. Exits non-zero on any failure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS=("$HERE"/../migrations/*.sql)
migrate() { for m in "${MIGRATIONS[@]}"; do "${PSQL[@]}" -d yac_test -f "$m" >/dev/null; done; }
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGWORK="${PGWORK:-$(mktemp -d)}"
PGPORT="${PGPORT:-55432}"
DATA="$PGWORK/data"
SOCK="$PGWORK/sock"

# initdb refuses to run as root; use the postgres OS user in that case.
if [ "$(id -u)" = "0" ]; then
  AS=(runuser -u postgres --)
else
  AS=()
fi

mkdir -p "$PGWORK" "$SOCK"
chmod 777 "$PGWORK" "$SOCK"
# the postgres user must be able to reach the work dir
d="$PGWORK"; while [ "$d" != "/" ]; do chmod o+x "$d" 2>/dev/null || true; d="$(dirname "$d")"; done

cleanup() {
  "${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$DATA"
"${AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust --no-sync -E UTF8 --locale=C.UTF-8 >/dev/null
"${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -l "$PGWORK/pg.log" -w \
  -o "-p $PGPORT -k $SOCK -c listen_addresses='' -c fsync=off -c timezone=UTC" start >/dev/null

PSQL=(env PGOPTIONS=--client-min-messages=warning psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PGPORT" -U postgres)

echo "== fresh database"
"${PSQL[@]}" -d postgres -c "drop database if exists yac_test" -c "create database yac_test" >/dev/null

echo "== stubs.sql (fake Supabase auth + storage)"
"${PSQL[@]}" -d yac_test -f "$HERE/stubs.sql" >/dev/null

echo "== all migrations on a fresh DB"
migrate

echo "== all migrations again (must be safe to re-run)"
migrate
"${PSQL[@]}" -d yac_test -tA -c "select count(*) from cycles" | grep -qx 1 || { echo "re-run created a second cycle"; exit 1; }

echo "== tests.sql"
env PGOPTIONS= psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PGPORT" -U postgres -d yac_test -f "$HERE/tests.sql" 2>"$PGWORK/notices.log" | tee "$PGWORK/result.log" || {
  echo "---- last notices ----"; tail -n 15 "$PGWORK/notices.log"; exit 1;
}
grep -c 'NOTICE:  ok - ' "$PGWORK/notices.log" | xargs -I{} echo "   ({} 'ok' notices)"

echo "== all migrations once more on the populated DB"
migrate

echo "ALL GOOD"
