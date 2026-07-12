# PaperOS Device API Contract

This document is the canonical communication contract between the PaperOS device client and the Planner provider backend. Product status belongs in [`../roadmap/apps/paperos.md`](../roadmap/apps/paperos.md); validation evidence belongs in [`../qa/paperos/`](../qa/paperos/README.md).

## Design Decisions

### Idempotency & Action Log (PR-3A Design)
- All mutation requests are submitted via batches to `/api/paper/actions`.
- `clientBatchId` (at the batch level) and `clientActionId` (at the action level) are **required**.
- The server maintains a `paper_device_actions` log table (designed in PR-3A, implemented in PR-3B).
- Every action is logged with a unique key: `(user_id, device_id, client_action_id)`.
- If an action is resubmitted (same client_action_id), the server returns the prior result without re-executing.
- Device may retry batches indefinitely; server absorbs duplicates safely.

**Idempotency Guarantees**:
1. **Same action ID = same outcome**: If device submits `{batch-1, action-1}` twice, the second submission returns the prior result without side effects.
2. **No duplicate tasks created**: `task.create` with the same `clientActionId` returns the original task ID, not a new task.
3. **No double-completion**: `task.complete` on an already-completed task is treated as success, not an error.
4. **Conflict safety**: If task state changed concurrently (e.g., task was deleted or edited elsewhere), server returns a conflict instead of silently failing or corrupting.

### Action Statuses
Each action in the server log transitions through states:
- **received**: Logged but not yet processed
- **applied**: Successfully applied to PlannerOS
- **duplicate**: Same `clientActionId` already applied; prior result returned
- **conflict**: Task state conflicts with action intent (e.g., task already completed, task deleted, stale data)
- **rejected**: Validation failed (task missing, permission denied, bad schema)
- **failed**: Application failed due to transient error

### Delta Sync Strategy
- **Mock Phase** (PR-1): Returns a hardcoded list of upserted/deleted entities.
- **MVP Real Phase** (PR-2): Emulates delta changes by querying all tasks for the user and filtering for those where `updatedAt > cursor`.
- **Future Phase** (PR-3B+): Leverages `paper_device_actions` log for audit trails and conflict resolution UI.

---

## 1. GET /api/paper/today
Returns the current active agenda, schedule blocks, focus session, tasks, and system state for today.

### Request Headers
```http
Authorization: Bearer <device_token>
```

### Response Shape (JSON)
```json
{
  "serverTime": "2026-07-09T13:01:08-07:00",
  "cursor": "1720562468000",
  "user": {
    "id": "user-uuid-1234",
    "name": "Ken Pan",
    "locale": "zh-CN",
    "timezone": "America/Los_Angeles"
  },
  "today": {
    "date": "2026-07-09",
    "currentFocus": {
      "id": "task-uuid-focus",
      "title": "Build Pro Move Integration",
      "notes": "Work on the Phase 0 audit and mock server endpoints",
      "priority": "P0"
    },
    "scheduleBlocks": [
      {
        "id": "task-uuid-block-1",
        "title": "Standup & Sync",
        "start": "09:00",
        "durationMinutes": 30,
        "completed": true
      },
      {
        "id": "task-uuid-focus",
        "title": "Build Pro Move Integration",
        "start": "10:00",
        "durationMinutes": 120,
        "completed": false
      }
    ]
  },
  "tasks": [
    {
      "id": "task-uuid-normal-1",
      "title": "Verify build and typecheck",
      "notes": "Run check:lifeos-boundaries and local build commands",
      "priority": "P1",
      "dueDate": "2026-07-09",
      "completed": false,
      "updatedAt": 1720562400000
    }
  ],
  "inbox": {
    "count": 3
  },
  "devicePolicy": {
    "activePollSeconds": 300,
    "idlePollSeconds": 900,
    "heartbeatSeconds": 900
  }
}
```

---

## 2. POST /api/paper/actions
Submits a batched list of local actions performed on the paper device. The server processes actions in order and guarantees idempotency.

### Request Headers
```http
Authorization: Bearer <device_token>
Content-Type: application/json
```

