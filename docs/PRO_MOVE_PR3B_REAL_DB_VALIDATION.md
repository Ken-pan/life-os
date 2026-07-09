# PR-3B: Real DB Validation Plan

**Status**: Planning phase (awaiting database target approval)
**Commit**: 975931ec (Implement retry-safe Paper complete action behind flag)
**Scope**: Validate task.complete idempotency before enabling writes

---

## 1. Database Target Selection

### Option A: Local Supabase (Recommended for Initial Testing)
**Pros**:
- Complete isolation
- Full control
- No production data at risk
- Can reset/rollback easily
- Can be deleted after testing

**Cons**:
- Requires local Supabase setup
- May not have realistic data

**Migration Application**: Yes (safe, can rollback)
**Rollback Plan**: Delete docker container and recreate

---

### Option B: Staging Supabase
**Pros**:
- Realistic environment
- Staging data available
- Easy reset/rollback

**Cons**:
- Staging may be shared with other work
- Requires coordination if multi-user

**Migration Application**: Yes (with coordination)
**Rollback Plan**: `supabase db reset` or manual table drop

---

### Option C: Production Supabase
**⚠️ NOT RECOMMENDED for initial validation**

**Requires**:
- Explicit written approval from user
- Separate test user/task (never use production user data)
- Detailed rollback procedure
- Post-test log review

**Migration Application**: Only after staging passes
**Rollback Plan**: Migration rollback SQL (reverse script)

---

## 2. Migration Strategy

### File
```
apps/planner/supabase/migrations/20260709200000_add_paper_device_actions.sql
```

### Application Process
```bash
# Step 1: Backup existing data (production only)
supabase db pull  # Get current schema

# Step 2: Apply migration
supabase db push  # Applies unapplied migrations

# Step 3: Verify table exists
psql $DB_URL -c "SELECT COUNT(*) FROM paper_device_actions;"
```

### Rollback Plan
```bash
# Drop table and indexes
DROP TABLE IF EXISTS paper_device_actions CASCADE;

# Or in Supabase UI: Delete table + policies
```

---

## 3. Test Data Strategy

### Test Task Selection
**Criteria**:
- Must be non-production user (create test user if needed)
- Must be incomplete (completed=false initially)
- Must not conflict with real planning data

**Two Options**:

#### Option A: Create New Test Task
```
Title: "[PR-3B-TEST] Validate real write"
Completed: false
Priority: P3
User: test-user-uuid (if available)
```

#### Option B: Find Existing Test Task
```
Query: SELECT id, title, completed FROM planner_tasks
       WHERE user_id = <test-user>
       AND title LIKE '%test%'
       AND completed = false
       LIMIT 1
```

### Record Before Testing
- Task ID: _______________
- Initial completed: false
- Initial updatedAt: _______________
- Test user UUID: _______________
- Cleanup required: [ ] Yes [ ] No

---

## 4. Validation Tests

### Test A: Fresh Complete

**Setup**:
```
Device ID: pr3b-validation-test
Client Batch ID: validation-batch-1
Client Action ID: fresh-complete-{timestamp}
Task ID: {test-task-id}
Base Version: {current-task-updatedAt}
```

**Request**:
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
      "taskId": "'$TEST_TASK_ID'",
      "baseVersion": '$(date +%s000)'
    }]
  }'
```

**Expected Response**:
```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [{
    "clientActionId": "fresh-complete-...",
    "status": "applied",
    "taskId": "...",
    "completedAt": "...",
    "updatedAt": ...
  }],
  "duplicates": [],
  "conflicts": [],
  "rejected": [],
  "newCursor": "..."
}
```

**Database Verification**:
```sql
-- Task should be completed
SELECT completed, completedAt, updatedAt FROM planner_tasks
WHERE id = '{test-task-id}';
-- Expected: completed=true, completedAt and updatedAt set

-- Action log should exist
SELECT status, result FROM paper_device_actions
WHERE user_id = '{test-user-uuid}'
AND device_id = 'pr3b-validation-test'
AND client_action_id = 'fresh-complete-...';
-- Expected: status='applied', result contains taskId
```

### Test B: Duplicate Retry

**Setup**: Use EXACT same clientActionId from Test A

**Request**:
```bash
# Submit identical request to Test A
curl -X POST http://localhost:8888/api/paper/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPER_DEVICE_TOKEN" \
  -d '{
    "deviceId": "pr3b-validation-test",
    "clientBatchId": "validation-batch-1",
    "actions": [{
      "clientActionId": "fresh-complete-{SAME-ID}",
      "type": "task.complete",
      "taskId": "'$TEST_TASK_ID'",
      "baseVersion": {SAME-VERSION}
    }]
  }'
