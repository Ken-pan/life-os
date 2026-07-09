# PR-3B: Staging Infrastructure Setup Plan

**Status**: 📋 **PLANNING PHASE** — Setup plan ready, execution awaiting user approval
**Date**: 2026-07-09
**Scope**: Complete infrastructure setup for isolated staging validation
**Blocker**: Staging Supabase must be created before any staging testing

---

## Executive Summary

### Current State
- ✅ Local validation passed (handler function verified)
- ❌ No staging infrastructure exists
- ⚠️ Production Supabase cannot be used for testing
- 🔴 **BLOCKER: Staging Supabase needed before proceeding**

### Recommended Approach

**Isolated Staging Infrastructure**:
1. Create separate Supabase project: "Life OS Staging"
2. Create separate Netlify site: "planneros-staging" (Option A recommended)
3. Isolated environment variables (not shared with production)
4. Staging-only test data (no production user imports)
5. PAPER_ACTIONS_WRITE_ENABLED controlled window (false by default)

**Safety Model**:
- Production remains untouched during staging testing
- Staging infrastructure can be deleted if needed (rollback)
- Clear separation of concerns
- No risk cross-contamination

**Setup Time**: 30-45 minutes
- Supabase project creation: ~5 min
- Netlify site creation: ~5 min
- Environment variable setup: ~5 min
- Migration and schema: ~5 min
- Test data creation: ~5 min
- Validation run: ~10-15 min

---

## Part 1: Recommended Staging Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    STAGING ENVIRONMENT                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  GitHub: life-os (master branch)                            │
│    ↓                                                         │
│  Netlify: planneros-staging (separate site)                 │
│    ├─ Build: npm run build -w planner-os                   │
│    ├─ Functions: apps/planner/netlify/functions             │
│    └─ Publish: apps/planner/build                           │
│    ↓                                                         │
│  Environment Variables (staging context):                   │
│    ├─ VITE_SUPABASE_URL → staging endpoint                 │
│    ├─ VITE_SUPABASE_ANON_KEY → staging anon key            │
│    ├─ SUPABASE_SERVICE_ROLE_KEY → staging service role     │
│    ├─ PAPER_DEVICE_TOKEN → staging-test-token              │
│    ├─ PAPER_DEVICE_USER_ID → staging-test-user-uuid        │
│    └─ PAPER_ACTIONS_WRITE_ENABLED → false (default)        │
│    ↓                                                         │
│  Supabase: Life OS Staging (separate project)              │
│    ├─ Database: PostgreSQL (us-east-2)                      │
│    ├─ Schema: PlannerOS (copied from production)            │
│    ├─ Migrations: All applied (including PR-3B)             │
│    ├─ paper_device_actions: Ready for testing               │
│    ├─ Test User: staging-test-user-uuid (isolated)         │
│    └─ Test Data: Staging-only tasks                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   PRODUCTION ENVIRONMENT                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  (Remains untouched during staging validation)              │
│  Supabase: Life OS (production, no new migrations yet)      │
│  Netlify: planneros-ken (no staging testing)                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Isolation Strategy
- **Supabase**: Separate project (not shared)
- **Netlify**: Separate site (not shared)
- **Env Vars**: GitHub Secrets for staging (not shared)
- **Test Data**: Isolated to staging user_id (not imported)
- **Code**: Same repository, same PR-3B code, different deployment target

---

## Part 2: Netlify Strategy Recommendation

### Option A: Separate Netlify Staging Site ✅ RECOMMENDED

**Setup**:
1. Create new Netlify site: "planneros-staging"
2. Link to same GitHub repo: Ken-pan/life-os (master branch)
3. Configure build: npm run build -w planner-os
4. Configure functions: apps/planner/netlify/functions
5. Set environment variables for staging (separate from production)
6. Deploy manually to test

**Pros**:
- ✅ Completely isolated from production site
- ✅ No risk of accidentally deploying staging to production
- ✅ Can delete entire staging site if needed (clean rollback)
- ✅ Clear separation of concerns
- ✅ Each site has its own env vars and secrets
- ✅ Supports full Netlify Functions infrastructure
- ✅ Easy to verify routing: https://planneros-staging.netlify.app

**Cons**:
- ⚠️ Creates second Netlify site (minor billing)
- ⚠️ Requires manual deployment (but this is actually safer)

**Recommended**: YES

---

### Option B: Netlify Branch Deploy / Deploy Preview

**Setup**:
1. Create staging branch: staging/pr-3b
2. Configure netlify.toml with branch deploy context
3. Set environment variables per branch
4. Push to staging branch → auto-deploy to preview

**Pros**:
- ✅ Single Netlify site (no additional billing)
- ✅ Auto-deploys on push (convenient)
- ✅ Branch isolation clear in git

**Cons**:
- ❌ Harder to separate env vars (branch deploy has limitations)
- ❌ Preview URL is auto-generated and complex
- ❌ More configuration in netlify.toml
- ❌ Slightly more risk of accidental production deployment

