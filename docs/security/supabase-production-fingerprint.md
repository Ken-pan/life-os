# Production Schema Fingerprint — PROD-ROLL-1 → PROD-ROLL-1.5

Date: 2026-07-10
Project: **Life OS** (`iueozzuctstwvzbcxcyh`, us-east-2)
Baseline:

- `apps/finance/supabase/migrations/20260710160000_life_os_baseline.sql`
- `apps/finance/supabase/migrations/20260710161000_fitness_signup_membership.sql`

## Executive Summary (post PROD-ROLL-1.5)

| Item | Pre-rollout | Post-rollout |
|------|-------------|--------------|
| Schema export | **PASS** | **PASS** |
| Migration history | **NOT APPLIED** | **APPLIED** (`20260710160000`, `20260710161000`) |
| Table / function parity | **MATCH** | **MATCH** |
| App-table RLS | **MATCH** | **MATCH** |
| Auth signup trigger | **BLOCKER** | **MATCH** — fitness-only settings + `app_memberships` insert |
| Storage policies | **BLOCKER** | **MATCH** — `public_select` removed; `select_own` + `has_app_access` |
| Ken memberships | 7× owner/active | **UNCHANGED** |
| **PROD-ROLL-2 ready?** | **NO** | **YES** (pending frontend deploy + prod smoke) |

### Critical correction: previous “applied” migration list was staging

Earlier `supabase migration list --linked` showed both baseline migrations as remote-applied because `apps/finance` was linked to **Life OS Staging 2** (`dsiloxzjnsvjnhbruibl`), not production.

After re-linking to production (`iueozzuctstwvzbcxcyh`):

```txt
local 20260710160000 | remote (empty)
local 20260710161000 | remote (empty)
remote-only legacy chain: 43 versions ending at 20260709201500
```

`supabase_migrations.schema_migrations` on production contains **zero** rows for `>= 20260710160000`.

**Conclusion:** migration list “applied” on staging was real; on production it was a **false positive caused by wrong project link**.

---

## 1. Export commands run (read-only)

```bash
mkdir -p apps/finance/.tmp/prod-fingerprint
supabase link --project-ref iueozzuctstwvzbcxcyh --workdir apps/finance

supabase db dump --linked --schema public,private,fitness,music \
  --file .tmp/prod-fingerprint/public-private.sql --workdir apps/finance

supabase db dump --linked --schema storage \
  --file .tmp/prod-fingerprint/storage.sql --workdir apps/finance

supabase db dump --linked --schema auth \
  --file .tmp/prod-fingerprint/auth.sql --workdir apps/finance
```

`supabase db diff --linked --schema auth,storage` failed locally (Docker shadow DB port `54320` already allocated). Storage/auth parity was completed via schema dumps + live SQL queries instead.

Artifacts (gitignored path — **do not commit**):

- `apps/finance/.tmp/prod-fingerprint/public-private.sql` (~6k lines)
- `apps/finance/.tmp/prod-fingerprint/storage.sql`
- `apps/finance/.tmp/prod-fingerprint/auth.sql`

---

## 2. Object-level parity matrix

### MATCH — fully aligned with baseline

| Object class | Prod | Baseline | Notes |
|--------------|------|----------|-------|
| Tables (`public` / `private` / `fitness` / `music`) | 55 | 55 | No prod-only or baseline-only tables |
| `private.*` functions | 7 | 7 | Includes `has_app_access`, `user_has_app_access`, etc. |
| `public.app_memberships` DDL | ✓ | ✓ | Columns, constraints, indexes match |
| `app_memberships` RLS | ✓ | ✓ | Policy `Users read own app memberships` present |
| `fitness_*` RLS policies | 18 | 18 | All include `has_app_access('fitness')` |
| `planner_*` RLS policies | 27 | 27 | All include `has_app_access('planner')` |
| `finance_*` RLS policies | 87 | 87 | All include `has_app_access('finance')` |
| `private.fitness_handle_new_user` | ✓ | ✓ | Creates fitness profile + user state |
| `private.music_handle_new_user` | ✓ | ✓ | Creates music profile + user state |
| Auth triggers on `auth.users` | 3 | 3 | `core_`, `fitness_`, `music_on_auth_user_created` |
| `music_covers_public_select` | ✓ | ✓ | Intentionally public cover art |

