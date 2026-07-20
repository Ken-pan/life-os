# Continuity E2E continuity-e2e-2026-07-20T19-36-27-382Z

## Stamps
- Flow A: PARTIAL
- Flow B: PARTIAL
- Account isolation: PARTIAL

## Accounts
- A: 334452284ken@gmail.com (c2831538-94b0-4a57-b034-5e873a53c42e)
- B: pettimes666666@gmail.com (8febdb83-ec49-467d-a9bf-d42620cc68fe)

## Entities
- Task: kenos-cont-mrtml2wn / Continuity Planner Test 0T19-36-27-382Z
- Exercise: c_fly

## Blockers
- Flow A UI Continuity ok; planner_tasks.completed not visible to clientA after upsert

## DB before/after
```json
{
  "before": {
    "A_rows": 1,
    "B_rows": 0,
    "A_error": null,
    "B_error": null,
    "A_title": "Continuity Planner Test 0T19-36-27-382Z"
  },
  "afterFlowA": {
    "completed": false,
    "title": "Continuity Planner Test 0T19-36-27-382Z",
    "notes": "Continuity E2E continuity-e2e-2026-07-20T19-36-27-382Z"
  },
  "fitness": {
    "B_sees_A_sessions": 0,
    "B_error": null
  },
  "final": {
    "A_rows": 1,
    "B_rows": 0,
    "fitnessBSeesA": 0
  }
}
```
