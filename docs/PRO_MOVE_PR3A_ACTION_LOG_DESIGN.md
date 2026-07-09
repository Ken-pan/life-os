# PR-3A: Paper Device Action Log & Idempotency Design

**Status**: Design phase (no implementation yet)
**Scope**: Offline-first action queue architecture, idempotency guarantees, conflict detection
**Target PR**: PR-3A (design document only)
**Next PR**: PR-3B (implementation with real writes)

---

## 1. Problem Statement

### Current State
- reMarkable Paper Pro Move will run offline 95% of the time.
- Device cannot guarantee network connectivity.
- User actions (complete task, snooze, move to tomorrow) are queued locally and sent in batches when online.
- Current `/api/paper/actions` is **dry-run only**; no mutations occur.

### The Challenge
1. **Duplicate Submissions**: Device may retry a batch if it suspects failure (network timeout, no response).
2. **Partial Failures**: Some actions in a batch succeed; others fail. Device must know which to retry.
3. **Race Conditions**: Task state may change between device submitting and server processing (user edited on another device).
4. **Offline Mutations**: Device may apply the same action locally multiple times, then send it once online.
5. **Stale Data**: Device may send actions based on stale task versions (device-side cache out of sync with server).

### Example Failure Scenarios
- **Network timeout**: Device sends `{batch-1, [action-complete-task-xyz]}`, connection drops, device retries. Server must not complete the task twice.
- **Concurrent edit**: User completes task on mobile while device has queued a snooze. Server receives snooze first; device's snooze should fail gracefully (conflict), not corrupt task.
- **Duplicate submission**: Device sends `{batch-1, [action-1]}`, waits 10s for response, sends again. Server receives the same batch ID and action ID twice; second must be recognized as duplicate.
- **Partial batch success**: Batch has 3 actions; actions 1 and 2 succeed, action 3 fails (target task deleted). Device must know which to retry.

---

## 2. Why Idempotency Is Required

**Definition**: An operation is idempotent if applying it multiple times produces the same result as applying it once.

### For PlannerOS + Pro Move:
- Device may retry actions indefinitely (no awareness of success/failure).
- Server must absorb duplicate submissions without side effects.
- Action log must track **intent** and **result** separately.
- **Same action ID + same device = same outcome**, even if submitted 10 times.

### Safety Guarantees Needed:
1. **No duplicate tasks created**: `task.create` with same `clientActionId` must return the same task, not create a new one.
2. **No duplicate completions**: `task.complete` on an already-completed task must be treated as a success, not an error.
3. **No inconsistent state**: If task is in conflict (e.g., deleted by another user), action must be rejected and device notified.
4. **Version awareness**: Server must detect when device is working with stale data and provide conflict info.

---

## 3. Offline Queue Model

### Device-Side (reMarkable Paper Pro Move)

```
┌─────────────────────────────────────────┐
│ Local Offline Action Queue              │
├─────────────────────────────────────────┤
│ User performs action (e.g., complete)   │
│ → Action added to queue with clientId   │
│ → Applied to local UI immediately       │
│ → Queued for sync                       │
├─────────────────────────────────────────┤
│ Device detects network                  │
│ → Batches pending actions               │
│ → Sends POST /api/paper/actions         │
│ → Waits for response                    │
├─────────────────────────────────────────┤
│ Server responds:                        │
│ - applied: [successful action IDs]      │
│ - conflicts: [conflict action details]  │
│ - rejected: [failed action details]     │
├─────────────────────────────────────────┤
│ Device processes response:              │
│ - Removes applied actions from queue    │
│ - Updates local state for conflicts     │
│ - Retries rejected actions or backoff   │
└─────────────────────────────────────────┘
```

### Server-Side (PlannerOS)

```
POST /api/paper/actions
│
├─ Verify bearer token & device ID
│
├─ For each action in batch:
│  ├─ Check idempotency: clientActionId exists?
│  │  ├─ YES: return prior result (applied / duplicate)
│  │  └─ NO: proceed to validation
│  │
│  ├─ Validate action (check target task exists, permissions, etc.)
│  │  ├─ ERROR: mark rejected
│  │  └─ OK: proceed to conflict detection
│  │
│  ├─ Detect conflicts (version check, concurrent edits, etc.)
│  │  ├─ CONFLICT: record conflict, do NOT apply
│  │  └─ OK: proceed to application
│  │
│  └─ Apply action (insert log entry, mutate task)
│     ├─ Success: record result
│     └─ Failure: record error
│
└─ Return batch response with applied/conflicts/rejected summary
```