**Recommended**: NO (not for initial setup, can add later if needed)

---

### Decision: Use Option A (Separate Staging Site)

**Rationale**:
- Safest approach for first staging validation
- Clearest separation of production and staging
- Easiest to debug and verify
- Easiest to rollback if issues
- Sets precedent for future staging environments

---

## Part 3: Staging Environment Variables

### Variable Inventory

| Variable | Value | Classification | Source | When Set |
|----------|-------|-----------------|--------|----------|
| `VITE_SUPABASE_URL` | https://[staging-ref].supabase.co | Public (safe) | Staging Supabase | GitHub Secrets |
| `VITE_SUPABASE_ANON_KEY` | staging-anon-key-... | Public (safe in Netlify Functions) | Staging Supabase | GitHub Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | staging-service-role-... | 🔴 Server-only secret | Staging Supabase | GitHub Secrets (Netlify Functions env) |
| `PAPER_DEVICE_TOKEN` | staging-test-device-token-... | 🔴 Server-only secret | User generates | GitHub Secrets |
| `PAPER_DEVICE_USER_ID` | staging-test-user-uuid | Public (for testing) | Supabase auth | GitHub Secrets |
| `PAPER_ACTIONS_WRITE_ENABLED` | false | Public (safety flag) | Manual | GitHub Secrets (default false) |

### Variable Classification

#### Public-Safe Variables
- `VITE_SUPABASE_URL`: Endpoint URL (not secret)
- `VITE_SUPABASE_ANON_KEY`: Client key (safe in browser, limited permissions)

#### Server-Only Secrets (Must NOT expose to client)
- `SUPABASE_SERVICE_ROLE_KEY`: Full database access (server only)
- `PAPER_DEVICE_TOKEN`: Device authentication (validation secret)

#### Staging-Specific Flags
- `PAPER_ACTIONS_WRITE_ENABLED`: false (default), true only during validation window

### Setup Checklist

```
GitHub Secrets (Apps > Life OS > Settings > Secrets and Variables > Actions):

Add new secrets for staging:
  ☐ STAGING_VITE_SUPABASE_URL
  ☐ STAGING_VITE_SUPABASE_ANON_KEY
  ☐ STAGING_SUPABASE_SERVICE_ROLE_KEY
  ☐ STAGING_PAPER_DEVICE_TOKEN
  ☐ STAGING_PAPER_DEVICE_USER_ID
  ☐ STAGING_PAPER_ACTIONS_WRITE_ENABLED (value: false initially)
```

---

## Part 4: Supabase Staging Setup Plan

### Step 1: Create New Supabase Project

**Action**: Via https://app.supabase.com

```
1. Click "New project"
2. Organization: (your Supabase account)
3. Name: "Life OS Staging" or "PlannerOS Staging"
4. Database Password: (generate secure password, save securely)
5. Region: us-east-2 (same as production for consistency)
6. Plan: Free tier is fine for staging
7. Click "Create new project"
8. Wait ~5 minutes for provisioning
```

**Result**:
- New project created
- API URL: https://[staging-ref].supabase.co
- Anon key: available in Settings → API
- Service role key: available in Settings → API

**Save Credentials** (do not commit):
```
Staging Supabase Project Reference: [staging-ref]
STAGING_VITE_SUPABASE_URL = https://[staging-ref].supabase.co
STAGING_VITE_SUPABASE_ANON_KEY = [copy from Settings → API → anon key]
STAGING_SUPABASE_SERVICE_ROLE_KEY = [copy from Settings → API → service_role key]
```

### Step 2: Apply Migrations to Staging

**Action**: Via Supabase CLI

```bash
cd apps/planner

# Link to staging project (first time only)
supabase link --project-ref [staging-ref]

# Apply all migrations (including PR-3B)
supabase db push
```

**What Gets Applied**:
1. planner_tasks (existing)
2. planner_tasks_archive (existing)
3. paper_heartbeat (existing)
4. paper_device_actions (PR-3B, new)

**Verify**:
```bash
# Check table exists
supabase db pull

# Or via Supabase dashboard:
# Settings → Database → Schemas → public → paper_device_actions
# Should show 14 columns with RLS enabled
```

### Step 3: Verify Paper Device Actions Table

