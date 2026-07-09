# PR-3B: Hard Gate Analysis — CRITICAL ISSUE FOUND

**Status**: ⚠️ **WARN** — Implementation incomplete, write ordering is NOT retry-safe
**Date**: 2026-07-09
**Verdict**: Do NOT merge until write ordering is corrected

---

## Executive Summary

PR-3B implements the safety switch and applyActions() function correctly **in most respects**, but the **task mutation ordering violates idempotency principles and is not retry-safe**.

**Critical Issue**: Current implementation updates the task **before** inserting the action log entry. This breaks the guarantee that a network failure between task update and log insert can be safely retried.

**Required Fix**: Implement "log-first" pattern: insert action log with status='received' BEFORE updating task, then transition to status='applied' after success.

---

## 1. Git Diff Summary ✅

### Files Changed (Correct)
- `apps/planner/server/paperService.mjs` — Added applyActions() function (~240 lines)
- `apps/planner/netlify/functions/paper-actions.mjs` — Added safety switch
- `apps/planner/supabase/migrations/20260709200000_add_paper_device_actions.sql` — Created (unapplied)

### Code Quality (Good)
- ✅ Safety switch correctly implemented
- ✅ Unsupported actions correctly rejected
- ✅ Idempotency check implemented
- ✅ Conflict detection logic sound
- ✅ Error handling mostly correct

---

## 2. Migration Path Verification ✅

**Path**: `apps/planner/supabase/migrations/20260709200000_add_paper_device_actions.sql`

**Correct Location**: Yes
- Matches pattern of other apps (finance, music, fitness)
- Each app has its own supabase/migrations directory
- Root supabase/ is empty (only .temp)

**Migration Status**: Unapplied ✅
- File created, no Supabase changes made
- Ready to apply when production deploys

---

## 3. CRITICAL: Write Ordering Analysis ⚠️ WARN

### Current Implementation (UNSAFE)

```javascript
// Line 585-611: Update task FIRST
const { error: updateError } = await supabase
  .from('planner_tasks')
  .update({
    data: {
      ...task,
      completed: true,
      completedAt,
      updatedAt
    }
  })
  .eq('user_id', userId)
  .eq('id', action.taskId);

if (updateError) {
  failed.push(...);
  continue;
}

// Line 613-633: Insert log SECOND
const { error: insertError } = await supabase
  .from('paper_device_actions')
  .insert({
    status: 'applied',
    result: { taskId, completedAt, updatedAt },
    ...
  });
```

### The Problem: Not Retry-Safe

**Scenario: Network fails between task update and log insert**

```
Time 1: Device sends: {batch-1, action-1, task.complete, taskId=ABC}

Time 2: Server updates task ABC
        completed = true ✅
        Request ends successfully from client perspective

Time 3: Before server can insert action log:
        Network connection drops
        Log insert never happens ❌

Time 4: Device timeout, retries: same {batch-1, action-1}

Time 5: Server queries paper_device_actions
        Does NOT find prior action (it was never inserted)
        Proceeds to update task ABC again

Time 6: Task is already completed, so update seems harmless
        But: The invariant is violated
        Logic expects: "if no log entry exists, action hasn't been processed yet"
        Reality: Task WAS mutated, but log wasn't created
```

**Consequence**: Duplicate task updates occur in a way that bypasses idempotency detection.

### Correct Pattern: Log-First (SAFE)

```javascript
// Step 1: Insert action log with status='received' FIRST
const logInsertResult = await supabase
  .from('paper_device_actions')
  .insert({
    user_id: userId,
    device_id: batch.deviceId,
    client_action_id: action.clientActionId,
    status: 'received',  // Mark as in-progress
    created_at: now
  });

if (logInsertResult.error) {
  // If insert fails, nothing is mutated yet, safe to retry
  failed.push(...);
  continue;
}

// Step 2: Update task
const updateResult = await supabase
  .from('planner_tasks')
  .update({
    data: { completed: true, completedAt, updatedAt }
  })
  .eq('id', actionTaskId);

if (updateResult.error) {
  // Mark log as failed (or update its status)
  // Task not mutated yet
  failed.push(...);
  continue;
}

// Step 3: Update log to status='applied' with result
const updateLogResult = await supabase
  .from('paper_device_actions')
  .update({
    status: 'applied',
    result: { taskId, completedAt, updatedAt },
    applied_at: now
  })
  .eq('id', logId);

// If log update fails, task IS completed but log shows 'received'
// Next retry: log exists, treated as incomplete/in-progress
// Safe to retry without double-completing
```