### Request Shape (JSON)
```json
{
  "deviceId": "planneros-paper-local-dev",
  "clientBatchId": "batch-1720562470000",
  "baseCursor": "1720562468000",
  "actions": [
    {
      "clientActionId": "action-uuid-1",
      "type": "task.complete",
      "taskId": "task-uuid-focus",
      "baseVersion": 1720562400000
    },
    {
      "clientActionId": "action-uuid-2",
      "type": "task.snooze",
      "taskId": "task-uuid-normal-1",
      "snoozeDays": 1,
      "baseVersion": 1720562400000
    },
    {
      "clientActionId": "action-uuid-3",
      "type": "task.moveTomorrow",
      "taskId": "task-uuid-normal-1",
      "baseVersion": 1720562400000
    },
    {
      "clientActionId": "action-uuid-4",
      "type": "task.create",
      "title": "Quick Task from Device",
      "priority": "P2",
      "scheduledDate": "2026-07-09",
      "baseVersion": 0
    }
  ]
}
```

### Response Shape (Current: PR-2 Dry-Run)
*Currently (PR-2), `/api/paper/actions` is dry-run only (`dryRun: true`). Real writes come in PR-3B.*

```json
{
  "batchStatus": "dry_run",
  "dryRun": true,
  "applied": ["action-uuid-1", "action-uuid-2"],
  "conflicts": [],
  "proposedMutations": [
    {
      "clientActionId": "action-uuid-1",
      "type": "task.complete",
      "taskId": "task-uuid-focus",
      "proposedChange": { "completed": true }
    }
  ],
  "newCursor": "1720562490000"
}
```

### Response Shape (Proposed: PR-3B Real Writes)
*The following response shape is designed for PR-3B when real writes are enabled.*

```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [
    {
      "clientActionId": "action-uuid-1",
      "status": "applied",
      "taskId": "task-uuid-focus"
    },
    {
      "clientActionId": "action-uuid-2",
      "status": "applied",
      "taskId": "task-uuid-normal-1"
    }
  ],
  "duplicates": [
    {
      "clientActionId": "action-uuid-3",
      "status": "duplicate",
      "priorResult": {
        "taskId": "task-uuid-xyz",
        "appliedAt": "2026-07-09T10:15:00Z"
      }
    }
  ],
  "conflicts": [
    {
      "clientActionId": "action-uuid-4",
      "status": "conflict",
      "reason": "already_completed",
      "details": {
        "taskId": "task-uuid-abc",
        "currentState": {
          "completed": true,
          "completedAt": "2026-07-09T10:10:00Z",
          "completedByDevice": "mobile-app"
        },
        "deviceVersion": 1720562400000,
        "serverVersion": 1720562401000,
        "userInfo": "Completed via mobile app 5 minutes ago"
      }
    }
  ],
  "rejected": [
    {
      "clientActionId": "action-uuid-5",
      "status": "rejected",
      "reason": "task_not_found",
      "message": "Target task was not found or has been deleted"
    }
  ],
  "newCursor": "1720562490000"
}
```

**Possible `batchStatus` values**:
- `applied`: All actions processed successfully (no conflicts/rejections).
- `partially_applied`: Some actions applied; others have conflicts/rejections.
- `conflict`: One or more actions encountered conflicts.
- `rejected`: All actions were rejected or failed.

---

## 3. GET /api/paper/delta
Fetches tasks and list changes that occurred since a given cursor. Used by the device client to update local cache efficiently without fetching full state.

### Request Parameters
`?cursor=1720562468000`

### Response Shape (JSON)
```json
{
  "cursor": "1720562490000",
  "hasMore": false,
  "changes": {
    "upserted": [
      {
        "id": "task-uuid-new-1",
        "title": "Quick Task from Device",
        "priority": "P2",
        "scheduledDate": "2026-07-09",
        "completed": false,
        "updatedAt": 1720562490000
      }
    ],
    "deleted": [
      "task-uuid-deleted-1"
    ]
  }
}
```

---