```

**Expected Response**:
```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [],
  "duplicates": [{
    "clientActionId": "fresh-complete-...",
    "status": "duplicate",
    "priorStatus": "applied",
    "priorResult": {
      "taskId": "...",
      "completedAt": "...",
      "updatedAt": ...
    },
    "appliedAt": "..."
  }],
  "conflicts": [],
  "rejected": [],
  "newCursor": "..."
}
```

**Database Verification**:
```sql
-- Task should STILL be completed (not mutated again)
SELECT completed, completedAt FROM planner_tasks
WHERE id = '{test-task-id}';
-- Expected: completedAt is SAME as Test A

-- Only ONE row for this client_action_id
SELECT COUNT(*) FROM paper_device_actions
WHERE user_id = '{test-user-uuid}'
AND device_id = 'pr3b-validation-test'
AND client_action_id = 'fresh-complete-...';
-- Expected: COUNT = 1 (not 2)
```

### Test C: Unsupported Actions

**Request**:
```bash
curl -X POST http://localhost:8888/api/paper/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPER_DEVICE_TOKEN" \
  -d '{
    "deviceId": "pr3b-validation-test",
    "clientBatchId": "validation-batch-unsupported",
    "actions": [
      {
        "clientActionId": "snooze-test",
        "type": "task.snooze",
        "taskId": "'$TEST_TASK_ID'",
        "snoozeDays": 1
      },
      {
        "clientActionId": "movetomorrow-test",
        "type": "task.moveTomorrow",
        "taskId": "'$TEST_TASK_ID'"
      },
      {
        "clientActionId": "create-test",
        "type": "task.create",
        "payload": {"title": "Test task"}
      }
    ]
  }'
```

**Expected Response**:
```json
{
  "batchStatus": "rejected",
  "dryRun": false,
  "applied": [],
  "duplicates": [],
  "conflicts": [],
  "rejected": [
    {
      "clientActionId": "snooze-test",
      "status": "rejected",
      "reason": "unsupported_action_type",
      "message": "Action type 'task.snooze' is not yet supported..."
    },
    {
      "clientActionId": "movetomorrow-test",
      "status": "rejected",
      "reason": "unsupported_action_type",
      "message": "Action type 'task.moveTomorrow' is not yet supported..."
    },
    {
      "clientActionId": "create-test",
      "status": "rejected",
      "reason": "unsupported_action_type",
      "message": "Action type 'task.create' is not yet supported..."
    }
  ]
}
```

**Database Verification**:
```sql
-- No task mutations should occur
SELECT completed FROM planner_tasks WHERE id = '{test-task-id}';
-- Expected: still true (from Test A)

-- No new tasks created
SELECT COUNT(*) FROM planner_tasks WHERE title LIKE '%Test task%';
-- Expected: 0 (or same count as before)
```

### Test D: Stale BaseVersion (If Applicable)

**Setup**: Modify test task via another method to make device version stale

**Request**:
```bash
curl -X POST http://localhost:8888/api/paper/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPER_DEVICE_TOKEN" \
  -d '{
    "deviceId": "pr3b-validation-test",
    "clientBatchId": "validation-batch-stale",
    "actions": [{
      "clientActionId": "stale-version-test",
      "type": "task.complete",
      "taskId": "'$TEST_TASK_ID'",
      "baseVersion": 1000000000000
    }]
  }'
```

**Expected Response**:
```json
{
  "batchStatus": "partially_applied",
  "conflicts": [{
    "clientActionId": "stale-version-test",
    "status": "conflict",
    "reason": "stale_version",
    "details": {
      "taskId": "...",
      "deviceVersion": 1000000000000,
      "serverVersion": ...,
      "currentState": {"completed": true}
    }
  }]
}
```

### Test E: Received State Recovery (If Practical)

**Setup**: Manually insert a log entry with status='received'

```sql
INSERT INTO paper_device_actions (
  id, user_id, device_id, client_batch_id, client_action_id,
  action_type, target_task_id, payload, status, created_at
) VALUES (
  gen_random_uuid(),
  '{test-user-uuid}',
  'pr3b-validation-test',
  'validation-batch-recovery',
  'recovery-test-' || now()::text,
  'task.complete',
  '{test-task-id}',
  '{"type":"task.complete","taskId":"..."}',
  'received',
  now()
);
```

**Request**: Retry with same clientActionId
```bash
curl -X POST http://localhost:8888/api/paper/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPER_DEVICE_TOKEN" \
  -d '{
    "deviceId": "pr3b-validation-test",
    "clientBatchId": "validation-batch-recovery",
    "actions": [{
      "clientActionId": "recovery-test-...",
      "type": "task.complete",
      "taskId": "'$TEST_TASK_ID'"
    }]
  }'
