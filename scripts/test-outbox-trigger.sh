#!/usr/bin/env bash
# Life OS I-P1.5 — life_events outbox + finance bill trigger verification.
#
# Usage:
#   ./scripts/test-outbox-trigger.sh              # structural checks only
#   ./scripts/test-outbox-trigger.sh --smoke      # insert card_bill row + assert event + cleanup
#   ./scripts/test-outbox-trigger.sh --apply-migration   # apply 20260708000000 if missing
#   ./scripts/test-outbox-trigger.sh --apply-migration --smoke
#
# Requires: supabase login (or SUPABASE_ACCESS_TOKEN) for ./scripts/supabase-sql.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/scripts/supabase-sql.sh"
MIGRATION_VERSION="20260708000000"
MIGRATION_FILE="$ROOT/apps/finance/supabase/migrations/${MIGRATION_VERSION}_life_events_and_outbox.sql"
OCCURRENCES_TABLE="finance_expected_occurrences"

APPLY_MIGRATION=false
RUN_SMOKE=false

pass() { echo "✅ $*"; }
fail() { echo "❌ $*"; exit 1; }
info() { echo "ℹ️  $*"; }

usage() {
  cat <<'EOF'
Life OS I-P1.5 outbox verification

  ./scripts/test-outbox-trigger.sh [--apply-migration] [--smoke]

  --apply-migration   Apply apps/finance/supabase/migrations/20260708000000_*.sql
                      and record version in schema_migrations when missing.
  --smoke             Insert a card_bill test row, assert finance.bill_due in life_events,
                      then delete test rows (requires migration + trigger).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply-migration) APPLY_MIGRATION=true ;;
    --smoke) RUN_SMOKE=true ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

sql() {
  local out
  out=$("$SQL" "$1")
  if printf '%s' "$out" | grep -q '"message".*"Failed to run sql query'; then
    echo "$out" >&2
    fail "SQL failed"
  fi
  printf '%s' "$out"
}

sql_file() {
  local out
  out=$("$SQL" -f "$1")
  if printf '%s' "$out" | grep -q '"message".*"Failed to run sql query'; then
    echo "$out" >&2
    fail "SQL file failed: $1"
  fi
  printf '%s' "$out"
}

migration_recorded() {
  sql "select version from supabase_migrations.schema_migrations where version = '${MIGRATION_VERSION}';" \
    | grep -q "$MIGRATION_VERSION"
}

if [[ "$APPLY_MIGRATION" == true ]]; then
  [[ -f "$MIGRATION_FILE" ]] || fail "Migration file missing: $MIGRATION_FILE"
  if migration_recorded; then
    info "Migration ${MIGRATION_VERSION} already recorded — skip apply"
  else
    info "Applying migration ${MIGRATION_VERSION}..."
    sql_file "$MIGRATION_FILE"
    sql "insert into supabase_migrations.schema_migrations (version) values ('${MIGRATION_VERSION}') on conflict do nothing;"
    migration_recorded && pass "Migration ${MIGRATION_VERSION} applied and recorded" \
      || fail "Migration ${MIGRATION_VERSION} not recorded after apply"
  fi
fi

info "I-P1.5 structural checks"

migration_recorded && pass "Migration ${MIGRATION_VERSION} recorded" \
  || fail "Migration ${MIGRATION_VERSION} missing (run with --apply-migration)"

LIFE_EVENTS=$(
  sql "select count(*) from information_schema.tables where table_schema='public' and table_name='life_events';"
)
[[ "$LIFE_EVENTS" == *"1"* ]] && pass "life_events table exists" || fail "life_events table missing"

OCC_TABLE=$(
  sql "select table_name from information_schema.tables where table_schema='public' and table_name in ('finance_expected_occurrences','expected_occurrences') order by case table_name when 'finance_expected_occurrences' then 0 else 1 end limit 1;"
)
if [[ "$OCC_TABLE" == *"finance_expected_occurrences"* ]]; then
  OCCURRENCES_TABLE="finance_expected_occurrences"
elif [[ "$OCC_TABLE" == *"expected_occurrences"* ]]; then
  OCCURRENCES_TABLE="expected_occurrences"
  info "Using legacy table name expected_occurrences"
else
  fail "No expected occurrences table (finance_expected_occurrences / expected_occurrences)"
fi
pass "Occurrences source table: public.${OCCURRENCES_TABLE}"

FUNC=$(
  sql "select count(*) from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname='trg_finance_bill_to_event';"
)
[[ "$FUNC" == *"1"* ]] && pass "trg_finance_bill_to_event() exists" || fail "trigger function missing"

