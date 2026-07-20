---
title: KENOS APPROVAL REQUEST/DECIDE — PRODUCTION_VERIFIED_EXECUTOR_OFF
owner: kenpan
last_verified: 2026-07-20
status: PRODUCTION_VERIFIED_EXECUTOR_OFF
---

# Approval request / decide production chain

| Check | Result |
| --- | --- |
| request → pending | PASS |
| Owner decide → approved | PASS |
| same-key decide replay | PASS — duplicate, no second decision |
| Test User decide Owner approval | DENY `approval_compare_and_set_failed` / not found |
| Outbox delivery / Executor | delivered=0 · Executor Off |
| UI implication | decide changes Approval state only |

No ProductionExecutor side effects. Cleanup: smoke approval row removed after verify.