---

## 4. Action Lifecycle

```
┌──────────┐
│ received │  Action entry logged in paper_device_actions
└────┬─────┘
     │
     ├─→ [Idempotency Check]
     │   ├─ clientActionId found?
     │   ├─ YES: → Status changes to "duplicate", return prior result
     │   └─ NO: proceed
     │
     ├─→ [Validation]
     │   ├─ Action schema valid?
     │   ├─ Task exists & user has access?
     │   ├─ NO: → Status "rejected", record error, STOP
     │   └─ YES: proceed
     │
     ├─→ [Conflict Detection]
     │   ├─ Task already deleted?
     │   ├─ Task already completed (for idempotent actions)?
     │   ├─ baseVersion < current task.updatedAt (for version-aware actions)?
     │   ├─ CONFLICT: → Status "conflict", record conflict details, STOP
     │   └─ OK: proceed
     │
     └─→ [Application]
         ├─ Create mutation in dependent table(s)
         ├─ Update task row
         ├─ Update paper_device_actions row
         ├─ SUCCESS: → Status "applied", record result
         └─ FAILURE: → Status "failed", record error
```

### Status Meanings

| Status | Meaning | Retry? | Notes |
|--------|---------|--------|-------|
| `received` | Logged but not yet processed | No (intermediate) | Will transition to another state during batch processing |
| `applied` | Successfully applied to PlannerOS | No | Action complete, device can discard from queue |
| `duplicate` | Same clientActionId already applied | No | Return prior result; device can discard |
| `conflict` | Task state conflicts with action intent | Yes (optional) | Device should notify user and optionally retry after sync |
| `rejected` | Validation failed (task missing, permission denied, bad schema) | No | Device should discard or notify user |
| `failed` | Application failed (DB constraint violation, race condition) | Yes (with backoff) | Transient error; device can retry |

---

## 5. Duplicate Submissions & Action Log Semantics

### Important: "Duplicate" is an API Response Category, Not a DB Status

**Persisted Database Statuses** (5 states):
```
- received       (intermediate, before processing)
- applied        (terminal, successfully mutated PlannerOS)
- conflict       (terminal, state conflict detected)
- rejected       (terminal, validation failed)
- failed         (transient, may be retried)
```

**API Response Categories** (5 categories, what device receives):
```
- applied        (actions successfully applied)
- duplicates     (actions already processed, prior result returned)
- conflicts      (actions with state conflicts)
- rejected       (actions that failed validation)
- failed         (actions with transient errors)
```

### Duplicate Handling

**What is a duplicate?**
- Same `(user_id, device_id, client_action_id)` submitted more than once.
- Device retried a batch because of network timeout or suspected failure.

**Duplicate Behavior**:
- When a duplicate is detected, **do NOT insert a new row**.
- Do NOT mutate the original row from `applied`/`conflict`/`rejected` into `duplicate`.
- Simply return the prior result in the API response under `duplicates[]` array.
- The original row retains its original status.

**Uniqueness Constraint** (prevents duplicate rows at DB level):
```sql
UNIQUE (user_id, device_id, client_action_id)
-- Attempt to INSERT with same key → DB constraint violation
-- Application layer catches exception → Returns duplicate response
```

**Example Timeline**:
```
First submission: {batch-1, [action-1, action-2]}
  → INSERT row action-1 with status='applied'
  → INSERT row action-2 with status='applied'
  → Response: applied=[action-1, action-2]

Retry (network timeout): {batch-1, [action-1, action-2]}
  → Query (user_id, device_id, action-1) → Found, status='applied'
  → Do NOT INSERT (constraint would reject anyway)
  → Return prior result in duplicates[]
  → Query (user_id, device_id, action-2) → Found, status='applied'
  → Return prior result in duplicates[]
  → Response: duplicates=[action-1, action-2]
```

---

## 6. Conflict Model

### Conflict Detection Strategy

For each action, the server runs **before applying**:

#### A. Idempotent Completion (Same Action ID)
```
IF clientActionId exists in paper_device_actions
  IF prior status = 'applied'
    RETURN prior result (no re-execution)
  IF prior status = 'duplicate'
    RETURN prior result
  IF prior status = 'conflict'
    RETURN prior conflict details
```

