---
title: KENOS AIOS PRODUCTION READ-ONLY DEPLOY REPORT
owner: kenpan
last_verified: 2026-07-19
status: DEPLOYED_AND_VERIFIED
---

# KENOS AIOS PRODUCTION READ-ONLY CLIENT — DEPLOYED_AND_VERIFIED

**Phrase:** `APPROVE_KENOS_AIOS_PRODUCTION_READ_ONLY_DEPLOY`

## 1. AIOS_READ_ONLY_DEPLOY_SHA

`f07944c9210f08d40c8483e3a598b29f3c714bb8`

## 2. Canary SHA vs deploy SHA

| SHA                                        | Role                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `b47c6dcbefbc85c1353a76e86e0b7e1b1c69f8bb` | Canary freeze baseline                                                    |
| `de4eecd7a369a8a0e68c145405d577d20ebe970b` | Fail-closed three-layer guards                                            |
| `f07944c9210f08d40c8483e3a598b29f3c714bb8` | **Deployed** — fail-closed + Work empty≠not-connected + softer stale copy |

Deploy SHA is a descendant of the Canary-validated fail-closed commit; product delta is UI semantics only (acceptance finding).

## 3. CI result

https://github.com/Ken-pan/life-os/actions/runs/29703109563 — **success** on `f07944c9210f08d40c8483e3a598b29f3c714bb8`

## 4. Owner product acceptance

Completed on isolated Canary https://aios-kenos-read-canary.netlify.app with Owner authenticated session:

| Check                                 | Result                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Today                                 | Pass — real portal summary / inbox counts; stale shown distinctly                                                |
| Assistant                             | Pass — cloud scope visible (“云端查看模式…”)                                                                     |
| Spaces / Work                         | Pass after UX fix (empty ≠ 尚未接入); Work under Spaces                                                          |
| Inbox Captured / Approvals / Activity | Pass — Captured list; Approvals empty as 0 when source available; “—” when unavailable                           |
| Focus                                 | Not a fifth tab (Pass)                                                                                           |
| Capture                               | Action / Quick Capture (Pass)                                                                                    |
| Nav                                   | Today · Assistant · Spaces · Inbox (Pass)                                                                        |
| unavailable ≠ 0                       | Observed during loading (Inbox —)                                                                                |
| Write fail-closed                     | Unit + live bundle `KENOS_WRITE_BLOCKED`; no service-role in HTML                                                |
| Yellow                                | Stale summary copy was technical; softened in deploy SHA. Work empty mislabeled as 尚未接入; fixed in deploy SHA |

## 5. Deployment method

Manual CLI deploy of local production build baked with read-canary flags — **not** restoring Git auto-builds:

```text
CI=1 npx netlify deploy --prod --no-build \
  --site=5bfa64b2-7108-479d-b9e2-45f9c4d9f791 \
  --filter aios-os --dir=apps/aios/build
```

`stop_builds` remained **true** on AIOS and the other six sites.

## 6. Deployed URL / deploy ID

| Field                      | Value                                    |
| -------------------------- | ---------------------------------------- |
| URL                        | https://aios-kenos.netlify.app           |
| Deploy ID                  | `6a5d3b8813e70ad66ebf2561`               |
| Prior published (rollback) | `6a5c617ee8396b00089a6d2e` (`be6f2612…`) |

## 7. Production environment mode (baked Vite semantics)

| Semantic                              | Env / flag                           |
| ------------------------------------- | ------------------------------------ |
| PRODUCTION_READ_CANARY_MODE           | `VITE_KENOS_READ_CANARY=1`           |
| Focus/Work/Today overlay/Shadow reads | `=1`                                 |
| KENOS_PRODUCTION_WRITES_ENABLED       | false (`areProductionWritesBlocked`) |
| KENOS_EXECUTOR_ENABLED                | false                                |
| KENOS_WRITER_CANARY_ENABLED           | false                                |
| Cloud viewer                          | `VITE_AIOS_CLOUD=1`                  |

