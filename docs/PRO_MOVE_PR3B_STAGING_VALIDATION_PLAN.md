# PR-3B: Staging Validation Plan

**Status**: ⏳ **PLANNING PHASE**
**Date**: 2026-07-09
**Prerequisite**: PR-3B local validation PASSED
**Goal**: Validate task.complete write path through staging infrastructure before production enablement
**Hard Block**: Production enablement remains blocked until staging validation PASSES

---

## Executive Summary

PR-3B local validation passed all tests. Staging validation is the next required step to:
1. Verify Netlify routing/infrastructure integration
2. Test against realistic staging Supabase instance
3. Confirm handler behavior in staging environment
4. Validate that local behavior transfers to deployed environment

**No deployment will occur during planning phase.**

---

## 🔴 BLOCKER: STAGING INFRASTRUCTURE DOES NOT EXIST

**Investigation Result**: No dedicated staging Supabase project or staging deployment infrastructure found.

**Current State**:
- ✅ Netlify production site exists (planneros-ken)
- ✅ Production Supabase exists (Life OS project, active)
- ❌ Staging Supabase does NOT exist
- ❌ Staging deployment does NOT exist
- ❌ NO staging credentials available

**Hard Stop**: Cannot proceed with staging validation until staging Supabase project is created.

**Reason**: Production Supabase cannot be used for staging testing (violates safety isolation).

**See**: `docs/PRO_MOVE_PR3B_STAGING_INFRA_INVESTIGATION.md` for full infrastructure audit.

---

## Part 0: Infrastructure Setup Required (Before Proceeding)

### Prerequisite: Create Staging Supabase Project

Before staging validation can run, a separate Supabase project must be created:

```bash
# Via Supabase Dashboard (https://app.supabase.com):
1. Create new project: "Life OS Staging" or "PR-3B Staging"
2. Region: us-east-2 (same as production for consistency)
3. Wait for creation (~5 minutes)
4. Copy credentials:
   - STAGING_SUPABASE_URL = https://[staging-ref].supabase.co
   - STAGING_SUPABASE_ANON_KEY = [anon-key]
   - STAGING_SUPABASE_SERVICE_ROLE_KEY = [service-role-key]
```

### Blocker Checklist Before Proceeding
- [ ] Staging Supabase project created (separate from production)
- [ ] Staging credentials obtained and documented securely
- [ ] Staging endpoint determined (Netlify preview or manual test server)

**Do not proceed with rest of validation plan until these are complete.**

---

## Part 1: Staging Target Inventory

### Current State
```
Netlify Site:           Linked (siteId: d478e880-b27e-44da-925b-3322e9a6ccda)
Admin/Project URL:      Undefined (site not published or limited access)
Netlify User:           Ken pan (jpan28@id.iit.edu)
Git Remotes:            origin only (no staging branch)
Staging Branch:         None found
Staging Supabase:       Not identified
Staging Env Config:     No .env.staging or staging config files
Deploy Previews:        Not configured
```

### Options for Staging Validation

#### Option A: GitHub Branch Deploy Preview (Recommended)
- **Requires**: Push to new branch (e.g., `staging/pr-3b-validation`)
- **Netlify**: Automatically creates preview for PR/branch
- **Supabase**: Use existing staging or create temporary
- **Advantage**: Netlify routing is tested
- **Temporary**: Preview is ephemeral

#### Option B: Staging Netlify Site (if available)
- **Requires**: Separate Netlify site linked to staging branch
- **Supabase**: Dedicated staging instance
- **Advantage**: Persistent staging environment
- **Prerequisite**: Must be set up separately

#### Option C: Production Site with Staging Supabase (NOT Recommended)
- **Risk**: Writes to production Netlify but staging DB
- **Inconsistency**: Would not test true production path
- **Avoid**: For safety and clarity

#### Option D: Manual Local + Staging Supabase Combo
- **Local Netlify Dev** (if fixed): Test with staging Supabase
- **Requires**: Staging Supabase credentials
- **Limitation**: Doesn't test production Netlify routing

**Recommended**: Option A (GitHub branch deploy preview) if Netlify auto-preview is enabled, otherwise Option B.

### Investigation Needed
Before proceeding, must confirm:
- [ ] Does Netlify site have deploy preview enabled?
- [ ] Is there a staging Supabase project available?
- [ ] Can we create a temporary staging Supabase instance?
- [ ] What is the Netlify site's project URL?

---

## Part 2: Environment Variables for Staging

### Required Staging Env Vars

