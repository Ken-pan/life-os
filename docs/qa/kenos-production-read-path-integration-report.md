---
title: KENOS PRODUCTION READ PATH INTEGRATION REPORT
owner: kenpan
last_verified: 2026-07-19
status: IMPLEMENTATION_READY_CANARY_BLOCKED_PENDING_LIVE_BUILD_PAUSE_VERIFICATION
---

# KENOS PRODUCTION READ PATH INTEGRATION REPORT

**Overall: `KENOS PRODUCTION READ PATHS — IMPLEMENTATION_READY_CANARY_BLOCKED_PENDING_LIVE_BUILD_PAUSE_VERIFICATION`**

| Readiness gate | Status |
| -------------- | ------ |
| Read-path implementation | **Ready** (local tests/build/RPC smoke/shadow; flags default Off) |
| Netlify pause evidence | **`NETLIFY_PAUSE_STATE_INHERITED_NOT_LIVE_REVALIDATED`** |
| Further `git push` | **`BLOCKED_PENDING_NETLIFY_AUTH`** |
| Production read client canary | **`BLOCKED_PENDING_LIVE_BUILD_PAUSE_VERIFICATION`** |
| Full client deploy (`APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`) | **Blocked** — not in scope; requires live revalidation first |

Do **not** treat inherited Netlify evidence as current live verification. Upgrade to `PRODUCTION_CLIENT_AUTOBUILDS_LIVE_REVALIDATED` only after local Netlify auth + live checks below succeed.

## 0. Netlify pause evidence boundary

**Label: `NETLIFY_PAUSE_STATE_INHERITED_NOT_LIVE_REVALIDATED`**

Facts:

- Last live verification of seven sites `stop_builds=true` and UIUX Gallery `disabled_manually` is recorded in `docs/qa/kenos-authoritative-push-report.md` (`PRODUCTION_CLIENT_AUTOBUILDS_PAUSED`).
- This read-path task did **not** restore builds, enable workflows, manual-deploy, or change hosting config.
- This machine currently lacks Netlify auth; a live `sites:list` / API recheck **aborted** (interactive prompt / no auth). Therefore this task **cannot** prove remote pause state was not changed externally since that report.
- Inherited evidence must **not** be described as current live verification.

Live upgrade checklist (after secure local Netlify login or local secret env — **never** paste tokens in chat):

1. planner / fitness / finance / music / portal / home / aios → `stop_builds=true`
2. UIUX Gallery → `disabled_manually`
3. No unexpected deploy since the last authoritative push report
4. On success only → `PRODUCTION_CLIENT_AUTOBUILDS_LIVE_REVALIDATED`

Until then: no further push, no production client canary, no Netlify deploy, no restore `stop_builds`, no restore Gallery, no `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY` work.

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

| Gate | Level |
| ---- | ----- |
| Netlify live pause revalidation | **Red** — blocks push + canary |
| Read client canary phrase | Blocked until live pause verified |
| Full client deploy | Red / separate phrase |
| Writer canary | Red until phrase |
| Focus TRUNCATE grant residual | Yellow (staging parity) |
| OPEN-002 | tracked Yellow |

## 22. Readiness for read-only client canary

**`BLOCKED_PENDING_LIVE_BUILD_PAUSE_VERIFICATION`**

Implementation is ready for a future canary **after** `PRODUCTION_CLIENT_AUTOBUILDS_LIVE_REVALIDATED`. Do not issue or act on `APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY` until then.

## 23. Readiness for full client deployment

**Not yet** — separate `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`; also blocked on live pause verification.

## 24. Readiness for writer canary

Schema ready; **not** started. Phrase: `APPROVE_KENOS_PRODUCTION_WRITER_CANARY`.

## 25. Rollback / flag-disable

See `docs/ops/kenos-production-read-client-deploy-plan.md`.

## 26. Exact next steps (ordered)

1. Restore Netlify auth on this machine via secure local login / local secret env (not chat).
2. Live-verify pause → `PRODUCTION_CLIENT_AUTOBUILDS_LIVE_REVALIDATED`.
3. Then (and only then) unstick push / consider `APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY`.
