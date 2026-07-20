---
title: KENOS AIOS APPROVAL DECIDE — UI CANARY PASS
owner: kenpan
last_verified: 2026-07-20
status: UI_CANARY_PASS — PROD_OWNER_LIMITED_NEXT
---

# AIOS Approval Decide UI Canary

## Deploys

| Item            | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Canary site     | `aios-kenos-read-canary`                                            |
| Fix deploy      | `6a5db86eed3dbdc22836aa00`                                          |
| URL             | https://aios-kenos-read-canary.netlify.app                          |
| Production AIOS | still read-only `6a5dabd7c64347bbb6baa531` until Owner-limited bake |

## Bug fixed

First canary used default `aios` schema client → `aios.kenos_decide_…` missing.
Host now calls Kenos RPCs via `lifeOsReadClient()` (`public` schema).

## UI smoke (Owner logged in)

| Step                                             | Result |
| ------------------------------------------------ | ------ |
| Pending shows seeded approval                    | PASS   |
| Notice: Owner-limited decide ON / Executor OFF   | PASS   |
| Click 确认                                       | PASS   |
| DB status `approved` reason `Owner Inbox decide` | PASS   |
| Outbox `pending` + `executor=disabled`           | PASS   |
| UI pending → 0; history shows decision           | PASS   |
| Cleanup canary rows                              | PASS   |

## Re-verify (2026-07-20 evening)

Owner replied「已登录」; re-seeded `5d9709e6-…`; UI 确认 → `approved` / `Owner Inbox decide`; outbox `approval.decide` pending; pending count 0; cleaned.

## Next

Owner-limited production AIOS bake (exact SHA, Approval decide ON, READ_CANARY off, deferred/suggestions off). Rollback: `6a5dabd7…`.