#### B. Task State Validation
```
SWITCH action.type:
  CASE 'task.complete':
    IF task.completed = true
      IF same device sent this action before
        → APPLIED (idempotent success)
      ELSE
        → CONFLICT ('already_completed', user_info, device_info)
    ELSE
      → OK, proceed to apply

  CASE 'task.moveTomorrow':
    IF task.dueDate = tomorrow
      → CONFLICT ('already_tomorrow', device_info)
    ELSE
      → OK, proceed to apply

  CASE 'task.snooze':
    IF task.snoozedUntil >= target_snooze_time
      → CONFLICT ('already_snoozed', device_info)
    ELSE
      → OK, proceed to apply

  CASE 'task.create':
    IF clientActionId exists and status = 'applied'
      → DUPLICATE (return created task ID)
    ELSE
      → OK, proceed to apply
```

#### C. Version-Based Conflict (Stale Device Data)
```
IF action.baseVersion provided:
  IF action.baseVersion < task.updatedAt:
    IF action.type = 'task.complete' AND task.completed = true
      → APPLIED (idempotent)
    ELSE IF action.type = 'task.complete' AND task.completed = false
      → CONFLICT ('stale_version', device_version, server_version, task_state)
    ELSE
      → CONFLICT ('stale_version', ...)
```

#### D. Permission Checks
```
IF action.type != 'task.create':
  IF task.user_id != claiming_user_id
    → REJECTED ('permission_denied')
  IF task.deleted_at IS NOT NULL
    → CONFLICT ('task_deleted', user_who_deleted, when)
ELSE
  IF task.user_id != claiming_user_id
    → REJECTED ('permission_denied')
```

### Conflict Response (Device-Facing)

When a conflict is detected, the response includes:

```json
{
  "clientActionId": "action-1",
  "type": "task.complete",
  "status": "conflict",
  "reason": "already_completed",
  "details": {
    "task_id": "task-xyz",
    "current_state": {
      "completed": true,
      "completed_at": "2026-07-09T10:15:00Z",
      "completed_by_device": "mobile-app"
    },
    "device_version": 1720562400000,
    "server_version": 1720562401000,
    "user_info": "completed via mobile app 2 minutes ago"
  }
}
```

Device uses this to:
- Sync its local state to server state
- Notify user of the conflict
- Decide whether to retry or accept server state

---

## 7. Proposed Database Tables

### Table: `paper_device_actions`

**Purpose**: Audit log and idempotency ledger for device-initiated actions.

**Columns**:

| Column | Type | Nullable | Unique | Default | Notes |
|--------|------|----------|--------|---------|-------|
| `id` | `uuid` | NO | YES (PK) | `gen_random_uuid()` | Action entry ID (server-generated) |
| `user_id` | `uuid` | NO | Part of composite | | Owner of the action |
| `device_id` | `text` | NO | Part of composite | | Claiming device (e.g., "imx93-chiappa") |
| `client_batch_id` | `text` | NO | Part of composite | | Batch ID from device |
| `client_action_id` | `text` | NO | Part of composite | | Action ID from device (MUST be unique within device+user) |
| `action_type` | `text` | NO | | | One of: task.complete, task.moveTomorrow, task.snooze, task.create |
| `target_task_id` | `text` | YES | | NULL | Task being mutated (NULL for task.create) |
| `payload` | `jsonb` | NO | | `'{}'::jsonb` | Full action payload (for audit & replay) |
| `base_version` | `bigint` | YES | | NULL | Device's task.updatedAt when action was queued (for conflict detection) |
| `status` | `text` | NO | | `'received'` | One of: received, applied, duplicate, conflict, rejected, failed |
| `result` | `jsonb` | YES | | NULL | Outcome of action (created task ID, etc.) |
| `conflict` | `jsonb` | YES | | NULL | Conflict details (reason, current state, etc.) |
| `created_at` | `timestamptz` | NO | | `now()` | Server timestamp of receipt |
| `applied_at` | `timestamptz` | YES | | NULL | Timestamp when action was applied (or NULL if not applied) |

**Uniqueness Constraints**:

```sql
-- Primary uniqueness: (user_id, device_id, client_action_id)
-- Ensures same device cannot send same action ID twice
UNIQUE (user_id, device_id, client_action_id)

-- Secondary indexing for batch lookups
INDEX (user_id, device_id, client_batch_id, created_at DESC)

-- For conflict detection (find prior results by client ID)
INDEX (user_id, client_action_id, status)
```

