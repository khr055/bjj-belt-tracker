#!/usr/bin/env bash
# Loads the migrations into a throwaway database on a Postgres server and runs the access-rule
# tests against it. Needs psql and a server to connect to as a superuser, for example:
#   PGHOST=localhost PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

db="belt_tracker_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db"
trap 'psql -q -d postgres -c "drop database if exists $db with (force)"' EXIT

run() { psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
run supabase/tests/supabase-stub.sql
for migration in supabase/migrations/*.sql; do run "$migration"; done
run supabase/tests/access.test.sql
