# PR-3B: Staging Infrastructure Investigation Report

**Status**: ⚠️ **WARN** — No dedicated staging infrastructure found
**Date**: 2026-07-09
**Scope**: Read-only investigation of existing staging/deploy infrastructure

---

## Executive Summary

Investigation into staging infrastructure has revealed:

- ✅ Netlify site exists and is linked to GitHub (planneros-ken)
- ⚠️ **No dedicated staging Supabase project found**
- ⚠️ **No deploy preview/branch deploy configured**
- ⚠️ **Only one active Supabase project: "Life OS" (production)**
- ❌ **Cannot use production Supabase as staging**

**Blocker**: No staging infrastructure currently exists.

---

## Part 1: Netlify Infrastructure Status

### Netlify Site Details
```
Site Name:     planneros-ken
Site ID:       82a6cadc-03f9-443c-85f7-26bd4a90f83f
Project ID:    d478e880-b27e-44da-925b-3322e9a6ccda
URL:           https://planner.kenos.space
Repo:          Ken-pan/life-os
Account:       Portfolio
Admin URL:     https://app.netlify.com/sites/planner-os-ken/settings
```

### Deploy Configuration
```
Build Command:  npm run build -w planner-os
Publish Dir:    apps/planner/build
Functions Dir:  apps/planner/netlify/functions
Node Version:   22
```

### Deploy Workflow (GitHub Actions)
- **Manual Deploy**: `.github/workflows/deploy-netlify.yml`
  - Dispatch: `workflow_dispatch` (manual trigger)
  - Target: `--prod` (production flag)
  - Site: 82a6cadc-03f9-443c-85f7-26bd4a90f83f (same as planner-ken)
  - Secret: `NETLIFY_AUTH_TOKEN`

- **CI Workflow**: `.github/workflows/ci.yml`
  - Trigger: `push` and `pull_request` on master/main
  - Action: Build only (no deployment)
  - Secrets: Production Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Deploy Preview Configuration
**Status**: ❌ **NOT CONFIGURED**

- No branch deploy rules in netlify.toml
- No branch-specific environment variables
- No staging context in build configuration
- Netlify.toml has only basic build and header settings

**Implication**: All push events build but do not auto-deploy. Manual `netlify deploy --prod` is required for any deployment.

---

## Part 2: Supabase Infrastructure Status

### Supabase Projects Inventory
```bash
supabase projects list
```

**Result**: 2 projects found:

#### Project 1: "Ken-pan's Project"
```
ID:          bxqpeujefreznoohclot
Ref:         bxqpeujefreznoohclot
Region:      us-west-2
Status:      INACTIVE
Linked:      false
PostgreSQL:  v17.6.1.063
Created:     2026-01-31
```
**Status**: Inactive, not linked. ❌ Cannot use for staging.

#### Project 2: "Life OS"
```
ID:          iueozzuctstwvzbcxcyh
Ref:         iueozzuctstwvzbcxcyh
Region:      us-east-2
Status:      ACTIVE_HEALTHY
Linked:      true
PostgreSQL:  v17.6.1.127
Created:     2026-05-30
Database:    db.iueozzuctstwvzbcxcyh.supabase.co
```
**Status**: Active and linked to current directory (production). ⚠️ **CRITICAL: THIS IS PRODUCTION**

### Supabase Links
```bash
# Current link
cd /Users/kenpan/「Projects」/life-os/apps/planner
supabase status
# Shows: "Life OS" project (iueozzuctstwvzbcxcyh) is linked
```

**Implication**: The planner app is linked to the production "Life OS" Supabase project. No separate staging project exists.

---

## Part 3: Environment Variables & Secrets

### CI/Deploy Secrets Configuration

