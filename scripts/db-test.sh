#!/usr/bin/env bash
#
# Builds a throwaway PostgreSQL database, applies every migration and the demo
# seed, then runs the Row Level Security test suite against it.
#
# This does NOT need a Supabase project: supabase/tests/00_local_harness.sql
# stubs the parts of Supabase the migrations depend on (the auth and storage
# schemas, auth.uid(), and the anon/authenticated/service_role roles).
#
# Usage:
#   npm run db:test                       # uses a local postgres on the default socket
#   DATABASE_URL=postgres://... npm run db:test
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-askcenla_test}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL")
  echo "Using DATABASE_URL"
else
  PSQL=(psql -d "$DB_NAME")
  echo "Rebuilding local database '$DB_NAME'"
  dropdb --if-exists "$DB_NAME"
  createdb "$DB_NAME"
fi

run() {
  echo "  → $(basename "$1")"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$1"
}

echo "Applying harness + migrations + seed"
run "$ROOT/supabase/tests/00_local_harness.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  run "$migration"
done
run "$ROOT/supabase/seed.sql"

echo
echo "Running RLS test suite"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/01_rls_test.sql"