**Rationale**:
- `(user_id, device_id, client_action_id)` is the idempotency key: if this combination is seen twice, return the prior result.
- `base_version` allows device to indicate what task version it was working from; helps detect stale data.
- `status` transitions: received → (applied | duplicate | conflict | rejected | failed)
- `result` and `conflict` are both JSONB to flexibly store different outcome shapes.

---

### Table: `paper_device_conflict_journal` (Optional Future)

**Purpose**: Track conflicts for user notification and analytics.

**Note**: Not required for PR-3A/3B MVP, but useful for device sync UI.

```
id uuid PK
user_id uuid NOT NULL
action_id uuid NOT NULL (FK → paper_device_actions.id)
conflict_type text NOT NULL
current_task_state jsonb NOT NULL
device_state jsonb NOT NULL
resolved_at timestamptz nullable
created_at timestamptz NOT NULL DEFAULT now()
```

---

## 8. Proposed API Changes

### Current (PR-2, Dry-Run)
```
POST /api/paper/actions
Authorization: Bearer <device-token>

{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1",
  "actions": [
    {
      "clientActionId": "action-1",
      "type": "task.complete",
      "taskId": "uuid-xyz"
    }
  ]
}

Response (DRY-RUN):
{
  "batchStatus": "dry_run",
  "dryRun": true,
  "applied": ["action-1"],
  "conflicts": [],
  "proposedMutations": [...]
}
```

### Proposed (PR-3B, Real Writes)

**Request** (same shape, added optional field):
```json
{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1",
  "actions": [
    {
      "clientActionId": "action-1",
      "type": "task.complete",
      "taskId": "uuid-xyz",
      "baseVersion": 1720562400000  ← Optional: task.updatedAt from device cache
    },
    {
      "clientActionId": "action-2",
      "type": "task.create",
      "payload": {
        "title": "Quick add from Paper",
        "priority": "P2"
      }
    }
  ]
}
```

**Response** (changed from dry-run to real):
```json
{
  "batchStatus": "applied",        ← applied | partially_applied | conflict | rejected
  "dryRun": false,                 ← No longer dry-run
  "applied": [                     ← Actions that succeeded
    {
      "clientActionId": "action-1",
      "status": "applied",
      "taskId": "uuid-xyz"
    }
  ],
  "duplicates": [                  ← Actions already processed
    {
      "clientActionId": "action-2",
      "status": "duplicate",
      "priorResult": { "taskId": "uuid-abc" }
    }
  ],
  "conflicts": [                   ← Actions with state conflicts
    {
      "clientActionId": "action-3",
      "status": "conflict",
      "reason": "task_deleted",
      "details": { ... }
    }
  ],
  "rejected": [                    ← Actions that failed validation
    {
      "clientActionId": "action-4",
      "status": "rejected",
      "reason": "invalid_schema",
      "message": "..."
    }
  ],
  "newCursor": "1720562401000"    ← Updated sync cursor for delta queries
}
```

**Status Codes**:
- `200 OK`: All processed (may include conflicts/duplicates).
- `400 Bad Request`: Invalid batch schema.
- `401 Unauthorized`: Invalid or missing token.
- `500 Internal Server Error`: Server-side processing failure.

---

## 9. Migration Plan

### PR-3A (This PR)
- ✅ Design doc (this file)
- ✅ Migration SQL (unapplied, in docs)
- ✅ API contract update
- ❌ No database changes
- ❌ No Supabase migration applied

### PR-3B (Next PR)
- Create Supabase migration file (e.g., `supabase/migrations/20260710_add_paper_device_actions.sql`)
- Apply migration to Supabase
- Implement real `/api/paper/actions` handler
- Update `paperService.mjs` to handle writes
- Deploy Netlify functions
- Integration test with local Supabase

### PR-3C+ (Future)
- Device app integration
- Offline queue implementation on device
- Real network testing
- Rollback procedures

---

## 10. Rollback Plan

### If PR-3B Discovers Issues

**Scenario 1: Duplicate detection fails**
- Restore prior Netlify function
- Query `paper_device_actions` for duplicates
- Manual deduplication if needed
- Redeploy with fix

**Scenario 2: Conflict detection misses race condition**
- Restore prior function
- Review logs (paper_device_actions log)
- Update conflict detection rules
- Redeploy

**Scenario 3: Table structure wrong**
- Drop `paper_device_actions` table (data already in old format)
- Adjust schema
- Reapply migration
- Redeploy