### BLOCKER — must change before friend invite / PROD-ROLL-2

| Object | Production observed | Baseline expected | Risk |
|--------|---------------------|-------------------|------|
| `private.core_handle_new_user` | Inserts `core_user_app_settings` for **all 6 apps** (`finance`, `fitness`, `planner`, `music`, `portal`, `home`); **does not** insert `app_memberships` | Inserts settings **only for `fitness`**; inserts `app_memberships (fitness, member, active)`; ignores malicious metadata | New signups get implicit multi-app settings rows without membership gate; signup isolation from `SEC-STAGE-1` **not** enforced |
| Migration `20260710161000_fitness_signup_membership.sql` | **Not applied** | Replaces `core_handle_new_user` + rebinds trigger | Auth boundary unchanged on production |
| `finance_purchase_images_public_select` | **Present** — `SELECT` on entire `finance-purchase-images` bucket, no auth | **Dropped**; replaced by `finance_purchase_images_select_own` + `has_app_access('finance')` | Receipts / purchase images may be publicly readable by URL |
| `finance_purchase_images_select_own` | **Absent** | Present with folder + membership check | No membership-gated read path |
| `finance-purchase-images` bucket `public` flag | `true` | `false` (baseline `insert … on conflict`) | Bucket-level public flag still legacy |

### SECURITY IMPROVEMENT — baseline hardens beyond production

| Object | Production | Baseline delta |
|--------|------------|----------------|
| `finance_purchase_images_{insert,update,delete}_own` | Folder ownership only | Adds `private.has_app_access('finance')` |
| `music_audio_{select,insert,update,delete}_own` | Folder ownership only | Adds `private.has_app_access('music')` |
| `music_covers_{insert,update,delete}_own` | Folder ownership only | Adds `private.has_app_access('music')` |

### EXPECTED DIFFERENCE — acceptable production legacy

| Item | Classification | Notes |
|------|----------------|-------|
| `supabase_migrations.schema_migrations` history | EXPECTED DIFFERENCE | 43 legacy remote-only versions (`20260530171417` … `20260709201500`); baseline chain not yet pushed |
| `music-covers` bucket `public=true` | EXPECTED DIFFERENCE | Matches staging decision: keep public cover reads |
| Production user / finance / planner data | EXPECTED DIFFERENCE | Not part of schema fingerprint; baseline is schema-only |

### BASELINE MISSING PROD OBJECT

None identified. Production does not contain security objects that baseline lacks; gaps are baseline improvements not yet deployed.

---

## 3. Detailed findings

### 3.1 `core_handle_new_user` (BLOCKER)

**Production body (abbreviated):**

```sql
foreach v_app in array array['finance', 'fitness', 'planner', 'music', 'portal', 'home']
loop
  insert into public.core_user_app_settings (user_id, app_id) ...
end loop;
-- no app_memberships insert
```

**Baseline + `20260710161000` (abbreviated):**

```sql
insert into public.core_user_app_settings (user_id, app_id) values (new.id, 'fitness') ...
insert into public.app_memberships (...) values ('fitness', new.id, 'member', 'active', ...) ...
```

Staging (`dsiloxzjnsvjnhbruibl`) matches baseline; production does not.

### 3.2 `app_memberships`

Table and read-own RLS policy **MATCH**.
Gap is **population logic** (signup trigger), not schema.

### 3.3 App-table RLS (`fitness_*`, `planner_*`, `finance_*`)

Automated name/count comparison: **MATCH** (132 policies).
Historical incremental migrations already deployed `has_app_access` on relational tables.

### 3.4 Storage

Live production query:

```sql
select id, name, public from storage.buckets
where id in ('finance-purchase-images','music-covers','music','bug-attachments');
```

| bucket | `public` |
|--------|----------|
| bug-attachments | false |
| finance-purchase-images | **true** |
| music | false |
| music-covers | true |

Production `storage.objects` policies for finance:

| policy | cmd | prod | baseline |
|--------|-----|------|----------|
| `finance_purchase_images_public_select` | SELECT | ✓ | dropped |
| `finance_purchase_images_select_own` | SELECT | ✗ | ✓ + `has_app_access` |
| `finance_purchase_images_insert_own` | INSERT | folder only | + `has_app_access` |
| `finance_purchase_images_update_own` | UPDATE | folder only | + `has_app_access` |
| `finance_purchase_images_delete_own` | DELETE | folder only | + `has_app_access` |

