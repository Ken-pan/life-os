#!/usr/bin/env bash
# Life OS P0 identity verification — run via CLI + Supabase MCP-equivalent SQL API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iueozzuctstwvzbcxcyh}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null || true)}"

pass() { echo "✅ $*"; }
fail() { echo "❌ $*"; exit 1; }
info() { echo "ℹ️  $*"; }

info "Project ref: $PROJECT_REF"

# ── 1. Migration recorded ──
"$ROOT/scripts/supabase-sql.sh" "select version from supabase_migrations.schema_migrations where version = '20260707230000';" \
  | grep -q 20260707230000 && pass "Migration 20260707230000 recorded" || fail "Migration 20260707230000 missing"

# ── 2. Core tables + RLS ──
TABLES=$("$ROOT/scripts/supabase-sql.sh" "select count(*) from information_schema.tables where table_schema='public' and table_name in ('core_profiles','core_user_app_settings');")
[[ "$TABLES" == *"2"* ]] && pass "core_profiles + core_user_app_settings exist" || fail "core tables missing"

RLS=$("$ROOT/scripts/supabase-sql.sh" "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('core_profiles','core_user_app_settings') and c.relrowsecurity = true;")
[[ "$RLS" == *"2"* ]] && pass "RLS enabled on both core tables" || fail "RLS not enabled"

POLICIES=$("$ROOT/scripts/supabase-sql.sh" "select count(*) from pg_policies where schemaname='public' and tablename in ('core_profiles','core_user_app_settings');")
[[ "$POLICIES" == *"6"* ]] && pass "6 RLS policies on core tables" || fail "expected 6 RLS policies, got: $POLICIES"

# ── 3. Auth triggers ──
TRIGGERS=$("$ROOT/scripts/supabase-sql.sh" "select count(*) from pg_trigger t join pg_class c on t.tgrelid=c.oid join pg_namespace n on c.relnamespace=n.oid where n.nspname='auth' and c.relname='users' and t.tgname='core_on_auth_user_created' and not t.tgisinternal;")
[[ "$TRIGGERS" == *"1"* ]] && pass "core_on_auth_user_created trigger active" || fail "core trigger missing"

# ── 4. Profile backfill ──
PROFILES=$("$ROOT/scripts/supabase-sql.sh" "select count(*) from public.core_profiles;")
info "core_profiles rows: $PROFILES"
[[ "$PROFILES" != *"0"* ]] && pass "core_profiles backfilled" || fail "no profiles"

# ── 5. Auth redirect URLs (Management API) ──
if [[ -n "$TOKEN" ]]; then
  URI_LIST=$(curl -sS -H "Authorization: Bearer $TOKEN" "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('uri_allow_list',''))")
  for host in finance.kenos.space music.kenos.space planner.kenos.space fitness.kenos.space portal.kenos.space \
              financeos-ken.netlify.app musicos-ken.netlify.app planneros-ken.netlify.app fitnessos-ken.netlify.app \
              portal-ken.netlify.app; do
    echo "$URI_LIST" | grep -q "$host" && pass "redirect URL contains $host" || fail "redirect URL missing $host"
  done
  echo "$URI_LIST" | grep -q 'kenos.space/\*\*' && info "site_url left as localhost (P0 OK — no apex portal yet)" || true
else
  info "Skip auth redirect check (no Supabase token)"
fi

# ── 6. Netlify env (optional — needs netlify login) ──
if [[ "${VERIFY_SKIP_NETLIFY:-}" == "1" ]]; then
  info "Skip Netlify env check (VERIFY_SKIP_NETLIFY=1)"
elif command -v netlify >/dev/null && netlify api listSites >/dev/null 2>&1; then
  declare -A SITE_IDS=(
    [planneros-ken]=82a6cadc-03f9-443c-85f7-26bd4a90f83f
    [fitnessos-ken]=0394cf19-7fb7-4fea-81d7-d4a9d025fab3
    [financeos-ken]=fc92f305-8dcf-46c3-82f5-ef511597df1c
    [musicos-ken]=83dfdf84-095a-4b8a-955d-106d046a314b
    [portal-ken]=a5df5c3e-0e42-4f82-aca8-8d6802da357f
  )
  for site in "${!SITE_IDS[@]}"; do
    PRESENT=$(netlify env:list --site "$site" --json 2>/dev/null \
      | python3 -c "import sys,json; keys={'PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_ANON_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'}; d=json.load(sys.stdin); print(len([k for k in d if k in keys]))")
    [[ "$PRESENT" == "4" ]] && pass "Netlify $site: 4/4 Supabase env vars" || fail "Netlify $site: only $PRESENT/4 Supabase env vars"
  done
else
  info "Skip Netlify env check (CLI not authenticated)"
fi

pass "P0 automated checks complete. Manual: login on each custom domain and confirm same profile UUID."
