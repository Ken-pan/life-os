---
title: KENOS PRODUCTION READ PATH INTEGRATION REPORT
owner: kenpan
last_verified: 2026-07-19
status: SHADOW_VERIFIED_AND_CLIENT_CANARY_READY
---

# KENOS PRODUCTION READ PATH INTEGRATION REPORT

**Status: `KENOS PRODUCTION READ PATHS — SHADOW_VERIFIED_AND_CLIENT_CANARY_READY`**

## 1. Starting / final SHA

- Start (authoritative freeze): `bb9a0e283bfc0ae6179c277862de59f17cefc0ce`
- Final tip: `e93b9223ff5503e0a7b3e1c46a168c9fe9f5b967` (docs stamp; feature commit `3899727fe6f8d34d307a907bcb9d8fa764aa1fba`)

## 2. Commits

Scoped AIOS/docs only: capability registry, Focus/Work read sources, Today/Inbox/Focus/Work honesty, shadow/observability, deploy plan + this report + execution-state read-path section. Unrelated WIP left unstaged.

## 3. Production capability matrix

Runtime: `buildCapabilityRegistry()` in `apps/aios/src/lib/kenos/capabilityRegistry.core.js`.

| Capability | Default surface |
| ---------- | --------------- |
| Plan read | legacy-backed (`portal_today_summary`) |
| Plan command | unavailable (no write) |
| Approval read | kenos-backed / empty |
| Approval decision | unavailable |
| Focus read | shadow-only / local until `VITE_KENOS_PROD_READ_FOCUS=1` |
| Focus write | unavailable |
| Work read | unavailable or legacy local foundation until `VITE_KENOS_PROD_READ_WORK=1` |
| Work write | unavailable (OPEN-002) |
| Activity read | legacy-backed (`life_events`) |
| Outbox delivery | unavailable |
| Assistant Action | unavailable |
| production Executor | unavailable |

Unavailable is never rendered as zero counts.

## 4. Read RPC inventory (production)

| RPC / source | Args | Client wiring |
| ------------ | ---- | ------------- |
| `kenos_list_action_approvals` | `p_limit int, p_before timestamptz` | Always (unless Approvals=`0`) |
| `kenos_list_focus_contexts` | — | Flag `VITE_KENOS_PROD_READ_FOCUS=1` |
| `kenos_deferred_items` SELECT | RLS own | With Focus flag |
| `kenos_proactive_suggestions` SELECT | RLS own | With Focus flag |
| `kenos_list_work_projects` | `p_limit, p_before` | Flag `VITE_KENOS_PROD_READ_WORK=1` |
| `kenos_list_work_action_proposals` | `p_limit, p_status` | With Work flag |
| `kenos_create_plan_task_action` | jsonb | **Not called** (writer canary only) |

## 5. Today integration

- Work cards retain `owner={card.ownerDomain}` (Phase 3 contract).  
- Capability-aware unavailable vs empty copy.  
- Production Work cards only when Today overlay flag On **and** Work read ready.  
- Default source remains `portal_today_summary` + local Work foundation.

## 6. Inbox integration

- Captured / Needs Review: legacy `life_events` + `planner_tasks` (honest partial).  
- Approvals: canonical RPC; decision actions demo-only.  
- Activity: legacy `life_events`.  
- Unavailable ≠ empty via `ReadSourceState` + capability registry.

## 7. Focus integration

- Production read behind flag; local session labeled as device-local.  
- Empty production ≠ error; unsupported ≠ zero.  
- No automatic Focus write.

## 8. Work integration

- Remains under Spaces; EntityRef on cards; no Work body into Plan (OPEN-002).  
- Empty production → onboarding copy; flag Off → unavailable (not zero).

## 9. Unavailable / empty / error

`capabilityEmptyCopy()` + `ReadSourceState` statuses: loading / empty / unavailable / unauthorized / degraded / ready.

## 10–11. Shadow sources / results

Independent fixtures in `shadowLegacyFixtures.js`:

| Compare | Legacy | Kenos |
| ------- | ------ | ----- |
| Today | portal summary fixture path | assistant today projection |
| Inbox | legacy portal pending fixture | inbox projection |
| Activity | life_events fixture | activity projection |
| Approvals | inbox shadow (unsupported legacy) vs canonical | RPC shadowItems |
| Focus (flag On) | local focus fixture | RPC contexts |
| Work (flag On) | local work fixture | RPC projects |

Self-compare forbidden. Metrics redacted via `readObservability.core.js`.

## 12. Observability

Correlation IDs, latency, status counters, shadow blocking/warning counts; console info without payloads.

## 13. Preview / staging environment

Use Vite env flags on preview builds; production Netlify sites remain `stop_builds=true`. No production domain publish in this task.

## 14. Two-user validation

Production RLS: list RPCs owner-scoped (Wave 1 verified). Client tests mock dual identities; live dual-user RPC smoke deferred to read-client canary with disposable accounts.

## 15. UI/UX validation

Nav remains Today · Assistant · Spaces · Inbox. Focus is state; Capture is action; Work in Spaces; Approvals in Inbox. No mock/migration jargon in normal copy.

## 16. Tests and CI

- `apps/aios` unit: `prodReadPath.test.js` + existing Kenos suites  
- Phase 1–6 guards  
- `check:lifeos-styles`  
- Contract parity  
Targeted Planner E2E not required for AIOS-only slice unless CI flags regressions.

## 17. Migration checksum confirmation

Wave 1 five files unchanged; tip remains `20260719130500`.

## 18. Production database unchanged (by this task)

No DDL/DML from this integration slice. Tip and counts remain Wave 1 post-apply baseline unless Owner activity elsewhere.

## 19. Client production status

Builds paused; no production deploy; flags default Off for Focus/Work overlay.

## 20. Writer status

Legacy Planner writers active; Kenos command/decision/Focus·Work write unavailable.

## 21. Remaining Red / Yellow

| Gate | Level |
| ---- | ----- |
| Read client canary phrase | next |
| Full client deploy | Yellow |
| Writer canary | Red until phrase |
| Focus TRUNCATE grant residual | Yellow (staging parity) |
| OPEN-002 | tracked Yellow |

## 22. Readiness for read-only client canary

**Ready** under `APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY` with Focus/Work flags opt-in on preview.

## 23. Readiness for full client deployment

**Not yet** — requires separate `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY` after canary.

## 24. Readiness for writer canary

Schema ready; **not** started. Phrase: `APPROVE_KENOS_PRODUCTION_WRITER_CANARY`.

## 25. Rollback / flag-disable

See `docs/ops/kenos-production-read-client-deploy-plan.md`.

## 26. Exact next approval phrase

`APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY`