---

## 4. Answers — rollout decision

### Q1. If migrations were applied and schema matched, is frontend-only deploy enough?

**Not applicable today** — production migrations are **not** applied and schema **does not** fully match (auth trigger + storage).

When DB parity is achieved (after `db push`), rollout becomes:

1. Apply / verify DB migrations on production
2. Deploy frontend entitlement-aware builds
3. Run production smoke tests (Ken + controlled friend account)

Frontend-only deploy **without** DB changes would leave signup isolation and finance image exposure unfixed.

### Q2. Must `finance_purchase_images_public_select` be manually restricted now?

**Yes — but prefer migration, not ad-hoc SQL.**

The policy is still active on production. Manually dropping it without adding `finance_purchase_images_select_own` would break Finance image reads for legitimate users.

Recommended path: apply `20260710160000_life_os_baseline.sql` via `supabase db push --linked` (contains the full storage policy block). Do **not** hand-edit production unless push is blocked and you need an emergency hotfix.

### Q3. Can we enter PROD-ROLL-2?

## **YES** (as of PROD-ROLL-1.5 completion)

All pre-rollout blockers resolved. Remaining work is frontend deploy + production smoke tests (not schema).

---

## 5. PROD-ROLL-1.5 execution log (completed 2026-07-10)

`supabase db push` failed because 43 legacy remote-only migrations were not in the local `migrations/` folder. Production objects were already at baseline parity except signup trigger + storage hardening.

**Approach:** targeted delta SQL + controlled migration history repair (per `docs/security/supabase-production-rollout.md`).

### Commands executed

```bash
# 1. Delta SQL (storage hardening + fitness signup trigger)
./scripts/supabase-sql.sh -f apps/finance/.tmp/prod-roll-1.5-delta.sql

# 2. Align migration history
supabase migration repair --status reverted <43 legacy versions> --workdir apps/finance
supabase migration repair --status applied 20260710160000 20260710161000 --workdir apps/finance
```

### Post-rollout verification (all PASS)

- [x] `migration list`: local + remote both `20260710160000`, `20260710161000`
- [x] `core_handle_new_user` inserts `app_memberships` (no `foreach v_app` loop)
- [x] `finance_purchase_images_public_select` **absent**
- [x] `finance_purchase_images_select_own` **present** with `has_app_access('finance')`
- [x] `finance-purchase-images.public = false`
- [x] Ken memberships unchanged (7 apps, all `owner/active`)

---

## 6. PROD-ROLL-2 plan (next)

### Frontend deploy + production smoke

1. Deploy Planner / Fitness / Finance / Music / Portal frontends (Netlify `master` or approved prod deploy)
2. Ken: SSO + existing memberships regression
3. Synthetic test signup (not real friend yet): verify **only** `fitness/member/active`
4. Cross-app denial: test user cannot read planner/finance/music rows or storage
5. Finance image URL probe: unauthenticated fetch must fail

Note: `local-supabase-final-gate.mjs` only supports `LIFEOS_SECURITY_TARGET=staging` today; production smoke is manual until prod target is added.

### PROD-ROLL-3 — Friend invite

Only after PROD-ROLL-2 smoke **PASS**.

---

## 7. Environment notes

| Project | Ref | Baseline migrations | Use |
|---------|-----|---------------------|-----|
| Life OS (production) | `iueozzuctstwvzbcxcyh` | **Not applied** | This report |
| Life OS Staging 2 | `dsiloxzjnsvjnhbruibl` | Applied | `SEC-STAGE-1` gate (PASS) |

`scripts/supabase-sql.sh` defaults to production ref `iueozzuctstwvzbcxcyh`. Always align `apps/finance` CLI link with the same ref before `db dump` / `migration list`.

---

## 8. Classification legend

| Tag | Meaning |
|-----|---------|
| **MATCH** | Production object matches baseline |
| **EXPECTED DIFFERENCE** | Known legacy / data / history divergence |
| **BASELINE MISSING PROD OBJECT** | Production has extra object baseline lacks |
| **SECURITY IMPROVEMENT** | Baseline is stricter; not yet on production |
| **BLOCKER** | Must resolve before PROD-ROLL-2 |
