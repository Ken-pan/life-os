---
title: KENOS AIOS APPROVAL DECIDE WRITER CANARY DEPLOY
owner: kenpan
last_verified: 2026-07-20
status: DEPLOYED — AWAITING_OWNER_OR_AUTOMATED_UI_SMOKE
---

# AIOS Approval Decide Writer Canary

| Item | Value |
| --- | --- |
| Site | `aios-kenos-read-canary` (`8557bb44-…`) |
| Deploy | `6a5db3ae89887b0ddf119531` |
| URL | https://aios-kenos-read-canary.netlify.app |
| Code tip at bake | `b96b38e41…` + uncommitted approvals host/page at deploy time |
| Production AIOS | unchanged (`6a5dabd7…` read-only) |
| Bake | `PROD_WRITES=1` + Approval request/decide + Owner email cohort; `READ_CANARY=0` |
| Executor | disabled |

## Scope

- Approvals Inbox can call `kenos_decide_action_approval_action` for Owner cohort
- No ProductionExecutor
- Production `aios-kenos` not switched

## Next

UI smoke: login → seed pending approval via RPC → Approve/Reject on canary → mutation audit → then optional Owner-limited prod AIOS bake.