Live CDN chunk confirms `VITE_KENOS_READ_CANARY:1` + `KENOS_WRITE_BLOCKED`.

## 8. Three-layer write enforcement

1. Capability registry — write surfaces `unavailable`
2. Dispatcher — `planner_add_task` / `plannerAddTask` gated
3. Network — `guardReadOnlyClient` blocks write RPCs + denylisted table mutations

No service-role in client HTML/assets.

## 9–14. Surfaces (Canary Owner session + prod asset identity)

| Surface   | Result                                         |
| --------- | ---------------------------------------------- |
| Today     | Pass (stale/empty/unavailable distinguishable) |
| Assistant | Pass (scope visible)                           |
| Spaces    | Pass                                           |
| Inbox     | Pass                                           |
| Focus     | Pass as state / not tab                        |
| Work      | Pass after empty-state fix in deploy SHA       |

## 15. Two-user isolation

DB: list RPCs use `auth.uid()`; `*_select_own` policies; anon RPC **401** `permission denied`. Interactive second disposable account not available in agent env — **Yellow**.

## 16. Logout / cache / offline

Canary session exercised authenticated Today/Inbox. Prod origin is a **separate** Netlify host (no shared cookies with canary); Owner must sign in once on https://aios-kenos.netlify.app for interactive prod session. Offline/logout re-checks: **Yellow — Owner local follow-up recommended**.

## 17. RPC latency/errors

Anon list RPC denied (401). Authenticated canary path previously returned Today/Inbox data. No schema-mismatch errors observed in Owner session.

## 18. Mutation audit

| Check                                    | Result                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Kenos approvals/focus/work/outbox counts | all **0**                                                              |
| Wave 1 tip                               | `20260719130500`                                                       |
| planner_tasks / projects                 | `1664 / 50` unchanged                                                  |
| life_events                              | `22` (prior concurrent `fitness.workout_logged`; not AIOS Kenos write) |
| Outbound write RPC from client           | blocked in bundle (`KENOS_WRITE_BLOCKED`)                              |

## 19. Legitimate concurrent production writes

Fitness `life_events` activity remains attributed to Fitness Owner app, not AIOS deploy.

## 20. Incidents / warnings

No security incident. Yellow: second-account interactive smoke; Owner should complete one login on the AIOS production URL (new origin).

## 21. Rollback proof

Prior deploy `6a5c617ee8396b00089a6d2e` still present. Restore path:

`netlify api restoreSiteDeploy` with `site_id=5bfa64b2-7108-479d-b9e2-45f9c4d9f791`, `deploy_id=6a5c617ee8396b00089a6d2e`

(does not touch other six sites or DB). **Not executed** (no incident).

## 22. AIOS build-pause status

`stop_builds=true` (manual deploy only; auto-build still paused).

## 23. Other six sites

All `stop_builds=true`; published still `be6f2612…`.

## 24. Gallery

`disabled_manually`

## 25. Production DB

Tip `20260719130500`; no new migration; Kenos write tables empty.

## 26. Remaining Red / Yellow

| Gate                                  | Level                               |
| ------------------------------------- | ----------------------------------- |
| Broader client deploy (Planner…Home)  | Red until phrase                    |
| Writer canary                         | Red                                 |
| Portal / Executor / Gallery restore   | Red                                 |
| Second-account interactive prod smoke | Yellow                              |
| Owner login on aios-kenos origin      | Yellow (SSO not shared with canary) |

## 27. Readiness for broader read-only client deployment

**Not ready** — requires separate `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY` (or per-app phrases). Six sites remain paused.

## 28. Readiness for writer canary

**Not ready.** Phrase remains `APPROVE_KENOS_PRODUCTION_WRITER_CANARY`.

## 29. Exact next recommended approval

`APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY` — only after Owner is satisfied with AIOS production read-only usage on https://aios-kenos.netlify.app

(Do **not** restore all seven auto-builds in one step without explicit per-site control.)