**Scenario 4: Device sends malformed batches**
- Reject at validation layer (400 Bad Request)
- Device resets and retries
- No data corruption

**Never Required To Do**:
- Restore PlannerOS tasks (action log is append-only)
- Restore task history (original task rows unchanged)
- Device factory reset (action log on server is source of truth)

---

## 11. Service Role & RLS Security Model

### Key Security Principles

**SUPABASE_SERVICE_ROLE_KEY is SERVER-SIDE ONLY**:
- Netlify Functions run server-side with access to `SUPABASE_SERVICE_ROLE_KEY` (secret environment variable).
- Service role has full bypass of Row-Level Security (RLS) policies.
- Service role **NEVER** exposed to browser/client bundle.
- Service role **NEVER** logged or transmitted to device.

**Device Authentication Flow**:
```
1. Device generates PAPER_DEVICE_TOKEN (shared out-of-band, stored in Netlify env)
2. Device sends request: POST /api/paper/actions with "Authorization: Bearer <PAPER_DEVICE_TOKEN>"
3. Netlify Function receives request:
   - Verifies Bearer token matches PAPER_DEVICE_TOKEN
   - Verifies token claims user_id and device_id
4. Netlify Function uses SUPABASE_SERVICE_ROLE_KEY to mutate paper_device_actions table
5. Netlify Function queries planner_tasks with service role (bypasses RLS)
6. Response returned to device (never grants credentials)
```

**RLS Configuration for paper_device_actions**:
```sql
-- Browser can only read their own actions (via user_id)
CREATE POLICY "users_read_own_actions" ON paper_device_actions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Server (Netlify with service role) can insert/update (bypasses RLS)
-- RLS enforcement: Netlify function validates token before insert
```

**Why RLS Does NOT Protect Server Writes**:
- Server uses `SUPABASE_SERVICE_ROLE_KEY` which has `bypass_rls=true`.
- RLS is a browser-side protection: device sends token, Netlify validates token before query.
- Application layer (Netlify function) is the enforcer, not RLS.
- RLS row policies protect browser clients, not server operations.

### Security Checklist for PR-3B

- [ ] **SUPABASE_SERVICE_ROLE_KEY**: Verify it's in Netlify env variables, never in code.
- [ ] **PAPER_DEVICE_TOKEN**: Verify it's in Netlify env, used only for device Bearer validation.
- [ ] **No token in docs**: Scan `docs/` for any real tokens or keys (use sanitized examples only).
- [ ] **No browser exposure**: Confirm service role key is NOT in PUBLIC_* env vars.
- [ ] **Device token rotation**: If real token was ever used in local dev, rotate it in Netlify.
- [ ] **Audit logging**: Confirm all mutations are logged in `paper_device_actions` for compliance.

### Token Leak Prevention for PR-3B

If any of these are discovered BEFORE merging PR-3B:
- Real `SUPABASE_SERVICE_ROLE_KEY` in git history → Regenerate at Supabase, re-deploy
- Real `PAPER_DEVICE_TOKEN` in docs/code → Rotate token, re-deploy
- Real device UUID in committed docs → Remove, keep examples only
- Service role key in browser bundle → Fix build, re-deploy

**Never use**: Local `.env` with real values in git. Always use `.env.local` (gitignored).

---

## 12. PR-3B Implementation Plan

### Important: task.complete ONLY in PR-3B

**PR-3B Scope**: Implement real write functionality for **`task.complete` action type only**.

**Defer to PR-3C/3D**:
- `task.moveTomorrow` → PR-3C (after task dueDate field confirmed in schema)
- `task.snooze` → PR-3C (after snoozed_until field exists and tested)
- `task.create` → PR-3D (after duplicate-create behavior and fields are fully tested)

**Why Defer**:
1. Reduce PR-3B scope to single action type for faster review and testing
2. Task fields (snoozed_until, dueDate semantics) need validation
3. Quick-add (task.create) needs separate duplicate test harness
4. Incremental rollout reduces risk of database mutations

### PR-3B Implementation Checklist

1. Apply migration to Supabase (create `paper_device_actions` table)
2. Update `paperService.mjs`:
   - Implement `applyActions()` function (handles task.complete only)
   - Idempotency check: query prior `clientActionId`
   - Conflict detection: task existence, completion state, baseVersion
   - Action application: update task.completed=true, insert log entry
   - Return categorized response (applied, duplicates, conflicts, rejected)