**Why This Is Safe**:
1. Log entry exists immediately after insert → idempotency check catches retries
2. If task update fails, log still exists with status='received' → safe to retry
3. If log transition to 'applied' fails, log shows 'received' → retry is safe (task already completed)
4. Device reads log status and knows outcome of prior attempt

---

## 4. Client Service Role Leak Check ✅ PASS

### Client Code (src/)
```bash
$ grep -R "SUPABASE_SERVICE_ROLE_KEY" apps/planner/src
(no matches)

$ grep -R "createClient.*SERVICE_ROLE" apps/planner/src
(no matches)
```

**Result**: ✅ No service role in browser code

### Server Code (Expected)
```bash
$ grep -R "SUPABASE_SERVICE_ROLE_KEY" apps/planner/server
apps/planner/server/pushEnv.mjs:13:  return readEnv('SUPABASE_SERVICE_ROLE_KEY')
```

**Result**: ✅ Only in server-side helpers

---

## 5. Default Mode Verification ✅ PASS

**Code** (paper-actions.mjs, line 61-68):
```javascript
const writeEnabled = readEnv('PAPER_ACTIONS_WRITE_ENABLED') === 'true';

if (writeEnabled) {
  responseBody = await applyActions(userId, body);
} else {
  responseBody = await dryRunActions(userId, body);
}
```

**Default Behavior**:
- If `PAPER_ACTIONS_WRITE_ENABLED` is not set → undefined
- `undefined === 'true'` → false
- Calls dryRunActions() → dry-run mode active

**Result**: ✅ Default is safe (dry-run mode)

---

## 6. Real Write Validation Plan (NOT EXECUTED)

### Database Selection
❌ **Production Supabase**: NOT used (unsafe for destructive tests)
❌ **Local Supabase**: Could be used if container available
⚠️ **Staging Supabase**: Would require explicit approval

### Test Would Require
1. **Database**: Local Supabase or explicit staging approval
2. **Test Task**: Create test task, record ID
3. **Setup**: Set PAPER_ACTIONS_WRITE_ENABLED=true
4. **Test Sequence**:
   - Submit task.complete with fresh clientActionId
   - Verify task.completed = true
   - Submit same clientActionId again
   - Verify duplicates[] response (no second update)
   - Submit task.snooze
   - Verify rejected[] with unsupported_action message
   - Submit task.complete with stale baseVersion on unchanged task
   - Verify conflicts[] with stale_version reason
5. **Verification**:
   - Query paper_device_actions table directly
   - Verify UNIQUE constraint prevented duplicates
   - Verify log entries have correct statuses
6. **Cleanup**: Delete test task and logs

### Why Test Was Skipped
- Write ordering issue found during code review
- No point in testing unsafe code
- Fixing write ordering is prerequisite to testing

---

## 7. Checks and Builds ✅ PASS

```bash
$ npm run check
COMPLETED 748 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
✅ PASS

$ npm run build:planner
✓ built in 1.31s
✔ Wrote site to "build"
✔ done
✅ PASS
```

---

## 8. Device Status ✅ UNMODIFIED

- ✅ No SSH access to reMarkable Pro Move
- ✅ No Wi-Fi enabled
- ✅ No app deployed
- ✅ xochitl running
- ✅ `/home/root/planneros-lite` workspace untouched
- ✅ Root filesystem `/` not modified

---

## Summary Table

| Criterion | Status | Notes |
|-----------|--------|-------|
| Migration path | ✅ Correct | apps/planner/supabase/migrations/ |
| Migration applied | ✅ No | Unapplied, ready for production |
| Write ordering | ⚠️ UNSAFE | Task updated before log inserted — NOT retry-safe |
| Service role leak | ✅ No | Only in server code |
| Default mode | ✅ Dry-run | PAPER_ACTIONS_WRITE_ENABLED gate working |
| Code compiles | ✅ Yes | npm check and build pass |
| Device modified | ✅ No | Completely untouched |
| Real writes tested | ❌ No | Skipped due to write ordering issue |