**GitHub Actions Secrets** (referenced in workflows):
```
NETLIFY_AUTH_TOKEN        — For Netlify deployment
SUPABASE_ACCESS_TOKEN     — For remote Supabase access (optional)
VITE_SUPABASE_URL         — Production Supabase endpoint
VITE_SUPABASE_ANON_KEY    — Production anon key
UI_QA_EMAIL               — QA account email
UI_QA_PASSWORD            — QA account password
MUSIC_QA_EMAIL            — Music QA email
```

**Status**: All secrets are for production. No staging secrets exist.

### Local Environment
```bash
# Checked files (none found)
❌ .env.staging
❌ .env.development
❌ staging.env
❌ .env-staging
❌ .env.local
```

**Status**: No local staging configuration files.

---

## Part 4: Staging Options Analysis

### Option A: ✅ Both Deploy Preview & Staging Supabase Exist
**Result**: ❌ NOT APPLICABLE

- Deploy preview: Not configured
- Staging Supabase: Not found
- Action: N/A

---

### Option B: ⚠️ Deploy Preview Exists, No Staging Supabase
**Result**: ⚠️ PARTIALLY APPLICABLE (only if deploy preview is enabled)

**Current State**: Deploy preview NOT configured in Netlify
- No branch deploy rules
- No staging context

**If enabled** (would require Netlify dashboard setup):
- Branch push would create preview: `https://[branch]--planneros-ken.netlify.app`
- Still need: Separate staging Supabase project

---

### Option C: ❌ No Deploy Preview, No Staging Supabase
**Result**: ✅ **THIS IS THE CURRENT STATE**

- Deploy preview: Not configured
- Staging Supabase: Does not exist
- Deployment: Manual only (--prod)

**Action Required**: Must create staging infrastructure

---

### Option D: ❌ Only Production Exists
**Result**: ✅ **CONFIRMED**

- Supabase: Only "Life OS" (production)
- Netlify: Only production site (planner.kenos.space)
- Secrets: All point to production

**HARD STOP**: Cannot use production as staging. This violates the safety plan.

---

## Part 5: Required Staging Setup

Since no staging infrastructure exists, to proceed with staging validation, must:

### 1. Create Staging Supabase Project
```bash
# Via Supabase Dashboard:
1. Sign into https://app.supabase.com
2. Create new project: "Life OS Staging" or "PR-3B Staging"
3. Region: us-east-2 (same as production for consistency)
4. Wait for project creation (~5 min)
5. Copy credentials:
   - Staging SUPABASE_URL
   - Staging SUPABASE_ANON_KEY
   - Staging SUPABASE_SERVICE_ROLE_KEY
```

### 2. Link Staging Supabase to CLI (optional)
```bash
cd apps/planner
supabase link --project-ref [staging-ref]
```

### 3. Apply Migration to Staging Only
```bash
supabase db push
# This applies ALL unapplied migrations to staging, including PR-3B migration
```

### 4. Create GitHub Secrets for Staging (optional for Netlify)
```bash
# Via GitHub Settings → Secrets and Variables → Actions:
STAGING_SUPABASE_URL=https://[staging-ref].supabase.co
STAGING_SUPABASE_ANON_KEY=[staging-anon-key]
STAGING_SUPABASE_SERVICE_ROLE_KEY=[staging-service-role]
STAGING_PAPER_DEVICE_TOKEN=staging-test-token
STAGING_PAPER_DEVICE_USER_ID=[staging-test-user-uuid]
```

### 5. Optional: Configure Netlify Deploy Preview
```bash
# Via Netlify Dashboard (planner-os-ken settings):
1. Build & deploy → Deploy contexts
2. Edit branch deploy (or create new)
3. Configure for staging branch: e.g., "staging/pr-3b"
4. Set environment variables:
   - PUBLIC_SUPABASE_URL → staging value
   - SUPABASE_SERVICE_ROLE_KEY → staging value
```

---

## Part 6: Blockers & Hard Stops

### Critical Blockers for Staging Validation
- ❌ **No staging Supabase project** — Must create before validation
- ❌ **No staging deploy endpoint** — Must create or use manual test
- ❌ **No staging credentials** — Must obtain from new Supabase project
- ❌ **No staging env vars in Netlify** — Optional but recommended