3. Update `paper-actions.mjs` Netlify function:
   - Call `applyActions()` instead of `dryRunActions()`
   - Set `dryRun: false` in response
4. Integration tests (task.complete only):
   - Duplicate submission returns prior result
   - Already-completed task treated as idempotent success
   - Deleted task returns conflict
   - Stale baseVersion detected and reported
   - Partial batch (mixed outcomes) handled correctly
5. Security validation (see Section 11):
   - Service role not exposed to browser
   - Device token validated on every request
   - No secrets in committed code
6. Local testing:
   - Curl tests with real Netlify dev server
   - Mock device retry scenarios
   - Verify idempotency and conflict detection

### This PR (PR-3A) Does NOT:
- ❌ Create the `paper_device_actions` table in Supabase
- ❌ Apply any database migrations
- ❌ Implement real write logic in `/api/paper/actions`
- ❌ Change `/api/paper/actions` from dry-run to real
- ❌ Add offline queue logic to reMarkable device
- ❌ Modify xochitl or device OS
- ❌ Deploy a Qt app to the device
- ❌ Enable Wi-Fi SSH or device network changes
- ❌ Change `/` or `/etc` on device
- ❌ Create systemd services
- ❌ Implement conflict resolution UI on device
- ❌ Add device sync notifications
- ❌ Handle long-running actions (e.g., background job queues)

### PR-3B Will Do (But Not This PR):
- ✅ Apply migration
- ✅ Implement real writes
- ✅ Change `/api/paper/actions` from dry-run to real
- ✅ Integration testing

### Future PRs:
- ✅ Device app implementation
- ✅ Offline queue on device
- ✅ Sync UI
- ✅ Conflict resolution workflow

---

## 13. Appendix: Migration SQL (Unapplied)

**File**: `supabase/migrations/20260710_add_paper_device_actions.sql` (NOT applied in this PR)

```sql
-- ============================================================================
-- PR-3B Migration: Add paper_device_actions table for idempotency tracking
-- ============================================================================
-- This migration is DESIGNED in PR-3A but NOT APPLIED.
-- Apply in PR-3B when ready to implement real writes.
-- ============================================================================

-- Create paper_device_actions table
CREATE TABLE IF NOT EXISTS paper_device_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  client_batch_id TEXT NOT NULL,
  client_action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_task_id TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_version BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  result JSONB NULL,
  conflict JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ NULL,

  -- Idempotency constraint: same device + user + action ID = one outcome
  UNIQUE (user_id, device_id, client_action_id)
);

-- Index for fast idempotency lookups
CREATE INDEX paper_device_actions_idempotency_idx
  ON paper_device_actions(user_id, client_action_id, status);

-- Index for batch lookups and audit trails
CREATE INDEX paper_device_actions_batch_idx
  ON paper_device_actions(user_id, device_id, client_batch_id, created_at DESC);

-- Index for time-based queries (e.g., last 24 hours)
CREATE INDEX paper_device_actions_timeline_idx
  ON paper_device_actions(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE paper_device_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own actions
CREATE POLICY paper_device_actions_user_read ON paper_device_actions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: System (Netlify functions with service role) can insert/update
-- Note: This assumes Netlify functions use SUPABASE_SERVICE_ROLE_KEY
-- Policy enforcement depends on application layer (Netlify function) validating device token
```

**Status**: Design only, SQL documented for reference. **Do NOT apply in this PR.**

---

## Validation Checklist (PR-3A)

Design Phase (All Completed):
- [x] Design document created (this file)
- [x] API contract updated with idempotency section
- [x] Duplicate semantics clarified (DB status vs API response category)
- [x] Service role & RLS security model documented
- [x] Migration SQL documented (unapplied)
- [x] Action statuses defined (5 DB statuses, 5 API response categories)
- [x] Action types defined (MVP: 4 types, only task.complete for PR-3B)
- [x] Conflict model documented
- [x] Response shape defined
- [x] Duplicate handling documented

Verification (All Confirmed):
- [x] `/api/paper/actions` remains dry-run only ✅
- [x] No database changes made ✅
- [x] No device modifications ✅
- [x] `npm run check` passes ✅
- [x] `npm run build:planner` passes ✅
- [x] No migrations applied ✅

---

## Sign-Off

**Design Phase**: PR-3A (This Document)
**Implementation Phase**: PR-3B (Real Writes + Migration)
**Status**: Ready for PR-3B implementation planning
**Next Step**: Code review of design, then proceed to PR-3B