## 4. POST /api/paper/heartbeat
Records physical device status metrics (telemetry).

### Request Headers
```http
Authorization: Bearer <device_token>
Content-Type: application/json
```

### Request Shape (JSON)
```json
{
  "battery": 87,
  "onlineState": "wifi",
  "queueDepth": 0,
  "appVersion": "1.0.0",
  "osVersion": "5.7.126 (scarthgap)"
}
```

### Response Shape (JSON)
```json
{
  "status": "ok",
  "serverTime": "2026-07-09T13:01:08-07:00"
}
```

---

## 5. Examples: Idempotency & Conflict Handling

### Example 1: Duplicate Submission (Network Retry)

**Scenario**: Device sends a batch, connection drops, device retries the same batch.

**First Submission**:
```
POST /api/paper/actions
{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1720562470000",
  "actions": [
    {
      "clientActionId": "action-complete-task-xyz",
      "type": "task.complete",
      "taskId": "task-xyz"
    }
  ]
}
```

**Server processes**: Queries `paper_device_actions` table, does not find `(user_id, device_id, "action-complete-task-xyz")`. Creates entry with status `applied`. Updates task. Returns:

```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [
    {
      "clientActionId": "action-complete-task-xyz",
      "status": "applied",
      "taskId": "task-xyz"
    }
  ],
  "duplicates": [],
  "conflicts": [],
  "rejected": [],
  "newCursor": "1720562490000"
}
```

**Second Submission (Identical Batch)**: Device retries.

```
POST /api/paper/actions
{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1720562470000",
  "actions": [
    {
      "clientActionId": "action-complete-task-xyz",
      "type": "task.complete",
      "taskId": "task-xyz"
    }
  ]
}
```

**Server processes**: Queries `paper_device_actions` table, finds `(user_id, device_id, "action-complete-task-xyz")` with status `applied`. Returns prior result **without re-executing**:

```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [],
  "duplicates": [
    {
      "clientActionId": "action-complete-task-xyz",
      "status": "duplicate",
      "priorResult": {
        "taskId": "task-xyz",
        "appliedAt": "2026-07-09T10:15:00Z"
      }
    }
  ],
  "conflicts": [],
  "rejected": [],
  "newCursor": "1720562490000"
}
```

**Key Point**: Task is NOT completed twice. Device recognizes the duplicate from the `status: "duplicate"` response and can safely discard the action from its local queue.

---

### Example 2: Conflict Detection (Concurrent Edit)

**Scenario**: User completes a task on mobile. Simultaneously, device has queued a snooze action and sends it.

**Initial State**:
- Task `task-abc`: `completed: false`, `updatedAt: 1720562400000`
- Device's cache: Same state
- Mobile client: Same state

**Timeline**:
1. Mobile client completes task at `10:15 AM` → Task updated, `updatedAt: 1720562500000`, `completed: true`
2. Device sends queued action at `10:16 AM`: `{action-snooze-task-abc, baseVersion: 1720562400000}`

**Server processes device action**:
- Finds task `task-abc`
- Checks: `action.baseVersion (1720562400000) < task.updatedAt (1720562500000)` → **Stale data detected**
- Checks: `task.completed = true` but device is trying to snooze → **Conflict: task already completed**
- Returns:

```json
{
  "batchStatus": "conflict",
  "dryRun": false,
  "applied": [],
  "duplicates": [],
  "conflicts": [
    {
      "clientActionId": "action-snooze-task-abc",
      "status": "conflict",
      "reason": "stale_version_and_already_completed",
      "details": {
        "taskId": "task-abc",
        "deviceVersion": 1720562400000,
        "serverVersion": 1720562500000,
        "currentState": {
          "completed": true,
          "completedAt": "2026-07-09T10:15:00Z",
          "completedByDevice": "mobile-app"
        },
        "userInfo": "Task was completed via mobile app 1 minute ago"
      }
    }
  ],
  "rejected": [],
  "newCursor": "1720562500000"
}
```

