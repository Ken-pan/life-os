# PR-3B: Real DB Validation — DEFERRED (Docker Not Available)

**Status**: ⏸️ **DEFERRED** — Waiting for local Docker/Supabase availability
**Date**: 2026-07-09
**Reason**: Colima (macOS Docker daemon) failed to start
**Approved Target**: Local Supabase (NOT production, NOT staging)

---

## Problem

Real write validation for PR-3B requires a local Supabase instance to test idempotency safely. The environment check found:

✅ Supabase CLI: `2.109.0`
✅ Migration file: `apps/planner/supabase/migrations/20260709200000_add_paper_device_actions.sql`
❌ Docker daemon: Failed to start (colima error: `exit status 1`)
❌ Local Supabase: Cannot run without Docker

**Hard Constraints** (user-enforced):
- ❌ Do not apply migration to production
- ❌ Do not use production Supabase
- ❌ Do not use staging Supabase
- ❌ Do not enable PAPER_ACTIONS_WRITE_ENABLED in production
- ❌ Do not proceed to PR-3C

---

## Unblocking Steps

To resume validation, resolve Docker daemon issue:

### Option 1: Restart Colima
```bash
# Check colima status
colima status

# Restart colima
colima stop
colima start

# Verify Docker is running
docker ps
```

### Option 2: Check System Requirements
```bash
# Verify Docker Desktop or colima is installed
which docker
which colima

# Check system resources
sysctl hw.memsize
sysctl hw.ncpu
```

### Option 3: Manual Docker Start
- If using Docker Desktop: Open Docker.app
- If using colima: Check `/Users/kenpan/.colima/_lima/colima/serial*.log` for error details

---

## Validation Execution Checklist

Once Docker is running, follow this sequence:

### Phase 1: Start Local Supabase
```bash
cd /Users/kenpan/「Projects」/life-os
supabase start
```

Expected output:
```
API URL: http://localhost:54321
Database: localhost:54322
...
```

### Phase 2: Verify Local Instance
```bash
# Test connection
psql postgresql://postgres:postgres@localhost:54322/postgres -c "SELECT 1"

# Should return: 1
```

### Phase 3: Apply Migration
```bash
cd apps/planner
supabase db push
```

Expected result:
- `paper_device_actions` table created
- UNIQUE constraint on (user_id, device_id, client_action_id) enforced
- RLS policies applied

### Phase 4: Prepare Test Data

**Create test user** (in Supabase Auth or use existing):
```
Email: test-pr3b-validation@example.com
Or use: {test-user-uuid}
```

**Create test task** (INSERT into planner_tasks):
```sql
INSERT INTO planner_tasks (user_id, data)
VALUES ('{test-user-uuid}', '{
  "title": "[PR-3B-TEST] Validation complete action",
  "completed": false,
  "priority": "P3"
}'::jsonb);
```

Record the task ID for validation.

### Phase 5: Set Environment Variables
```bash
export PAPER_DEVICE_TOKEN="Bearer test-token-pr3b"
export PAPER_DEVICE_USER_ID="{test-user-uuid}"
export PAPER_ACTIONS_WRITE_ENABLED="true"  # LOCAL ONLY
export SUPABASE_URL="http://localhost:54321"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..." # From supabase start output
```

### Phase 6: Run Validation Tests

See `PRO_MOVE_PR3B_REAL_DB_VALIDATION.md` sections 4-5 for complete test scripts.

**Test A: Fresh Complete**
```bash
curl -X POST http://localhost:8888/api/paper/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPER_DEVICE_TOKEN" \
  -d '{
    "deviceId": "pr3b-validation-test",
    "clientBatchId": "validation-batch-1",
    "actions": [{
      "clientActionId": "fresh-complete-'$(date +%s)'",
      "type": "task.complete",
      "taskId": "{task-id}",
      "baseVersion": '$(date +%s000)'
    }]
  }'
```

**Test B: Duplicate Retry** (use same clientActionId from Test A)

**Test C: Unsupported Actions** (snooze, moveTomorrow, create)

**Test D: Received State Recovery** (manual log insert + retry)

### Phase 7: Verify Results

**Database checks**:
```bash
psql postgresql://postgres:postgres@localhost:54322/postgres

-- Check task was completed
SELECT completed, completedAt FROM planner_tasks WHERE id = '{test-id}';

-- Check action log
SELECT status, result, created_at FROM paper_device_actions
WHERE user_id = '{test-user-uuid}';

-- Verify UNIQUE constraint prevented duplicates
SELECT COUNT(*) FROM paper_device_actions
WHERE user_id = '{test-user-uuid}' AND client_action_id = 'fresh-complete-...';
-- Expected: 1 (not 2+)
```

### Phase 8: Document Results

Update [PRO_MOVE_PR3B_REAL_DB_VALIDATION.md](PRO_MOVE_PR3B_REAL_DB_VALIDATION.md) section 7 with:
- All test pass/fail status
- Key results (task completed, log entries correct)
- Recommendation for production enablement

### Phase 9: Cleanup

```bash
# Stop local Supabase
supabase stop

# Disable write flag
unset PAPER_ACTIONS_WRITE_ENABLED
```

---

## After Validation Passes

### Do NOT proceed to any of these steps:
- ❌ Do NOT enable PAPER_ACTIONS_WRITE_ENABLED in production
- ❌ Do NOT apply migration to production yet
- ❌ Do NOT proceed to PR-3C
- ❌ Do NOT create additional write operations

### What DOES happen after local validation passes:
1. Document all test results
2. Commit results (if applicable)
3. Wait for explicit approval before any production changes
4. Only then can migration be applied to staging/production
5. Only then can writes be enabled (gradually, with monitoring)

---

## Status: Awaiting Docker Recovery

**Blocker**: Colima/Docker daemon not running
**Action**: Restart Docker via colima or Docker Desktop
**Next Step**: Once Docker is running, execute Phase 1 (supabase start)
**Validation Document**: [PRO_MOVE_PR3B_REAL_DB_VALIDATION.md](PRO_MOVE_PR3B_REAL_DB_VALIDATION.md) (ready, awaiting local DB)

**Do not proceed without local Supabase running.**