### Hard Stops (CANNOT Proceed With)
- ❌ Using production "Life OS" Supabase as staging (violates safety plan)
- ❌ Modifying production Netlify site for staging testing
- ❌ Running validation without isolated staging Supabase instance

---

## Part 7: Recommended Staging Setup Path

### Recommended: Option C → Setup Dedicated Staging Infrastructure

**Safest approach**:
1. Create new, separate Supabase project for staging
2. Apply migration to staging only (not production)
3. Either:
   - Configure Netlify deploy preview for staging branch, OR
   - Test manually through local dev server + staging Supabase
4. Run validation tests against staging
5. After validation PASSES, proceed to production deployment

**Rationale**:
- ✅ Complete isolation from production
- ✅ Safe rollback (can delete staging project)
- ✅ Matches production infrastructure
- ✅ Clear separation of concerns
- ✅ No risk to production during testing

**Setup Time**: ~15-30 minutes
- Supabase project creation: ~5 min
- CLI setup & migration: ~5 min
- Test data creation: ~5 min
- Validation testing: ~10 min

---

## Part 8: What Cannot Be Done Yet

### ✅ Can Do (Read-Only)
- ✅ Review deployment workflows
- ✅ Check Netlify configuration
- ✅ Verify Supabase projects
- ✅ Plan staging infrastructure
- ✅ Write validation tests locally

### ❌ Cannot Do (Requires Staging Setup)
- ❌ Deploy to staging
- ❌ Apply migration to staging
- ❌ Run validation tests against staging Supabase
- ❌ Enable PAPER_ACTIONS_WRITE_ENABLED in staging
- ❌ Test Netlify routing through deployed endpoint

---

## Blockers Summary

| Blocker | Current State | Required | Severity |
|---------|---------------|----------|----------|
| Staging Supabase | ❌ Does not exist | Create new project | 🔴 CRITICAL |
| Staging Credentials | ❌ Not available | Obtain from new project | 🔴 CRITICAL |
| Deploy Preview/Staging Endpoint | ❌ Not configured | Create or setup manually | 🟡 IMPORTANT |
| Staging Secrets in GitHub | ❌ Not configured | Add to GitHub Actions | 🟡 OPTIONAL |

---

## Final Recommendation

### ⚠️ Staging Validation CANNOT PROCEED Until:

1. **New Supabase project created** for staging
   - Separate from production "Life OS"
   - Name: "PR-3B Staging" or "Life OS Staging"
   - Region: us-east-2

2. **Migration applied to staging only**
   - Not to production
   - Includes paper_device_actions table

3. **Staging Supabase credentials documented**
   - URL, anon key, service role key
   - Not committed to repo
   - Stored securely (GitHub Secrets recommended)

4. **Test endpoint established**
   - Either: Netlify deploy preview for branch
   - Or: Local dev server + staging Supabase
   - Must test through `/api/paper/actions` endpoint

### Explicit Statement

**PRODUCTION CANNOT BE USED AS STAGING.**
- All testing must occur against separate staging Supabase instance
- Production "Life OS" project must remain untouched
- No production migrations, no production writes during staging testing

---

## Sign-Off

**Netlify Site**: ✅ Exists and linked (planneros-ken)
**Supabase Production**: ✅ Exists and active (Life OS)
**Supabase Staging**: ❌ **DOES NOT EXIST** (BLOCKER)
**Deploy Preview**: ❌ **NOT CONFIGURED**
**Staging Secrets**: ❌ **NOT AVAILABLE**

**Investigation Status**: ✅ COMPLETE
**Staging Readiness**: ❌ **NOT READY**

**Verdict**: Staging infrastructure must be created before staging validation can proceed. No existing staging setup was found. Production Supabase cannot be used for validation testing.

**Next Step**: Create dedicated staging Supabase project and obtain credentials before running PR-3B staging validation tests.