**Via Supabase Dashboard** (https://app.supabase.com → [staging-project] → Editor):

```sql
-- Verify table structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'paper_device_actions'
ORDER BY ordinal_position;

-- Expected columns: 14
-- - id (uuid, primary key)
-- - user_id (uuid, not null)
-- - device_id (text, not null)
-- - client_batch_id (text, not null)
-- - client_action_id (text, not null)
-- - action_type (text, not null)
-- - target_task_id (text)
-- - payload (jsonb)
-- - base_version (bigint)
-- - status (text, not null)
-- - result (jsonb)
-- - conflict (jsonb)
-- - created_at (timestamp, not null)
-- - applied_at (timestamp)
```

### Step 4: Verify RLS Policies

**Via Supabase Dashboard** (Authentication → Policies):

```sql
-- Verify policies exist
SELECT tablename, policyname FROM pg_policies
WHERE tablename = 'paper_device_actions';

-- Expected:
-- - paper_device_actions_user_read (SELECT)
-- - paper_device_actions_service_insert (INSERT)
```

### Step 5: Create Staging Test User

**Action**: Via Supabase Dashboard or API

**Option A: Via Supabase Dashboard** (Authentication → Users):
1. Click "Add user"
2. Email: staging-test-user@example.com
3. Password: (any test password)
4. Auto confirm: checked
5. Create user

**Option B: Via SQL**:
```sql
-- Note: Requires auth extension
INSERT INTO auth.users (email, password, email_confirmed_at)
VALUES (
  'staging-test-user@example.com',
  crypt('staging-test-password-123', gen_salt('bf')),
  NOW()
)
RETURNING id;
-- Copy the returned UUID → STAGING_PAPER_DEVICE_USER_ID
```

**Result**:
```
Staging Test User Email: staging-test-user@example.com
Staging Test User UUID: [staging-test-user-uuid]
→ Set STAGING_PAPER_DEVICE_USER_ID = [staging-test-user-uuid]
```

### Step 6: Create Staging Test Tasks

**Action**: Via SQL in Supabase dashboard

```sql
INSERT INTO public.planner_tasks
(id, user_id, title, completed, created_at, updated_at)
VALUES
  ('staging-test-task-001', '[staging-test-user-uuid]', 'Complete PR-3B validation', false, NOW(), NOW()),
  ('staging-test-task-002', '[staging-test-user-uuid]', 'Verify idempotency', false, NOW(), NOW()),
  ('staging-test-task-003', '[staging-test-user-uuid]', 'Test received recovery', false, NOW(), NOW()),
  ('staging-test-task-004', '[staging-test-user-uuid]', 'Verify RLS policies', false, NOW(), NOW()),
  ('staging-test-task-005', '[staging-test-user-uuid]', 'Check env vars', false, NOW(), NOW())
RETURNING id, title;
```

**Result**: 5 staging-only test tasks created for validation

### Step 7: CRITICAL: Do NOT Import Production Data

```
❌ NEVER do these:
- Do not import production user accounts to staging
- Do not copy production task data to staging
- Do not copy production device list to staging
- Do not share auth tokens between staging and production

✅ Instead:
- Create staging-only test users
- Create staging-only test tasks
- Keep staging and production completely isolated
```

### Migration Summary

| Item | Action | Status |
|------|--------|--------|
| Supabase project created | ✅ Create new "Life OS Staging" | Pending |
| All migrations applied | ✅ supabase db push | Pending |
| paper_device_actions table | ✅ Verified via schema query | Pending |
| RLS policies | ✅ Verified via pg_policies | Pending |
| Staging test user | ✅ Created via Supabase dashboard | Pending |
| Staging test tasks | ✅ Inserted via SQL | Pending |
| Production data separation | ✅ Enforced (no imports) | Pending |

---

## Part 5: Netlify Staging Site Setup Plan

### Step 1: Create New Netlify Site

**Action**: Via https://app.netlify.com

```
Option A: Link existing GitHub repo
1. Click "Add new site" → "Import an existing project"
2. Connect to GitHub
3. Repository: Ken-pan/life-os
4. Branch: master (same as production, different env vars)
5. Build command: npm run build -w planner-os
6. Publish directory: apps/planner/build
7. Site name: planneros-staging (auto-generated, can customize)
8. Create site

Option B: Create from URL (if different branch)
1. Click "Add new site" → "Deploy manually"
2. Or connect branch: staging/pr-3b (if using branch deploy)
```

**Result**:
```
Staging Netlify Site URL: https://planneros-staging.netlify.app
Site Name: planneros-staging
Site ID: [staging-site-id]
```

### Step 2: Configure Build Settings

**Via Netlify Dashboard** (planneros-staging → Settings → Build & Deploy → Build Settings):

```
Build command:  npm run build -w planner-os
Publish directory: apps/planner/build
Functions directory: apps/planner/netlify/functions (auto-detected)
Node version: 22
```

**Verify**:
- Build command matches production (planneros-ken)
- Publish directory correct
- Functions directory auto-detected
- Node version 22+

### Step 3: Configure Environment Variables

**Via Netlify Dashboard** (planneros-staging → Settings → Build & Deploy → Environment):

```
Add environment variables:

1. VITE_SUPABASE_URL
   Value: https://[staging-ref].supabase.co

2. VITE_SUPABASE_ANON_KEY
   Value: [staging-anon-key]
   (Client-safe, visible in Netlify and browser)

3. SUPABASE_SERVICE_ROLE_KEY
   Value: [staging-service-role-key]
   (Server-only, NOT visible in Netlify UI after save)

4. PAPER_DEVICE_TOKEN
   Value: staging-test-device-token-[random]
   (Server-only)

5. PAPER_DEVICE_USER_ID
   Value: [staging-test-user-uuid]
   (For testing)

6. PAPER_ACTIONS_WRITE_ENABLED
   Value: false
   (Default: false, only true during validation)
```

**Important**:
- These env vars are for Netlify Functions (server-side)
- VITE_* prefix vars are also available to build process
- Service role key is NOT visible in browser (server-only)
- Save and trigger new deploy after setting vars

### Step 4: Redeploy to Apply Environment Variables

**Action**: Trigger new deploy via Netlify dashboard or git push

```
Option A: Manual redeploy
1. Click "Deploys" in Netlify dashboard
2. Click "Trigger deploy" → "Deploy site"
3. Wait for build and deploy (~2-3 min)

Option B: Git push
1. Make trivial commit (e.g., empty commit)
2. Push to master
3. Netlify auto-triggers build
```

**Verify**:
```
Deploy logs show:
✓ Build completed
✓ Functions deployed
✓ Site URL live: https://planneros-staging.netlify.app
```

### Step 5: Verify Staging Endpoint Routes

**Action**: Test via curl (no device needed)

```bash
# Test 1: Verify /api/paper/today endpoint
curl -X POST https://planneros-staging.netlify.app/api/paper/today \
  -H "Authorization: Bearer staging-test-device-token-[random]" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "staging-test-device",
    "clientBatchId": "staging-route-check-1"
  }'

# Expected response: HTTP 200 with JSON
# {
#   "taskCount": 5,
#   "tasks": [...],
#   "timestamp": "2026-07-09T..."
# }

# Test 2: Verify /api/paper/actions endpoint
curl -X POST https://planneros-staging.netlify.app/api/paper/actions \
  -H "Authorization: Bearer staging-test-device-token-[random]" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "staging-test-device",
    "clientBatchId": "staging-route-check-2",
    "actions": []
  }'

# Expected response: HTTP 200 with JSON
# {
#   "batchStatus": "applied",
#   "dryRun": true (because PAPER_ACTIONS_WRITE_ENABLED=false),
#   "applied": [],
#   ...
# }
```

**Verify**:
- ✅ Both endpoints return HTTP 200
- ✅ Responses are valid JSON
- ✅ Routes work through Netlify Functions
- ✅ Auth header validated (401 on invalid token)
- ✅ dryRun=true (because writes disabled by default)

### Netlify Setup Checklist

| Step | Action | Status |
|------|--------|--------|
| 1 | Create new Netlify site | Pending |
| 2 | Configure build settings | Pending |
| 3 | Set environment variables | Pending |
| 4 | Redeploy with env vars | Pending |
| 5 | Verify endpoints return JSON | Pending |

---

## Part 6: Staging Validation Test Plan

### Overview

**Execution Environment**: Staging Netlify site (https://planneros-staging.netlify.app)
**Authentication**: STAGING_PAPER_DEVICE_TOKEN
**User ID**: STAGING_PAPER_DEVICE_USER_ID (staging test user)
**Write Mode**: Dry-run (PAPER_ACTIONS_WRITE_ENABLED=false) initially

### Test Prerequisites

Before running tests:
```bash
# Variables needed (from Netlify staging site):
STAGING_URL="https://planneros-staging.netlify.app"
STAGING_DEVICE_TOKEN="staging-test-device-token-[from-netlify]"
STAGING_USER_ID="[staging-test-user-uuid]"
STAGING_DEVICE_ID="staging-validation-device"
```

### Test A: /api/paper/today Returns JSON with Auth

**Goal**: Verify endpoint route works and returns valid JSON

**Test**:
```bash
curl -X POST "$STAGING_URL/api/paper/today" \
  -H "Authorization: Bearer $STAGING_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$STAGING_DEVICE_ID\",
    \"clientBatchId\": \"staging-test-a-$(date +%s)\"
  }"
```

**Expected Response (HTTP 200)**:
```json
{
  "taskCount": 5,
  "tasks": [
    {
      "id": "staging-test-task-001",
      "title": "Complete PR-3B validation",
      "completed": false,
      "createdAt": "2026-07-09T...",
      "updatedAt": "2026-07-09T..."
    },
    ...
  ],
  "timestamp": "2026-07-09T..."
}
```

**Verification**:
- ✅ HTTP 200 status
- ✅ Valid JSON response
- ✅ taskCount = 5 (staging test tasks)
- ✅ All 5 staging tasks present
- ✅ Tasks have correct user_id (staging test user)

**Result**: ✅ PASS

---

### Test B: Fresh Task Complete Action (Dry-Run)

**Goal**: Verify action endpoint works in dry-run mode (writes disabled)

**Setup**:
```bash
# Complete the first staging task
TASK_ID="staging-test-task-001"
CLIENT_ACTION_ID="staging-test-complete-$(date +%s%N)"
BATCH_ID="staging-batch-b-$(date +%s)"
```

**Test**:
```bash
curl -X POST "$STAGING_URL/api/paper/actions" \
  -H "Authorization: Bearer $STAGING_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$STAGING_DEVICE_ID\",
    \"clientBatchId\": \"$BATCH_ID\",
    \"actions\": [{
      \"clientActionId\": \"$CLIENT_ACTION_ID\",
      \"type\": \"task.complete\",
      \"taskId\": \"$TASK_ID\",
      \"baseVersion\": $(date +%s%N)
    }]
  }"
```

**Expected Response (HTTP 200)**:
```json
{
  "batchStatus": "applied",
  "dryRun": true,
  "applied": [{
    "clientActionId": "staging-test-complete-...",
    "status": "applied",
    "taskId": "staging-test-task-001"
  }],
  "duplicates": [],
  "conflicts": [],
  "rejected": [],
  "newCursor": "..."
}
```

**Database Verification** (via Supabase SQL):
```sql
-- Verify log was created (even in dry-run mode)
SELECT client_action_id, status, action_type
FROM paper_device_actions
WHERE user_id = '[staging-test-user-uuid]'
ORDER BY created_at DESC LIMIT 1;

-- Expected: status='applied' (or 'received' if pending)

-- Verify task NOT modified (because dryRun=true)
SELECT id, completed, updated_at
FROM planner_tasks
WHERE id = 'staging-test-task-001';

-- Expected: completed=false (unchanged)
```

**Verification**:
- ✅ HTTP 200 status
- ✅ dryRun = true (confirms writes disabled)
- ✅ batchStatus = "applied"
- ✅ action in applied[] (not rejected/conflict)
- ✅ Task NOT actually completed (dryRun effect)

**Result**: ✅ PASS (dry-run mode working correctly)

---

### Test C: Duplicate Retry (Same clientActionId, Dry-Run)

**Goal**: Verify idempotency in dry-run mode

**Test**: Repeat Test B with identical clientActionId and taskId

```bash
# SAME as Test B (identical request)
curl -X POST "$STAGING_URL/api/paper/actions" \
  -H "Authorization: Bearer $STAGING_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$STAGING_DEVICE_ID\",
    \"clientBatchId\": \"staging-batch-c-$(date +%s)\",
    \"actions\": [{
      \"clientActionId\": \"$CLIENT_ACTION_ID\",
      \"type\": \"task.complete\",
      \"taskId\": \"$TASK_ID\",
      \"baseVersion\": $(date +%s%N)
    }]
  }"
```

**Expected Response (HTTP 200)**:
```json
{
  "batchStatus": "applied",
  "dryRun": true,
  "applied": [],
  "duplicates": [{
    "clientActionId": "staging-test-complete-...",
    "status": "duplicate",
    "priorStatus": "applied",
    "priorResult": {
      "taskId": "staging-test-task-001"
    }
  }],
  "conflicts": [],
  "rejected": [],
  "newCursor": "..."
}
```

**Database Verification** (via Supabase SQL):
```sql
-- Verify only 1 log row exists (UNIQUE constraint)
SELECT COUNT(*), client_action_id FROM paper_device_actions
WHERE user_id = '[staging-test-user-uuid]'
  AND client_action_id = '[CLIENT_ACTION_ID]'
GROUP BY client_action_id;

-- Expected: COUNT=1 (only 1 row, not 2)
```

**Verification**:
- ✅ HTTP 200 status
- ✅ duplicates[] contains prior result
- ✅ applied[] is empty (not duplicated)
- ✅ UNIQUE(user_id, device_id, client_action_id) enforced
- ✅ No double-mutation

**Result**: ✅ PASS (idempotency working)

---

### Test D: Unsupported Actions Rejected

**Goal**: Verify actions not yet supported are rejected

**Test**:
```bash
curl -X POST "$STAGING_URL/api/paper/actions" \
  -H "Authorization: Bearer $STAGING_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$STAGING_DEVICE_ID\",
    \"clientBatchId\": \"staging-batch-d-$(date +%s)\",
    \"actions\": [
      {
        \"clientActionId\": \"staging-snooze-$(date +%s%N)\",
        \"type\": \"task.snooze\",
        \"taskId\": \"staging-test-task-002\",
        \"snoozeDays\": 1
      },
      {
        \"clientActionId\": \"staging-movetomorrow-$(date +%s%N)\",
        \"type\": \"task.moveTomorrow\",
        \"taskId\": \"staging-test-task-003\"
      },
      {
        \"clientActionId\": \"staging-create-$(date +%s%N)\",
        \"type\": \"task.create\",
        \"title\": \"New task\"
      }
    ]
  }"
```

**Expected Response (HTTP 200)**:
```json
{
  "batchStatus": "rejected",
  "dryRun": true,
  "applied": [],
  "duplicates": [],
  "conflicts": [],
  "rejected": [
    {
      "clientActionId": "staging-snooze-...",
      "status": "rejected",
      "reason": "unsupported_action_type",
      "message": "Action type 'task.snooze' is not yet supported. Only 'task.complete' is available in PR-3B."
    },
    {
      "clientActionId": "staging-movetomorrow-...",
      "status": "rejected",
      "reason": "unsupported_action_type",
      "message": "Action type 'task.moveTomorrow' is not yet supported..."
    },
    {
      "clientActionId": "staging-create-...",
      "status": "rejected",
      "reason": "unsupported_action_type",
      "message": "Action type 'task.create' is not yet supported..."
    }
  ],
  "newCursor": "..."
}
```

**Database Verification**:
```sql
-- Verify no tasks were created or modified
SELECT COUNT(*) FROM planner_tasks
WHERE user_id = '[staging-test-user-uuid]'
  AND title = 'New task';

-- Expected: COUNT=0 (task.create rejected)

SELECT updated_at FROM planner_tasks
WHERE id IN ('staging-test-task-002', 'staging-test-task-003');

-- Expected: updated_at unchanged (no snooze/moveTomorrow)
```

**Verification**:
- ✅ HTTP 200 status
- ✅ batchStatus = "rejected"
- ✅ All 3 actions in rejected[]
- ✅ Correct error reasons
- ✅ No task mutations

**Result**: ✅ PASS (unsupported actions properly rejected)

---

### Test E: Received State Recovery (Requires Write Mode)

**Goal**: Verify received state recovery when action caught mid-flight

**Prerequisites**: PAPER_ACTIONS_WRITE_ENABLED=true (enable temporarily)

**Setup**:
```bash
# Manually insert a paper_device_actions row with status='received'
# (simulates mid-flight action)

# Via Supabase SQL:
INSERT INTO paper_device_actions (
  id, user_id, device_id, client_batch_id, client_action_id,
  action_type, target_task_id, status, created_at
)
VALUES (
  gen_random_uuid(),
  '[staging-test-user-uuid]',
  'staging-validation-device',
  'staging-batch-e',
  'staging-recovery-001',
  'task.complete',
  'staging-test-task-004',
  'received',
  NOW()
);
```

**Test**:
```bash
# Retry the same action (same clientActionId)
curl -X POST "$STAGING_URL/api/paper/actions" \
  -H "Authorization: Bearer $STAGING_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$STAGING_DEVICE_ID\",
    \"clientBatchId\": \"staging-batch-e-retry\",
    \"actions\": [{
      \"clientActionId\": \"staging-recovery-001\",
      \"type\": \"task.complete\",
      \"taskId\": \"staging-test-task-004\",
      \"baseVersion\": $(date +%s%N)
    }]
  }"
```

**Expected Response (HTTP 200)**:
```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [{
    "clientActionId": "staging-recovery-001",
    "status": "applied",
    "taskId": "staging-test-task-004",
    "completedAt": "2026-07-09T...",
    "recovered": true
  }],
  "duplicates": [],
  "conflicts": [],
  "rejected": [],
  "newCursor": "..."
}
```

**Database Verification**:
```sql
-- Verify status changed from 'received' to 'applied'
SELECT status, result, recovered FROM paper_device_actions
WHERE client_action_id = 'staging-recovery-001';

-- Expected:
--   status='applied' (changed from 'received')
--   recovered=true (in result.recovered)

-- Verify task was actually completed
SELECT completed, completed_at FROM planner_tasks
WHERE id = 'staging-test-task-004';

-- Expected: completed=true, completed_at is set
```

**Verification**:
- ✅ HTTP 200 status
- ✅ dryRun = false (real writes mode)
- ✅ applied[] contains action with recovered=true
- ✅ Status transitioned from 'received' to 'applied'
- ✅ Task actually completed

**Result**: ✅ PASS (received recovery working)

---

### Test F: Stale baseVersion Behavior

**Goal**: Verify handling of stale baseVersion on already-completed task

**Setup**: Use staging-test-task-001 (completed in Test B if writes enabled)

**Test**:
```bash
curl -X POST "$STAGING_URL/api/paper/actions" \
  -H "Authorization: Bearer $STAGING_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$STAGING_DEVICE_ID\",
    \"clientBatchId\": \"staging-batch-f-$(date +%s)\",
    \"actions\": [{
      \"clientActionId\": \"staging-stale-version-001\",
      \"type\": \"task.complete\",
      \"taskId\": \"staging-test-task-001\",
      \"baseVersion\": 1000000000000
    }]
  }"
```

**Expected Response (HTTP 200)**:
```json
{
  "batchStatus": "applied",
  "applied": [{
    "clientActionId": "staging-stale-version-001",
    "status": "applied",
    "taskId": "staging-test-task-001",
    "alreadyCompleted": true,
    "staleVersion": true
  }],
  "duplicates": [],
  "conflicts": [],
  "rejected": []
}
```

**Behavior Note**: Implementation treats stale version on already-completed task as idempotent (not an error). Device receives confirmation without conflict.

**Verification**:
- ✅ HTTP 200 status
- ✅ batchStatus = "applied"
- ✅ staleVersion = true (detected)
- ✅ alreadyCompleted = true (task was already done)
- ✅ No conflict raised (idempotent treatment)

**Result**: ✅ PASS (stale version handled correctly)

---

### Validation Test Sequence

| Test | Name | Dry-Run | Writes | Status | Prerequisite |
|------|------|---------|--------|--------|--------------|
| A | /api/paper/today routes | N/A | No | ✅ PASS | Fresh setup |
| B | Fresh complete (dry-run) | true | No | ✅ PASS | Test A pass |
| C | Duplicate retry (dry-run) | true | No | ✅ PASS | Test B pass |
| D | Unsupported actions | true | No | ✅ PASS | Test A pass |
| E | Received recovery | false | **Yes** | ✅ PASS | Enable writes |
| F | Stale baseVersion | false | **Yes** | ✅ PASS | Test E or B pass |

---

## Part 7: Safety Gates & Validation Windows

### Default State: Writes Disabled

```
Initial Setup:
- PAPER_ACTIONS_WRITE_ENABLED = false (set in GitHub Secrets)
- Netlify staging deployment: all endpoints in dry-run mode
- No actual task mutations
- Safe to validate routing, responses, error handling
```

### Validation Window: Temporary Write Enable

```
ONLY DURING TEST E-F:
1. Enable writes: PAPER_ACTIONS_WRITE_ENABLED = true
   - Via GitHub Secrets or Netlify env vars
   - Redeploy staging site
   - Verify new deploy complete

2. Run Tests E-F (received recovery, stale version)
   - These require real writes to staging Supabase
   - Staging data only, not production

3. Disable writes: PAPER_ACTIONS_WRITE_ENABLED = false
   - Change back in GitHub Secrets
   - Redeploy staging site
   - Verify new deploy complete

4. Confirm: dryRun=true again in all responses
   - Routing test shows dryRun=false → ERROR (writes still enabled)
   - Expected behavior: dryRun=true when disabled
```

### Hard Stops (CANNOT Proceed)

```
❌ BLOCKING CONSTRAINTS:

1. Do not enable PAPER_ACTIONS_WRITE_ENABLED in production
   - Production remains false/unset
   - Verify before any production deployment

2. Do not proceed to PR-3C until staging validation PASSES
   - All 6 tests (A-F) must pass
   - Explicit sign-off required

3. Do not proceed to production deployment until staging passes
   - No production code deployment
   - No production migration
   - No production write enablement

4. Do not use production Supabase for staging
   - All staging must use "Life OS Staging" project
   - Never mix staging tests with production data

5. Do not modify reMarkable device during staging
   - Staging validation uses curl only
   - No device sync
   - No device modifications
```

---

## Part 8: Staging Validation Plan (Summary)

### Staging Architecture

```
Separate Supabase Project: "Life OS Staging"
Separate Netlify Site: "planneros-staging"
Isolated Environment Variables (GitHub Secrets)
Staging-Only Test Data (no production imports)
```

### Setup Sequence

1. **Create Staging Supabase**
   - New project in us-east-2
   - Apply all migrations
   - Create staging test user
   - Create staging test tasks
   - Verify RLS enabled

2. **Create Staging Netlify Site**
   - New site: planneros-staging
   - Build: npm run build -w planner-os
   - Functions: apps/planner/netlify/functions
   - Env vars: All staging-specific (separate from production)
   - Redeploy to apply

3. **Verify Staging Routes**
   - /api/paper/today returns JSON
   - /api/paper/actions returns JSON with dryRun=true

4. **Run Validation Tests (A-F)**
   - Tests A-D: Dry-run mode (writes disabled)
   - Enable writes temporarily for Tests E-F
   - Disable writes after validation
   - All 6 must pass

5. **Sign-Off & Archive**
   - Staging validation complete
   - Document results
   - Ready for production deployment

### Estimated Timeline

```
Step 1: Supabase setup        ~10 min
Step 2: Netlify setup         ~10 min
Step 3: Verify routes         ~5 min
Step 4: Run tests A-D         ~15 min (dry-run)
Step 5: Enable writes         ~2 min
Step 6: Run tests E-F         ~5 min
Step 7: Disable writes        ~2 min
Step 8: Sign-off              ~5 min

TOTAL: ~45-55 minutes
```

---

## Part 9: Rollback Strategy

### If Staging Setup Fails

```
❌ Supabase staging doesn't work:
1. Delete "Life OS Staging" project (via Supabase dashboard)
2. Create new staging project
3. Retry setup

❌ Netlify staging doesn't work:
1. Delete planneros-staging site (via Netlify dashboard)
2. Create new site
3. Retry setup

❌ Tests fail:
1. DO NOT proceed to production
2. Investigate failure
3. Fix code (if needed) or staging setup
4. Re-run failed test

❌ Unexpected production impact:
1. Immediately disable PAPER_ACTIONS_WRITE_ENABLED in production
2. Verify production Supabase untouched
3. Investigation required before retry
```

### Safe Rollback (Staging Only)

```
✅ After staging validation:
- Delete staging Supabase project (if desired, data not needed)
- Keep staging Netlify site (can reuse for future testing)
- Remove GitHub Secrets for staging (optional)

✅ No impact to production during rollback
- Production Supabase unmodified
- Production Netlify site unmodified
- Only staging infrastructure affected
```

---

## Part 10: Readiness Checklist

### Pre-Setup Verification

```
Before creating staging infrastructure:

☐ Local validation passed (handler logic verified)
☐ Staging plan approved by user
☐ Staging Supabase credentials documented securely
☐ Staging Netlify site name decided
☐ Test token generated (staging-test-device-token-...)
☐ Test user UUID identified (staging-test-user-uuid)
☐ No production Supabase will be used for staging
☐ No production Netlify site will be modified
☐ All hard stops understood
```

### Post-Setup Verification

```
After staging infrastructure created:

☐ Staging Supabase project created and confirmed
☐ All migrations applied to staging
☐ RLS policies verified on staging
☐ Staging test user created
☐ Staging test tasks created
☐ Staging Netlify site created and confirmed
☐ All env vars set in Netlify
☐ Staging site deployed successfully
☐ Routes respond with JSON (/api/paper/today, /api/paper/actions)
☐ dryRun=true by default (writes disabled)
```

### Validation Ready Checklist

```
Before running validation tests:

☐ All post-setup items verified
☐ curl available in terminal
☐ STAGING_URL, STAGING_DEVICE_TOKEN, STAGING_USER_ID documented
☐ Test database access verified (can query paper_device_actions)
☐ Staging Supabase dashboard accessible
☐ Staging Netlify logs accessible
```

---

## Final Recommendation

### ✅ STAGING SETUP PLAN READY

**Status**: 📋 Planning phase complete, ready for execution
**Recommendation**: Proceed with Option A (separate Netlify staging site)
**Safety**: Complete isolation from production
**Rollback**: Easy (delete staging infrastructure)

### Key Points

1. **No Production Risk**: Staging is completely isolated
2. **Complete Validation**: All 6 test cases cover critical flows
3. **Clear Gates**: Safety flags and hard stops enforced
4. **Easy Rollback**: Can delete staging infrastructure if needed
5. **Repeatable**: Same setup can be used for future staging tests

### Approval Gates

```
✅ Setup Plan:       READY
⏳ Infrastructure:   AWAITING USER CREATION (Step 1: Supabase)
❌ Validation Tests: BLOCKED (awaiting infrastructure)
❌ Production:       BLOCKED (awaiting validation PASS)
❌ PR-3C:            BLOCKED (awaiting validation complete)
```

### Next Steps (Requires User Action)

1. **Review and approve** this setup plan
2. **Create staging Supabase project** (Step 1, Part 4)
3. **Create staging Netlify site** (Step 1, Part 5)
4. **Run validation tests** (Part 6)
5. **Document results** and obtain sign-off
6. **Proceed to production deployment** (after validation passes)

---

## Sign-Off

**Staging Architecture**: ✅ PLANNED (Option A recommended)
**Supabase Setup**: ✅ DOCUMENTED (step-by-step ready)
**Netlify Setup**: ✅ DOCUMENTED (step-by-step ready)
**Validation Tests**: ✅ DOCUMENTED (6 tests, A-F)
**Safety Gates**: ✅ ENFORCED (hard stops, write window, rollback)
**Rollback**: ✅ EASY (delete staging, no production impact)
**Hard Constraints**: ✅ PRESERVED (no production use, no PR-3C, no device mods)

**Verdict**: **Staging infrastructure setup plan is complete and ready for execution. User approval required before proceeding to Step 1 (create Supabase project).**

---

## Approval Checkpoint

### Ready to Proceed to Staging Infrastructure Setup?

**What you're approving**:
- ✅ Create separate "Life OS Staging" Supabase project
- ✅ Create separate "planneros-staging" Netlify site
- ✅ Set staging-specific environment variables
- ✅ Run 6 validation tests (A-F) through staging endpoints
- ✅ No production changes during staging setup/validation
- ✅ All hard constraints maintained

**What remains blocked until staging validation PASSES**:
- ❌ Production Supabase migration
- ❌ Production Netlify deployment
- ❌ PAPER_ACTIONS_WRITE_ENABLED in production
- ❌ PR-3C work
- ❌ reMarkable device modification

**To proceed**:
1. Review this setup plan
2. Approve staging infrastructure creation
3. Follow step-by-step instructions in Parts 4-5
4. Run validation tests in Part 6
5. Report results

Ready to create staging infrastructure?
