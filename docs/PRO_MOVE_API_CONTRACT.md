# reMarkable Paper Pro Move Device API Contract

This document specifies the communication contract between the future reMarkable Paper Pro Move device client and the PlannerOS backend.

## Design Decisions

### Idempotency
- All mutation requests are submitted via batches to `/api/paper/actions`.
- `clientBatchId` (at the batch level) and `clientActionId` (at the action level) are **required**.
- Mock endpoints echo these IDs back to verify reception.
- The real endpoint in the future must deduplicate actions by `clientActionId` against an execution log before modifying real database states.

### Delta Sync Strategy
- **Mock Phase**: Returns a hardcoded list of upserted/deleted entities.
- **MVP Real Phase**: Emulates delta changes by querying all tasks for the user and filtering for those where `updatedAt > cursor`.
- **Future Phase**: May introduce a dedicated device action/sync log table if performance or audit trails require it.

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

### Response Shape (JSON)
```json
{
  "batchStatus": "applied",
  "applied": [
    "action-uuid-1",
    "action-uuid-2",
    "action-uuid-3",
    "action-uuid-4"
  ],
  "conflicts": [],
  "newCursor": "1720562490000"
}
```

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