| Var Name | Type | Required | Public | Notes |
|----------|------|----------|--------|-------|
| `PUBLIC_SUPABASE_URL` | public | YES | YES | Staging Supabase endpoint (e.g., https://staging-xxxx.supabase.co) |
| `PUBLIC_SUPABASE_ANON_KEY` | public | YES | YES | Staging anon key (safe to share) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | YES | NO | Staging service role (SECRET, server-only) |
| `PAPER_DEVICE_TOKEN` | secret | YES | NO | Bearer token for testing (SECRET, local-only) |
| `PAPER_DEVICE_USER_ID` | public | YES | YES | UUID of staging test user |
| `PAPER_ACTIONS_WRITE_ENABLED` | config | YES | NO | **MUST be false by default** in staging |
| `BROWSER` | config | OPT | YES | Set to "none" for automated testing |

### Classification

**Must Never Commit**:
- SUPABASE_SERVICE_ROLE_KEY (production or staging)
- PAPER_DEVICE_TOKEN
- PAPER_ACTIONS_WRITE_ENABLED=true

**Server-Only** (Netlify Functions only):
- SUPABASE_SERVICE_ROLE_KEY

**Public-Safe** (can be in code/docs):
- PUBLIC_SUPABASE_URL
- PUBLIC_SUPABASE_ANON_KEY
- PAPER_DEVICE_USER_ID

**Deployment Method**:
- Netlify UI: Set in Site Settings → Build & Deploy → Environment
- Local testing: Set in shell before running Netlify dev
- GitHub Actions: Store as secrets, inject during CI/CD

---

## Part 3: Migration Plan

### Migration File
```
apps/planner/supabase/migrations/20260709200000_add_paper_device_actions.sql
```

### Staging-Only Application

#### Step 1: Identify Staging Supabase
```bash
# Get staging Supabase credentials
# Source: GitHub Secrets / Vault / Netlify UI / Documentation
export STAGING_SUPABASE_URL="https://staging-xxxx.supabase.co"
export STAGING_SUPABASE_PASSWORD="[staging-password]"
```

#### Step 2: Apply Migration to Staging Only
```bash
# Connect to staging Supabase using supabase CLI
supabase link --project-ref [staging-project-ref]

# Push migration to staging
supabase db push

# Verify (from staging URL/credentials):
psql [staging-connection-string] -c "SELECT tablename FROM pg_tables WHERE tablename='paper_device_actions';"
```

**Critical**: Do NOT apply to production during this step.

#### Step 3: Verify paper_device_actions Exists
```bash
# Query staging DB to confirm table created
curl -H "Authorization: Bearer [staging-anon-key]" \
  "https://staging-xxxx.supabase.co/rest/v1/paper_device_actions?limit=0" \
  | grep -q "count" && echo "✅ Table exists" || echo "❌ Table not found"
```

### Rollback Plan

If staging validation fails, rollback is:
```bash
# Connect to staging Supabase
supabase link --project-ref [staging-project-ref]

# Drop table (custom migration or direct SQL)
psql [staging-connection-string] -c "DROP TABLE IF EXISTS paper_device_actions CASCADE;"

# Verify rollback
psql [staging-connection-string] -c "SELECT COUNT(*) FROM paper_device_actions" \
  # Should return "table does not exist" error
```

### Production Remains Untouched
- ❌ No migrations applied to production
- ❌ No env vars changed in production
- ❌ No code deployed to production
- ✅ Production Supabase untouched during staging validation

---

## Part 4: Staging Test Data Plan

### Test User Strategy

#### Create Staging Test User (Option A: Direct DB Insert)
```bash
psql [staging-connection-string] << 'EOF'
INSERT INTO auth.users (
  id, email, raw_user_meta_data, created_at, updated_at,
  email_confirmed_at, last_sign_in_at
) VALUES (
  'staging-test-user-uuid'::uuid,
  'staging-test@pr3b.local',
  '{"name":"PR-3B Staging Test"}'::jsonb,
  now(), now(), now(), now()
)
ON CONFLICT DO NOTHING;

SELECT id FROM auth.users WHERE email = 'staging-test@pr3b.local';
EOF
```

#### Record Test User UUID
```
Test User UUID: [staging-test-user-uuid] ← Use for PAPER_DEVICE_USER_ID
Test Email:     staging-test@pr3b.local
```

### Test Task Strategy

#### Create Staging Test Task
```bash
curl -X POST "https://staging-xxxx.supabase.co/rest/v1/planner_tasks" \
  -H "apikey: [staging-anon-key]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [staging-user-jwt]" \
  -d '{
    "id": "staging-test-task-001",
    "user_id": "staging-test-user-uuid",
    "data": {
      "title": "[PR-3B-STAGING] Validation test task",
      "completed": false,
      "priority": "P3"
    }
  }'
```

#### Record Test Task ID
```
Test Task ID: staging-test-task-001
Initial State: completed = false
```

### Data Isolation
- ✅ Separate test user (not production user)
- ✅ Separate test task (not production task)
- ✅ Clearly marked with [PR-3B-STAGING] prefix
- ✅ Can be safely deleted after validation
- ✅ No risk to real staging data

---

## Part 5: Staging Validation Tests

### Test Environment Setup
```bash
# Set staging env vars (LOCAL ONLY, do not commit)
export PUBLIC_SUPABASE_URL="https://staging-xxxx.supabase.co"
export PUBLIC_SUPABASE_ANON_KEY="[staging-anon-key]"
export SUPABASE_SERVICE_ROLE_KEY="[staging-service-role]"
export PAPER_DEVICE_TOKEN="staging-test-token"
export PAPER_DEVICE_USER_ID="staging-test-user-uuid"
export PAPER_ACTIONS_WRITE_ENABLED="true"

# Staging endpoint (via deploy preview or staging netlify URL)
ENDPOINT="https://staging-pr-3b.netlify.app/api/paper/actions"
```

### Test A: Fresh task.complete

**Request**:
```bash
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer staging-test-token" \
  -d '{
    "deviceId": "staging-device",
    "clientBatchId": "staging-batch-a",
    "actions": [{
      "clientActionId": "staging-fresh-'$(date +%s)'",
      "type": "task.complete",
      "taskId": "staging-test-task-001",
      "baseVersion": '$(date +%s000)'
    }]
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [{
    "clientActionId": "staging-fresh-...",
    "status": "applied",
    "taskId": "staging-test-task-001",
    "completedAt": "2026-07-09T...",
    "updatedAt": ...
  }]
}
```

**Verification**:
- ✅ HTTP 200 status
- ✅ dryRun = false (real write)
- ✅ applied[] contains action
- ✅ Query staging DB: task completed = true
- ✅ Query staging DB: paper_device_actions status = applied

**Result**: [ ] PASS [ ] FAIL

---

### Test B: Duplicate Retry

**Request** (identical clientActionId):
```bash
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer staging-test-token" \
  -d '{
    "deviceId": "staging-device",
    "clientBatchId": "staging-batch-a",
    "actions": [{
      "clientActionId": "staging-fresh-...",
      "type": "task.complete",
      "taskId": "staging-test-task-001"
    }]
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "batchStatus": "applied",
  "duplicates": [{
    "clientActionId": "staging-fresh-...",
    "status": "duplicate",
    "priorStatus": "applied",
    "priorResult": { "taskId": "..." }
  }]
}
```

**Verification**:
- ✅ HTTP 200 status
- ✅ duplicates[] contains prior result (not applied[])
- ✅ Only 1 paper_device_actions row for same user/device/clientActionId
- ✅ Task completedAt unchanged (no second mutation)

**Result**: [ ] PASS [ ] FAIL

---

### Test C: Unsupported Actions

**Request**:
```bash
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer staging-test-token" \
  -d '{
    "deviceId": "staging-device",
    "clientBatchId": "staging-batch-c",
    "actions": [
      {"clientActionId": "staging-snooze-'$(date +%s)'", "type": "task.snooze", "taskId": "staging-test-task-001"},
      {"clientActionId": "staging-move-'$(date +%s)'", "type": "task.moveTomorrow", "taskId": "staging-test-task-001"},
      {"clientActionId": "staging-create-'$(date +%s)'", "type": "task.create", "payload": {"title": "test"}}
    ]
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "batchStatus": "rejected",
  "rejected": [
    {"status": "rejected", "reason": "unsupported_action_type", "message": "...task.snooze..."},
    {"status": "rejected", "reason": "unsupported_action_type", "message": "...task.moveTomorrow..."},
    {"status": "rejected", "reason": "unsupported_action_type", "message": "...task.create..."}
  ]
}
```

**Verification**:
- ✅ HTTP 200 status
- ✅ All 3 actions in rejected[]
- ✅ No task mutations

**Result**: [ ] PASS [ ] FAIL

---

### Test D: Received State Recovery

**Setup**: Create received-state log entry manually
```bash
psql [staging-connection-string] << 'EOF'
INSERT INTO public.paper_device_actions (
  user_id, device_id, client_batch_id, client_action_id,
  action_type, target_task_id, payload, status, created_at
) VALUES (
  'staging-test-user-uuid'::uuid,
  'staging-device',
  'staging-batch-recovery',
  'staging-recovery-test',
  'task.complete',
  'staging-test-task-001',
  '{}'::jsonb,
  'received',
  now()
);
EOF
```

**Request** (retry with same clientActionId):
```bash
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer staging-test-token" \
  -d '{
    "deviceId": "staging-device",
    "clientBatchId": "staging-batch-recovery",
    "actions": [{
      "clientActionId": "staging-recovery-test",
      "type": "task.complete",
      "taskId": "staging-test-task-001"
    }]
  }'
```

**Expected**: Received state reconciles to applied or applied[] with recovered=true

**Verification**:
- ✅ Log transitioned from received to applied
- ✅ Task completed (if not already completed)
- ✅ Response indicates recovery if applicable

**Result**: [ ] PASS [ ] FAIL

---

### Test E: Stale baseVersion

**Expected**: Document PR-3B behavior (already tested in local)

**Verification**:
- ✅ Behavior matches local validation
- ✅ Marked as alreadyCompleted if task already done
- ✅ Response consistent

**Result**: [ ] PASS [ ] FAIL

---

## Part 6: Netlify Routing Validation

### Critical: Test Through Production Endpoint Path

**Endpoint**: `POST https://[staging-domain]/api/paper/actions`

This is where Netlify routing is validated:
- ✅ Netlify dev server routes to functions
- ✅ Authorization header is passed correctly
- ✅ Request/response serialization works
- ✅ Error handling in routing layer works

**Verification**:
- ✅ All 5 tests (A-E) work through deployed endpoint
- ✅ Responses consistent with local validation
- ✅ No Netlify-specific errors

**Result**: [ ] PASS [ ] FAIL

---

## Part 7: Safety Plan - Write Enablement Window

### Before Staging Tests
```bash
# PAPER_ACTIONS_WRITE_ENABLED must be FALSE by default
PAPER_ACTIONS_WRITE_ENABLED=false  # Default in staging
```

### During Staging Tests Only
```bash
# Temporarily enable writes for test window
export PAPER_ACTIONS_WRITE_ENABLED=true

# Run all validation tests (A-E)
# <tests here>

# After tests complete, IMMEDIATELY disable
unset PAPER_ACTIONS_WRITE_ENABLED  # Back to false/default
```

### After Staging Tests
```bash
# PAPER_ACTIONS_WRITE_ENABLED must remain false in staging env vars
# Do not commit true value
# Document that validation passed
```

### Production
```bash
# PAPER_ACTIONS_WRITE_ENABLED must remain false/unset
# Do not enable in production until staging validation PASSES
# Requires explicit approval before production enablement
```

---

## Part 8: Validation PASS Criteria

All of the following must be TRUE:

- [ ] Test A (Fresh Complete) PASS
- [ ] Test B (Duplicate Retry) PASS
- [ ] Test C (Unsupported Actions) PASS
- [ ] Test D (Received Recovery) PASS
- [ ] Test E (Stale baseVersion) PASS
- [ ] Netlify routing VERIFIED
- [ ] No secrets committed
- [ ] Write flag disabled after testing
- [ ] Production Supabase untouched
- [ ] Test data can be cleaned up safely

---

## Hard Stops

- ❌ Do not deploy to production during staging validation
- ❌ Do not enable writes in production
- ❌ Do not apply migration to production
- ❌ Do not modify the reMarkable device
- ❌ Do not start PR-3C
- ❌ Do not commit PAPER_ACTIONS_WRITE_ENABLED=true
- ❌ Do not commit staging credentials

---

## Final Recommendation

**Status**: ⏳ PLANNING PHASE (NOT YET EXECUTING)

**Before Proceeding to Staging Validation Execution:**

1. **Investigate Staging Infrastructure**
   - Confirm Netlify deploy preview capability
   - Identify or create staging Supabase instance
   - Document staging credentials location

2. **Prepare Staging Environment**
   - Set up staging database with migration
   - Create staging test user and task
   - Configure staging Netlify (or GitHub branch deploy)

3. **Execution Approval Required**
   - All staging resources ready
   - Test data isolated from production
   - Write enablement window planned
   - Rollback procedure documented

4. **Then Execute Validation Tests**
   - Run A-E tests through deployed endpoint
   - Verify all PASS criteria
   - Document results
   - Disable writes
   - Clean up test data

**Production Enablement**: ❌ BLOCKED
- Cannot proceed until staging validation PASSES
- Requires explicit staging sign-off
- Requires explicit production deployment approval

---

## Sign-Off

**Staging Validation Plan**: ✅ CREATED
**Staging Resources Identified**: ⏳ NEEDS INVESTIGATION
**Staging Database**: ⏳ NEEDS SETUP
**Test Data Plan**: ✅ DOCUMENTED
**Netlify Routing Validation**: ✅ PLANNED
**Safety Plan**: ✅ DOCUMENTED
**Hard Stops**: ✅ ENFORCED

**Verdict**: Staging validation plan is complete and ready for execution phase, pending staging infrastructure investigation and setup.

**Next Step**: Investigate staging infrastructure (Netlify deploy preview, Supabase staging instance) and confirm readiness to execute validation tests.
