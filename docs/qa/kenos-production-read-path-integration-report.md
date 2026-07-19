---
title: KENOS PRODUCTION READ PATH INTEGRATION REPORT
owner: kenpan
last_verified: 2026-07-19
status: SHADOW_VERIFIED_AND_CLIENT_CANARY_READY_FOR_OWNER_APPROVAL
---

# KENOS PRODUCTION READ PATH INTEGRATION REPORT

**Overall: `KENOS PRODUCTION READ PATHS — SHADOW_VERIFIED_AND_CLIENT_CANARY_READY_FOR_OWNER_APPROVAL`**

| Readiness gate | Status |
| -------------- | ------ |
| Read-path implementation | **Ready** |
| Netlify pause evidence | **`PRODUCTION_CLIENT_AUTOBUILDS_LIVE_REVALIDATED`** — see `docs/qa/kenos-live-build-pause-revalidation-report.md` |
| Read-path docs push (`d2d2b6833`) | Complete after live revalidation |
| Production read client canary | **`PRODUCTION_READ_CLIENT_CANARY_READY_FOR_OWNER_APPROVAL`** |
| Full client deploy (`APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`) | **Not approved** — separate phrase; builds remain paused |

## 0. Netlify pause evidence boundary

**Current label: `PRODUCTION_CLIENT_AUTOBUILDS_LIVE_REVALIDATED`** (supersedes interim `NETLIFY_PAUSE_STATE_INHERITED_NOT_LIVE_REVALIDATED`).

Live checks (Netlify CLI user session + `gh` API, 2026-07-19): seven sites `stop_builds=true`; Gallery `disabled_manually`; published tip `be6f2612…`; zero build hooks; no running builds; no ready deploy of post-pause Kenos SHAs. Builds / Gallery were **not** restored.

## 1. Starting / final SHA

- Start (authoritative freeze): `bb9a0e283bfc0ae6179c277862de59f17cefc0ce`
- Feature commit: `3899727fe6f8d34d307a907bcb9d8fa764aa1fba`
- Docs tip after earlier stamps (already on `origin/master` before this correction): `f81fc88d5b7be4643c955c5ec33a0c316283ce47`
- This correction commit: local only until Netlify live revalidation unblocks push

## 2. Commits

- `3899727fe` — feat(aios): wire production Kenos read paths behind flags
- `e93b9223f` / `756d1c7f9` / `f81fc88d5` — docs stamps (pushed before this Netlify-auth gate clarification)
- Pending local docs: Netlify inherited-not-live + readiness blockers (this file + execution state)

Unrelated WIP left unstaged.

## 3. Production capability matrix

Runtime: `buildCapabilityRegistry()` in `apps/aios/src/lib/kenos/capabilityRegistry.core.js`.

| Capability          | Default surface                                                            |
| ------------------- | -------------------------------------------------------------------------- |
| Plan read           | legacy-backed (`portal_today_summary`)                                     |
| Plan command        | unavailable (no write)                                                     |
| Approval read       | kenos-backed / empty                                                       |
| Approval decision   | unavailable                                                                |
| Focus read          | shadow-only / local until `VITE_KENOS_PROD_READ_FOCUS=1`                   |
| Focus write         | unavailable                                                                |
| Work read           | unavailable or legacy local foundation until `VITE_KENOS_PROD_READ_WORK=1` |
| Work write          | unavailable (OPEN-002)                                                     |
| Activity read       | legacy-backed (`life_events`)                                              |
| Outbox delivery     | unavailable                                                                |
| Assistant Action    | unavailable                                                                |
| production Executor | unavailable                                                                |

Unavailable is never rendered as zero counts.

## 4. Read RPC inventory (production)

| RPC / source                         | Args                                | Client wiring                       |
| ------------------------------------ | ----------------------------------- | ----------------------------------- |
| `kenos_list_action_approvals`        | `p_limit int, p_before timestamptz` | Always (unless Approvals=`0`)       |
| `kenos_list_focus_contexts`          | —                                   | Flag `VITE_KENOS_PROD_READ_FOCUS=1` |
| `kenos_deferred_items` SELECT        | RLS own                             | With Focus flag                     |
| `kenos_proactive_suggestions` SELECT | RLS own                             | With Focus flag                     |
| `kenos_list_work_projects`           | `p_limit, p_before`                 | Flag `VITE_KENOS_PROD_READ_WORK=1`  |
| `kenos_list_work_action_proposals`   | `p_limit, p_status`                 | With Work flag                      |
| `kenos_create_plan_task_action`      | jsonb                               | **Not called** (writer canary only) |

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

Independent fixtures in `shadowLegacyFixtures.js`. Self-compare forbidden. Metrics redacted via `readObservability.core.js`.

## 12. Observability

Correlation IDs, latency, status counters, shadow blocking/warning counts; console info without payloads.

## 13. Preview / staging environment

Isolated Vite preview / staging clients allowed. Do **not** claim production Netlify pause from live API this session — only inherited pause evidence (see §0). No production domain publish.

## 14. Two-user validation

Production RLS: list RPCs owner-scoped (Wave 1 verified). Client tests mock dual identities; live dual-user RPC smoke deferred until canary is unblocked.

## 15. UI/UX validation

Nav remains Today · Assistant · Spaces · Inbox. Focus is state; Capture is action; Work in Spaces; Approvals in Inbox.

## 16. Tests and CI

- `apps/aios` unit: `prodReadPath.test.js` + existing Kenos suites
- Phase 1–6 guards; `check:lifeos-styles`; contract parity
- Targeted Planner E2E not re-run for AIOS-only slice

## 17. Migration checksum confirmation

Wave 1 five files unchanged; tip remains `20260719130500`.

## 18. Production database unchanged (by this task)

No DDL/DML from this integration slice. Tip and counts remain Wave 1 post-apply baseline unless Owner activity elsewhere.

## 19. Client production status

- **No** production client deploy performed in this task.
- Pause state: **inherited, not live-revalidated** (`NETLIFY_PAUSE_STATE_INHERITED_NOT_LIVE_REVALIDATED`).
- Flags default Off for Focus/Work overlay.

## 20. Writer status

Legacy Planner writers active; Kenos command/decision/Focus·Work write unavailable.

## 21. Remaining Red / Yellow

| Gate                            | Level                             |
| ------------------------------- | --------------------------------- |
| Netlify live pause revalidation | **Red** — blocks push + canary    |
| Read client canary phrase       | Blocked until live pause verified |
| Full client deploy              | Red / separate phrase             |
| Writer canary                   | Red until phrase                  |
| Focus TRUNCATE grant residual   | Yellow (staging parity)           |
| OPEN-002                        | tracked Yellow                    |

## 22. Readiness for read-only client canary

**`PRODUCTION_READ_CLIENT_CANARY_READY_FOR_OWNER_APPROVAL`**

Awaiting owner phrase `APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY`. Not started.

## 23. Readiness for full client deployment

**Not yet** — separate `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`. Builds remain paused.

## 24. Readiness for writer canary

Schema ready; **not** started. Phrase: `APPROVE_KENOS_PRODUCTION_WRITER_CANARY`.

## 25. Rollback / flag-disable

See `docs/ops/kenos-production-read-client-deploy-plan.md`.

## 26. Exact next approval phrase

`APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY`