---

## REQUIRED FIX

### Before Merge: Implement Log-First Pattern

**Objective**: Make applyActions() retry-safe by inserting log entry before updating task.

**Implementation Steps**:
1. Insert `paper_device_actions` row with status='received' immediately
2. If insert fails (constraint violation), re-query and return duplicate
3. Update `planner_tasks` row
4. If update fails, log row exists with status='received' (safe to retry)
5. Update log row: set status='applied', set result={...}, set applied_at
6. If log update fails, log shows 'received' (retry is safe)

**Code Pattern**:
```javascript
// 1. Insert log with status='received' first
const insertLogResult = await supabase
  .from('paper_device_actions')
  .insert({ ..., status: 'received' });

if (insertLogResult.error?.code === '23505') {
  // Duplicate log entry, return prior result
  const prior = await supabase.from('paper_device_actions')
    .select('*')
    .eq(..., client_action_id);
  duplicates.push(...prior);
  continue;
}

// 2. Update task
const updateTaskResult = await supabase
  .from('planner_tasks')
  .update({ data: { completed: true } });

if (updateTaskResult.error) {
  // Task update failed, log entry shows 'received', safe to retry
  failed.push(...);
  continue;
}

// 3. Mark log as applied
await supabase
  .from('paper_device_actions')
  .update({ status: 'applied', result: {...}, applied_at: now })
  .eq('id', logId);
```

**Testing After Fix**:
- Simulate network failure scenarios
- Verify retry doesn't double-complete task
- Verify log entries capture all outcomes

---

## Merge Recommendation

### ⚠️ **DO NOT MERGE PR-3B YET**

**Reason**: Write ordering violates idempotency contract.

**Approval Path**:
1. Fix applyActions() to use log-first pattern
2. Re-run checks: npm run check, npm run build
3. Document updated write flow in code
4. Resubmit for hard gate review
5. If approved, test with real DB (after safety review)
6. Then merge

**If Fix Is Blocked**:
- Option 1: Use Supabase transaction (if available in client)
- Option 2: Implement transaction-like behavior with status columns
- Option 3: Accept "best effort" approach with clear documentation of race conditions

**Do Not Proceed**:
- ❌ Do not enable PAPER_ACTIONS_WRITE_ENABLED in production
- ❌ Do not apply migration without write ordering fix
- ❌ Do not start PR-3C until this is resolved

---

## Next Steps

1. **Fix the code** (applyActions in paperService.mjs):
   - Implement log-first pattern
   - Insert with status='received'
   - Update task
   - Transition to status='applied'

2. **Update tests**:
   - Test duplicate retry (network failure scenario)
   - Test partial failures (log vs task mutation)

3. **Re-run hard gate**:
   - Resubmit PR-3B with code fixes
   - Verify write ordering is safe
   - Then approve for merge

4. **Only after fix approved**:
   - Apply migration to Supabase
   - Test with real DB
   - Enable PAPER_ACTIONS_WRITE_ENABLED in production when ready

---

## Fix Applied: Log-First Resumable State Machine

See: `docs/PRO_MOVE_PR3B_FIX_GATE.md` for complete fix documentation.

**Fixed in PR-3B**:
- ✅ Log-first pattern: Insert paper_device_actions BEFORE task update
- ✅ Received state recovery: Resume in-flight actions on retry
- ✅ Status routing: Handle all log states (applied, conflict, rejected, failed, received)
- ✅ Idempotency: Guaranteed by UNIQUE constraint + proper state machine

**Write Order After Fix**:
```
STEP 1: Insert log with status='received' ← Log entry now exists as safety record
STEP 2: Update task completed=true         ← Task mutation with log as audit trail
STEP 3: Transition log to status='applied' ← Mark action as complete
```

**Retry-Safe**: Network failure at any step leaves consistent state for recovery.

---

## Sign-Off

**Code Review**: ✅ Issue FIXED
**Security**: ✅ Pass (no service role leak)
**Safety**: ✅ Default dry-run active
**Idempotency**: ✅ FIXED (log-first pattern, retry-safe)
**Device**: ✅ Unmodified

**Verdict**: **APPROVE PR-3B FOR MERGE** (after fix validation)