**Device receives response**:
- Recognizes conflict (status: `conflict`)
- Syncs local state from server (learns task is completed)
- Removes snooze action from queue
- User is optionally notified: "This task was already completed on another device"

**Key Point**: Server-side conflict detection prevents device from silently failing or corrupting task state.

---

### Example 3: Partial Batch Success

**Scenario**: Device sends 3 actions in one batch. One succeeds, one conflicts, one is rejected.

**Request**:
```json
{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1720562470000",
  "actions": [
    {
      "clientActionId": "action-1",
      "type": "task.complete",
      "taskId": "task-exists-and-not-completed"
    },
    {
      "clientActionId": "action-2",
      "type": "task.moveTomorrow",
      "taskId": "task-already-tomorrow",
      "baseVersion": 1720562400000
    },
    {
      "clientActionId": "action-3",
      "type": "task.complete",
      "taskId": "task-that-does-not-exist"
    }
  ]
}
```

**Server processes**:
- Action 1: Task found, not completed → Apply successfully
- Action 2: Task found, `dueDate = tomorrow` → Conflict (already tomorrow)
- Action 3: Task not found → Reject (task_not_found)

**Response**:
```json
{
  "batchStatus": "partially_applied",
  "dryRun": false,
  "applied": [
    {
      "clientActionId": "action-1",
      "status": "applied",
      "taskId": "task-exists-and-not-completed"
    }
  ],
  "duplicates": [],
  "conflicts": [
    {
      "clientActionId": "action-2",
      "status": "conflict",
      "reason": "already_tomorrow",
      "details": {
        "taskId": "task-already-tomorrow",
        "dueDate": "2026-07-10"
      }
    }
  ],
  "rejected": [
    {
      "clientActionId": "action-3",
      "status": "rejected",
      "reason": "task_not_found",
      "message": "Target task was not found"
    }
  ],
  "newCursor": "1720562490000"
}
```

**Device processes response**:
- Action 1: Removes from queue (applied)
- Action 2: Keeps in queue or discards (conflict suggests task already in desired state)
- Action 3: Discards (rejected; task will never exist)
- Device now has selective retry logic: do not retry action-3 (permanent failure), optionally backoff on action-2 (conflict)

---

### Example 4: Task.Create Idempotency

**Scenario**: Device creates a quick task, connection drops, device retries creation with same `clientActionId`.

**First Submission**:
```json
{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1",
  "actions": [
    {
      "clientActionId": "action-quick-add-1",
      "type": "task.create",
      "payload": {
        "title": "Water plants",
        "priority": "P3"
      }
    }
  ]
}
```

**Server processes**: Creates new task with `id: task-new-uuid`. Records in `paper_device_actions` with status `applied` and `result: { "taskId": "task-new-uuid" }`. Returns:

```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [
    {
      "clientActionId": "action-quick-add-1",
      "status": "applied",
      "taskId": "task-new-uuid"
    }
  ],
  "duplicates": [],
  "conflicts": [],
  "rejected": [],
  "newCursor": "1720562490000"
}
```

**Second Submission (Device Retries)**:
```json
{
  "deviceId": "imx93-chiappa",
  "clientBatchId": "batch-1",
  "actions": [
    {
      "clientActionId": "action-quick-add-1",
      "type": "task.create",
      "payload": {
        "title": "Water plants",
        "priority": "P3"
      }
    }
  ]
}
```

**Server processes**: Finds `(user_id, device_id, "action-quick-add-1")` already exists with status `applied` and result `{ "taskId": "task-new-uuid" }`. Returns duplicate:

```json
{
  "batchStatus": "applied",
  "dryRun": false,
  "applied": [],
  "duplicates": [
    {
      "clientActionId": "action-quick-add-1",
      "status": "duplicate",
      "priorResult": {
        "taskId": "task-new-uuid",
        "appliedAt": "2026-07-09T10:15:00Z"
      }
    }
  ],
  "conflicts": [],
  "rejected": [],
  "newCursor": "1720562490000"
}
```

**Key Point**: Task is NOT created twice. Same task ID is returned, ensuring device knows the exact ID of the created task for future reference.
