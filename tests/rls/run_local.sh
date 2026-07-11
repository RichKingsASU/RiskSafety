#!/usr/bin/env bash
# tests/rls/run_local.sh
# Builds a throwaway Postgres database, applies all migrations + seed, grants the
# Supabase-style app-role privileges, and runs the RLS/invariant assertions.
#
# Usage:
#   PSQL="psql -h /var/run/postgresql -p 5433 -U postgres" tests/rls/run_local.sh
# or set PGHOST/PGPORT/PGUSER and just run it. Requires a reachable Postgres 16
# where the connecting user is a superuser (needed to SET ROLE authenticated).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${RSOS_TEST_DB:-rsos_rls_check}"
PSQL="${PSQL:-psql}"
ADMIN="$PSQL"

echo "==> (re)creating database $DB"
$ADMIN -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB" >/dev/null

echo "==> ensuring Supabase-style roles exist"
$ADMIN -d "$DB" -v ON_ERROR_STOP=1 -c "
do \$\$ begin
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='service_role')  then create role service_role nologin; end if;
end \$\$;" >/dev/null

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  $ADMIN -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "==> applying seed"
$ADMIN -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed/seed.sql" >/dev/null

echo "==> granting app-role privileges (Supabase default), then re-asserting audit append-only"
$ADMIN -d "$DB" -v ON_ERROR_STOP=1 -c "
grant usage on schema public to authenticated, anon;
grant usage on schema app    to authenticated, anon;
grant all    on all tables    in schema public to authenticated;
grant select on all tables    in schema public to anon;
grant execute on all functions in schema app to authenticated, anon;
-- append-only backbone: keep update/delete revoked even after the blanket grant
revoke update, delete on audit_logs from authenticated, anon;" >/dev/null

echo "==> running assertions"
$ADMIN -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/tests/rls/assert.sql"

echo "==> OK"
