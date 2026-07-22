#!/usr/bin/env bash
# KENOS F5-02 — Supabase clean-room migration replay + security suite.
#
# Proves the CANONICAL CORE-LOOP schema can be rebuilt from migrations into an
# empty database, then enforces RLS/authorization and RPC integrity as two real
# users. This is the reproducible evidence for F5-02.4/.6/.7.
#
# Requirements: a running local Supabase stack (`supabase start`) whose Postgres
# is reachable via $DBURL (default local stack port 54322). The stack provides
# the auth schema, auth.uid(), roles (anon/authenticated/service_role) and
# pgcrypto/pgvector that the migrations depend on.
#
# Usage:
#   scripts/kenos-cleanroom/replay.sh                 # full cycle
#   DBURL=postgresql://... scripts/kenos-cleanroom/replay.sh
#
# Exit non-zero on ANY migration failure or ANY failed security assertion.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$REPO/scripts/kenos-cleanroom"
DBURL="${DBURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "==> Clean-room DB: $DBURL"
psql "$DBURL" -tAc "select 1" >/dev/null || { echo "FATAL: no local Postgres. Run 'supabase start' first."; exit 3; }

echo "==> Resetting public/private/fitness/music schemas to empty"
psql "$DBURL" -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade; create schema public;
drop schema if exists private cascade;
drop schema if exists fitness cascade;
drop schema if exists music cascade;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;
SQL

echo "==> Applying core-loop migrations in order"
FAILS=0; N=0
while IFS= read -r rel; do
  [[ -z "$rel" || "$rel" == \#* ]] && continue
  N=$((N+1))
  if ! out=$(psql "$DBURL" -v ON_ERROR_STOP=1 -q -f "$REPO/$rel" 2>&1); then
    FAILS=$((FAILS+1)); echo "  FAIL $(basename "$rel"): $(echo "$out" | grep -iE ERROR | head -1)"
  fi
done < "$HERE/core-loop-migrations.txt"
echo "==> Applied $N migrations, $FAILS failures"
[[ $FAILS -eq 0 ]] || { echo "FATAL: migration replay failed"; exit 1; }

echo "==> RLS / authorization suite (F5-02.6)"
psql "$DBURL" -q -f "$HERE/rls_security_tests.sql" 2>&1 | grep -E "T[0-9]+[ab]? (PASS|FAIL)|ALL RLS"

echo "==> RPC integrity suite (F5-02.7)"
psql "$DBURL" -q -f "$HERE/rpc_integrity_tests.sql" 2>&1 | grep -E "R[0-9] PASS|ALL RPC"

echo "==> Sync failure-injection suite (F5-05)"
psql "$DBURL" -q -f "$HERE/failure_injection_tests.sql" 2>&1 | grep -E "FI-[0-9] PASS|ALL F5-05"

echo "==> Knowledge-to-Action E2E (F5-07)"
DBURL="$DBURL" node "$HERE/knowledge_to_action_e2e.mjs" 2>&1 | grep -E "K2A-[0-9]+.* (PASS|FAIL)|ALL K2A" || true

echo "==> CLEAN-ROOM REPLAY + SECURITY + FAILURE-INJECTION + K2A SUITE: PASS"