```

**Expected Response**: Duplicate with recovered=true
```json
{
  "duplicates": [{
    "clientActionId": "recovery-test-...",
    "status": "duplicate",
    "priorStatus": "received (recovered)",
    "priorResult": {"taskId": "...", "recovered": true}
  }]
}
```

**Database Verification**:
```sql
-- Log should be transitioned to 'applied'
SELECT status, result FROM paper_device_actions
WHERE client_action_id = 'recovery-test-...';
-- Expected: status='applied', result contains recovered=true
```

---

## 5. Cleanup Strategy

### Staging/Local Database
- Delete test task if created
- Keep paper_device_actions logs (useful for debugging)
- Verify counts haven't exploded

### Production Database (If Used)
- Never delete production user data
- Can delete test user account if created
- MUST preserve paper_device_actions logs for audit
- Document test in operational notes

---

## 6. Build Verification

```bash
npm run check
npm run build:planner
```

**Expected**: All pass (no code changes in validation phase)

---

## 7. Results Template

### Database Target
- [ ] Local Supabase
- [ ] Staging Supabase
- [ ] Production Supabase (explicit approval required)

### Migration Status
- Applied: [ ] Yes [ ] No
- Rollback tested: [ ] Yes [ ] No

### Test Results

| Test | Status | Notes |
|------|--------|-------|
| Fresh complete | [ ] PASS [ ] FAIL | |
| Duplicate retry | [ ] PASS [ ] FAIL | |
| Unsupported actions | [ ] PASS [ ] FAIL | |
| Stale version | N/A [ ] PASS [ ] FAIL | |
| Received recovery | N/A [ ] PASS [ ] FAIL | |
| Cleanup | [ ] PASS [ ] FAIL | |
| Check/build | [ ] PASS [ ] FAIL | |

### Recommendation

- [ ] Can enable PAPER_ACTIONS_WRITE_ENABLED=true in staging
- [ ] Can enable PAPER_ACTIONS_WRITE_ENABLED=true in production
- [ ] Cannot enable yet (blocker: ____________)

---

## Hard Constraints

- ❌ No PR-3C work
- ❌ No device modifications
- ❌ No production writes without passing validation + explicit approval
- ❌ No task.snooze, task.moveTomorrow, task.create implementation
- ❌ PAPER_ACTIONS_WRITE_ENABLED remains false until validation PASSES

---

## Next Steps After Validation

### If PASS:
1. Document results in PRO_MOVE_PR3B_REAL_DB_VALIDATION.md
2. Get stakeholder sign-off
3. Apply migration to target environment
4. Enable PAPER_ACTIONS_WRITE_ENABLED=true (gradually)
5. Monitor paper_device_actions log

### If FAIL:
1. Document failure scenario
2. Investigate root cause
3. Fix in PR-3B-FIX branch
4. Re-run validation
5. Return to this decision point

---

## Database Target: PRODUCTION SUPABASE (APPROVED)

✅ **User Approval**: Explicit approval for production validation
**Test User Required**: Must use separate test user (NOT production account)
**Rollback Plan Required**: Before any writes
**Post-Test Audit Required**: Review all paper_device_actions logs

### Production Validation Safety Constraints

1. **Test User Isolation**
   - Create or use dedicated test user UUID (e.g., test-pr3b-validation@example.com)
   - Never use production user data
   - Separate test tasks from real planning data
   - Can safely delete test data after validation

2. **Rollback Prepared**
   - Migration rollback command: `DROP TABLE paper_device_actions CASCADE;`
   - Or via Supabase dashboard: Delete table + RLS policies
   - Never delete production audit logs (keep paper_device_actions rows for review)

3. **PAPER_ACTIONS_WRITE_ENABLED Safety**
   - Set locally only for validation testing
   - **DO NOT** commit this to production environment variables
   - **DO NOT** enable in Netlify production env
   - After validation: disable again (keep false/unset)

4. **Monitoring & Audit**
   - Monitor paper_device_actions table during and after validation
   - Review all inserted rows
   - Document test user UUID and task IDs in results
   - Preserve logs for post-validation review

### Next Step: Execute Validation Tests

Once you're ready, provide:
1. Production Supabase endpoint (or confirm using existing connection)
2. Test user UUID (or email to create test user)
3. Ready to apply migration to production (yes/no)

Then validation will proceed with PAPER_ACTIONS_WRITE_ENABLED=true against production.
