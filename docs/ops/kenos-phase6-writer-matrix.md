---
title: Kenos Phase 6 — Production Writer / Owner Matrix
owner: kenpan
last_verified: 2026-07-19
status: stage-a-inventory-only
---

# Production Writer / Owner Matrix

Canonical ownership from Constitution + Phase 1–5. **Cutover status is inventory, not authorization.**

| Object | Canonical Owner | Current production writer | Target writer | Existing bypass | Cutover status |
| --- | --- | --- | --- | --- | --- |
| Task | Plan | `planner_tasks` authenticated upsert (repo sync) + MCP `complete_task` upsert; create path command/fail-closed | `kenos_create_plan_task_action` (+ future update/complete RPCs) | Direct RLS `*_own` policies still live; legacy sync | **BLOCKED** — P1-001 artifact ready, not applied |
| schedule / lists / projects (Planner) | Plan | Planner cloud tables via existing RLS | remain Plan-owned; Action gradually | existing Planner writers | not Wave 1 cutover |
| Work Project / Deliverable / Meeting / Decision / WorkActionProposal | Work | AIOS local simulation only | hosted Work RPC + Executor | review SQL not applied | **LOCAL_SIMULATION** |
| Library document | Library | Vault / Knowledge (external) | EntityRef only from Work/Assistant | Work must not copy bodies | OPEN-002 related |
| Approval | Platform | **none hosted**; AIOS read model + review SQL | Approval decision command + Executor revalidation | read-only / Fake | **NO_HOSTED_APPLY** |
| Activity | Platform | local Kenos Activity + compat `life_events` reads | `kenos_plan_activity` (+ domain activity) | life_events as compatibility shadow | not production canonical |
| Outbox | Platform | local `kenosActionOutbox` | `kenos_plan_outbox` + worker role | worker role absent hosted | not production |
| Capture | Platform → domain route | Apple/AIOS local drafts | CaptureEnvelope → review → Action | fake companion transport | local only |
| FocusContext / DeferredItem / ProactiveSuggestion | Platform | AIOS localStorage + Apple FocusStore | hosted Focus tables + RPC (Wave 1A draft) | no SQL previously | **NEW review draft in Wave 1 package** |
| Training session | Training | Fitness app / local | Training owner; Focus EntityRef | Focus must not copy | not Wave 1 writer |
| Health record | Health | HealthOS companion | Health owner | OPEN-001 naming | not Wave 1 |
| Money facts | Money | Finance app | Money owner | — | not Wave 1 writer |
| Home object | Home | Home app | Home owner | — | not Wave 1 writer |
| Music entity | Music | Music app | Music owner | — | not Wave 1 writer |
| Paper reference | Paper (sibling) + Planner paper API | Planner paper functions | reference-only in Kenos | paper migrations remain | connector Wave 6 |
| Assistant conversation / memory | Assistant / AIOS | AIOS local + aios schema sync | keep local-first; Action for domain writes | cloud viewer read-only | not Task owner |
| Connector source reference | Integration | per-connector | CaptureEnvelope / source ref | external write Off | Wave 6 read-only first |
| MCP Task create | Plan command | `hosted_rpc_required` fail-closed (no upsert create) | hosted RPC | complete_task still upsert | create ready after Wave 1A/B RPC |
| Apple Action queue | Platform → domain | FakeActionExecutor | real Executor registry | mock session | Wave 4 |

## Hard locks until approval phrases

| Action | Required phrase |
| --- | --- |
| Hosted migration / RLS apply | `APPROVE_KENOS_PRODUCTION_WAVE_1` |
| Writer canary | `APPROVE_KENOS_PRODUCTION_WRITER_CANARY` |
| Full writer cutover | `APPROVE_KENOS_PRODUCTION_WRITER_CUTOVER` |
| Legacy writer retirement | `APPROVE_KENOS_LEGACY_WRITER_RETIREMENT` |
| Apple distribution | `APPROVE_KENOS_APPLE_DISTRIBUTION` |

## References

- `docs/ops/kenos-p1-direct-write-remediation.md`
- `docs/ops/kenos-phase1-writer-cutover.md`
- `docs/qa/kenos-audit-remediation-2026-07-19.md`