TRIGGER=$(
  sql "select count(*) from pg_trigger t join pg_class c on t.tgrelid=c.oid join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname='${OCCURRENCES_TABLE}' and t.tgname='finance_bill_event_trigger' and not t.tgisinternal;"
)
[[ "$TRIGGER" == *"1"* ]] && pass "finance_bill_event_trigger on ${OCCURRENCES_TABLE}" \
  || fail "finance_bill_event_trigger missing on ${OCCURRENCES_TABLE}"

RLS=$(
  sql "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='life_events' and c.relrowsecurity = true;"
)
[[ "$RLS" == *"1"* ]] && pass "RLS enabled on life_events" || fail "RLS not enabled on life_events"

POLICIES=$(
  sql "select count(*) from pg_policies where schemaname='public' and tablename='life_events';"
)
[[ "$POLICIES" == *"4"* ]] && pass "4 RLS policies on life_events" \
  || fail "expected 4 RLS policies on life_events, got: $POLICIES"

if [[ "$RUN_SMOKE" != true ]]; then
  pass "I-P1.5 structural checks complete (add --smoke for insert/assert/cleanup)"
  exit 0
fi

info "Running outbox smoke test"

USER_ROW=$(
  sql "select id::text from public.core_profiles order by created_at asc limit 1;"
)
USER_ID=$(printf '%s' "$USER_ROW" | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['id'] if rows else '')" 2>/dev/null || true)
[[ -n "$USER_ID" ]] || fail "No core_profiles row for smoke test user_id"

STAMP="$(date -u +%Y%m%d%H%M%S)"
TEST_OCC_ID="lifeos-outbox-smoke-${STAMP}"
TEST_SOURCE_ID="lifeos-smoke-card-${STAMP}"
TEST_DATE="$(date -u -v+30d +%Y-%m-%d 2>/dev/null || date -u -d '+30 days' +%Y-%m-%d)"

info "Smoke user_id=${USER_ID} occurrence_id=${TEST_OCC_ID}"

sql "insert into public.${OCCURRENCES_TABLE} (
  id, user_id, source_type, source_id, label, occurrence_date, expected_amount, state
) values (
  '${TEST_OCC_ID}',
  '${USER_ID}'::uuid,
  'card_bill',
  '${TEST_SOURCE_ID}',
  'Life OS Outbox Smoke Test',
  '${TEST_DATE}'::date,
  500,
  'upcoming'
);"

EVENT_ROW=$(
  sql "select id::text, type, payload->>'occurrence_id' as occurrence_id, status
       from public.life_events
       where user_id = '${USER_ID}'::uuid
         and type = 'finance.bill_due'
         and payload->>'occurrence_id' = '${TEST_OCC_ID}'
       order by created_at desc
       limit 1;"
)

EVENT_ID=$(printf '%s' "$EVENT_ROW" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
if not rows:
    raise SystemExit(1)
row = rows[0]
if row.get('type') != 'finance.bill_due':
    raise SystemExit(2)
if row.get('occurrence_id') != sys.argv[1]:
    raise SystemExit(3)
if row.get('status') != 'pending':
    raise SystemExit(4)
print(row['id'])
" "$TEST_OCC_ID" 2>/dev/null) || fail "life_events row not found or payload mismatch for ${TEST_OCC_ID}"

pass "finance.bill_due event created (id=${EVENT_ID}, status=pending)"

# Non-card_bill control: should NOT create another event for same occurrence id pattern
CONTROL_ID="lifeos-outbox-control-${STAMP}"
sql "insert into public.${OCCURRENCES_TABLE} (
  id, user_id, source_type, source_id, label, occurrence_date, expected_amount, state
) values (
  '${CONTROL_ID}',
  '${USER_ID}'::uuid,
  'cashflow',
  '${TEST_SOURCE_ID}-cf',
  'Life OS Outbox Control (no event)',
  '${TEST_DATE}'::date,
  100,
  'planned'
);"

CONTROL_EVENTS=$(
  sql "select count(*) from public.life_events where payload->>'occurrence_id' = '${CONTROL_ID}';"
)
[[ "$CONTROL_EVENTS" == *"0"* ]] && pass "non-card_bill insert did not emit life_event" \
  || fail "unexpected life_event for cashflow control row"

info "Cleaning up smoke rows"
sql "delete from public.life_events where id = '${EVENT_ID}'::uuid;"
sql "delete from public.${OCCURRENCES_TABLE} where id in ('${TEST_OCC_ID}', '${CONTROL_ID}');"

REMAINING=$(
  sql "select count(*) from public.life_events where payload->>'occurrence_id' in ('${TEST_OCC_ID}', '${CONTROL_ID}');"
)
[[ "$REMAINING" == *"0"* ]] && pass "smoke cleanup complete" || fail "smoke rows remain in life_events"

pass "I-P1.5 outbox smoke test complete"
