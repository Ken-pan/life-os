---
title: Kenos Phase 0 安全、分类与动作风险矩阵
owner: kenpan
last_verified: 2026-07-18
doc_role: phase-0-policy-matrices
status: phase-0-freeze-package-draft
---

# Kenos Phase 0 安全、分类与动作风险矩阵

> Owner 可签署的保守默认。本文是 recommendation，不是 approval；所有 OPEN-001–008 仍为 `PENDING`。

## Security domains

| Domain | Allowed storage | Allowed processing | Default sharing | Cross-domain rule | Unknown-value fallback | Status/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Personal | Existing app local stores and approved Supabase paths | App/domain code and approved model routes | Private to signed-in user | Cross-domain write only through target Owner Action | classify more strictly as `sensitive` | DRAFT; AGENTS local-first + target architecture |
| Work | External system or owner-approved local encrypted store only | Default no personal-cloud model/storage; local processing still subject to company policy | No implicit sharing into Personal | Work references Personal/Plan via `EntityRef`; no mirrored bodies | deny cloud copy/model use | DRAFT; OPEN-002 |
| Household | Home local/project stores and approved Home schema mirrors | Home domain only unless owner approves family model | Single-user household until OPEN-003 | Other domains reference home objects, not edit geometry/items | single-user only | DRAFT; Home README/supabase docs |
| System | Platform config, logs, activity, sync metadata | Platform services; no domain-content privilege escalation | Least privilege | System may coordinate but not become data Owner | no implicit domain bypass | DRAFT; constitution and runbook |

## Data classification

| Classification | Storage | Cloud model | Local model | Search/index | Retention/export | Unknown-value fallback | Status/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| public | Normal app/Supabase paths | Allowed if source policy permits | Allowed | Allowed | Normal export/delete | n/a | DRAFT |
| personal | Existing personal app storage | Allowed only with user/auth policy | Allowed | Allowed with user scope | Export/delete by domain | sensitive | DRAFT |
| sensitive | Existing domain storage with RLS/local protection | Minimize; redact in Activity | Allowed if device policy permits | Redacted/field-scoped | Explicit export/delete | restricted_local_only | DRAFT |
| work_confidential | External Work or approved work store | Deny personal cloud/model by default | Only if company policy permits | No personal embedding/index | Work retention policy | no personal cloud/model | DRAFT; OPEN-002 |
| restricted_local_only | Local only | Deny | Allowed only on approved device/runtime | Local only | User-controlled export; no cloud backup assumption | deny | DRAFT |
| ephemeral | Memory/session/local transient store | Deny durable training/index by default | Allowed for immediate task | No durable index by default | Shortest safe retention | shortest safe retention | DRAFT |

## Action risk and approval

| Risk | Meaning | Default decision | Preview/approval | Audit/activity | Undo/compensation | Permanent grant | Existing capability evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R0 | read-only/local observation | Allow within capability | No approval; show sensitive access where relevant | Activity for sensitive reads | n/a | Time/scope-limited only | Portal/Home/MCP read surfaces exist |
| R1 | low-impact reversible write/new draft | Allow after policy validation | No approval for low-risk create; visible queued/result | Required | Required where meaningful | Narrow scoped, revocable | Plan create-task target; Home append-only event insert pattern |
| R2 | meaningful bounded reversible modification | Allow only with preview or Undo | Preview or post-action Undo | Required | Required | Deny broad permanent grant | Task complete/reschedule, Home item edits, Finance sync normalization |
| R3 | external, sensitive or high-impact action | Deny without explicit confirmation | Required payload-bound approval | 100% | Required where possible | Deny by default | Work connector writes, email/Jira/share-file targets |
| R4 | destructive/irreversible/system-critical action | Unsupported in Phase 0/1 | Owner/operator gate with backup | 100% | Explicit recovery plan | Never | Production migration/delete/restore/deploy/DNS |

## Existing write capability recommendations

| Capability | Current writer evidence | Proposed risk | Approval/activity/undo recommendation | Gap |
| --- | --- | --- | --- | --- |
| Create Plan task | Roadmap first vertical slice; Planner local-first baseline | R1 when creating standalone task; R2 if scheduling/modifying existing plan | No explicit approval for R1; always Activity; idempotency key; Undo delete/archive | Need exact Planner writer/store evidence before implementation |
| Complete/reschedule Plan task | Contracts RFC names `plan.complete_task` and `plan.reschedule_task` | R2 | Preview/Undo; Activity shows source and previous state | Needs executor validation and conflict policy |
| Home event append | `home.events` append-only mirror and IndexedDB first landing | R1/R2 depending event | Idempotent append; Activity or event log; no destructive undo, compensating event | Household/security metadata incomplete |
| Home storage snapshot upsert for MCP | `home.storage_snapshots` skinny mirror | R1 | Activity optional for routine sync; overwrite should be idempotent | Ensure snapshot cannot become full object truth |
| Finance extension sync | AGENTS production plugin path | R2/R3 depending external account mutation | Explicit confirmation for external writes; Activity redacts amount/vendor as needed; disconnect/reauth | Connector lifecycle unknown |
| Work connector write | Target/RFC only | R3 | Payload-bound approval, no permanent grant, Activity redaction | OPEN-002 blocks implementation |
| Supabase migration, RLS/auth, production restore, deploy/DNS | Runbook identifies migration/restore/deploy risks | R4 | Owner approval, backup, impact preview, rollback/forward repair | Prohibited in Phase 0 task |

## Owner sign-off queue

| Decision | Evidence-backed recommendation | Evidence | Consequence if deferred | Owner status |
| --- | --- | --- | --- | --- |
| OPEN-001 Health/Status/Focus | Keep domain ID `health`; treat Status as Assistant/Today read model; treat Focus as platform capability until owner freezes UX name | Decision register and target architecture already recommend this split | No Health/Focus rename or data migration | PENDING |
| OPEN-002 Work cloud/model policy | Default deny Work mirroring, personal Supabase body storage, and embedding/model use; allow only explicit external references | Target connector/search policies; security gate | No Work connector mirror/embedding implementation | PENDING |
| OPEN-003 Household multi-user | Define Household domain and Home owner only; no multi-account UI/RLS expansion | Home current docs are single-user/project oriented; decision register | Home migration remains single-user | PENDING |
| OPEN-004 Goal/Value owner | Use Core Goals as coordination/read model that does not directly write domains | Target architecture Value→Goal hierarchy | Goal contracts remain draft; Plan is not overloaded as values owner | PENDING |
| OPEN-005 Mac Runtime | Require threat-model + capability spike before choosing XPC/localhost/Tauri sidecar | Runbook and gates require native/security proof | No Mac runtime implementation in Phase 0 | PENDING |
| OPEN-006 Apple repo path | Prefer `clients/apple`, with boundary guard before creating workspace | Decision register recommendation | No Xcode workspace creation | PENDING |
| OPEN-007 attention budget | Use 3/day as initial interrupt budget; digest/contextual notifications until telemetry | Target architecture says initial 3 and data-adjusted final | No proactive interruption product commitment | PENDING |
| OPEN-008 Portal retention | Minimum two stable releases plus 30 days no old writes; keep per-path deep-link plan | Ledger and QA Portal retirement gate | No retirement date/redirect/delete | PENDING |

## KR-P1-001 readiness decision dependencies

> This table is a readiness gate for `KR-P1-001 Plan create task Action/Outbox vertical slice`. Ken approved the KR-P1-001 temporary defaults on 2026-07-18. Status `TEMPORARY_APPROVED_FOR_KR-P1-001` is scoped only to KR-P1-001 and expires for mandatory review after KR-P1-001 acceptance and before KR-P1-002 starts; it is not a permanent Kenos architecture decision.

| Dependency | Blocks KR-P1-001? | Recommended temporary option | Reason | Risk if wrong | Reversibility | Expiry / invalidation condition | Owner status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plan Task canonical owner | YES | Plan / Planner is canonical Owner for task data | KR-P1-001 is only safe if Action/Outbox is an envelope around Plan, not a new task store | Dual task Owner, conflicting completion/schedule state | High: no schema/data migration in readiness; change ledger before code | Invalid if implementation inventory finds another active authoritative task store | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| Create-task single writer | YES | Plan domain executor is the only non-UI automated writer; Assistant/Today/MCP/native send `ActionRequest` only | Prevents Assistant or connectors from writing task tables directly | Long-term dual writer and bypassed validation | Medium: adapters can route back to current Planner writer before disabling old writers | Invalid if current Planner create-task writers cannot be enumerated | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| Assistant write boundary | YES | Assistant may propose and submit Action Requests; it may not hold service role, mutate Plan directly, or downgrade risk | Preserves Policy → Approval → Executor boundary | Unauthorized write, missing approval/activity | High before runtime; remove adapter or fail-closed | Invalid if existing Assistant/MCP path already mutates Plan directly without inventory | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| Outbox persistence | YES | Business task write and outbox/activity record must be committed atomically in the Plan-owned transaction boundary | Prevents task-without-event or event-without-task | Lost sync/activity or duplicate side effect | Medium: no historical backfill required for create-only slice | Invalid if current storage cannot support atomic outbox without schema owner approval | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| ID and idempotency strategy | YES | Client/request supplies stable idempotency key; executor returns same result for retries; task ID remains Plan-owned | Required for offline retry and crash-after-write safety | Duplicate tasks on retry or conflicting IDs | Medium: can change key derivation before public cutover | Invalid if two clients cannot generate stable keys without leaking sensitive data | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| Offline retry | YES | Queue ActionRequest locally or in approved outbox; retry with bounded backoff; surface queued/failed/dead-letter state | Create-task must work local-first and not silently drop requests | Silent data loss, duplicate create, user distrust | Medium: queued requests can be replayed or cancelled before old writer cutover | Invalid if local-first Planner store cannot expose queued state without runtime scope expansion | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| Action risk / approval | YES | Standalone create task = R1; scheduling/modifying existing plan or sensitive source = R2; R3/R4 fail-closed | Allows low-risk creation while preventing sensitive/external/destructive escalation | Over-approval friction or under-approved sensitive write | High for R1/R2 thresholds; adjust policy before cutover | Invalid if payload includes Work/Health/Money/Home restricted data by default | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| Activity logging semantics | YES | Activity records who/what/why/source/action/result with redaction; it is explanatory/audit metadata, not task truth | Needed for explainability without becoming another domain Owner | Missing audit or Activity becomes second mutable task projection | Medium: Activity schema can be additive if task truth remains Plan | Invalid if no approved storage/redaction target exists | TEMPORARY_APPROVED_FOR_KR-P1-001 |
| OPEN-001 Health/Status/Focus | NO for standalone Plan create-task | Keep PENDING; do not include health/focus payloads | KR-P1-001 can avoid Health data | If health source enters payload, classification/risk may be wrong | High by excluding Health sources | Blocks only if create-task source includes Health/Focus | PENDING |
| OPEN-002 Work cloud/model policy | CONDITIONAL | Default deny Work body mirroring/model use; Work-sourced create task must store only minimal reference/redacted summary | Work payloads are the highest leakage risk for task creation | Work confidential data copied into personal cloud/activity | Medium by excluding Work sources until policy approved | Blocks if KR-P1-001 includes Work connector/capture source | PENDING |
| OPEN-003 Household multi-user | NO for standalone Plan create-task | Keep Home/Household references out of first slice | Household RLS/multi-user is not required for generic Plan task | Wrong household sharing if home object becomes source | High by excluding Home object writes | Blocks only if Home source/reference is in payload | PENDING |
| OPEN-004 Goal/Value owner | NO | Keep goals as optional read-only rationale, not writer | Create task can exist without Goal system | Goal becomes hidden task Owner/priority writer | High by omitting Goal writes | Blocks only if task priority/goal binding is mandatory | PENDING |
| OPEN-005 Mac Runtime | NO | No Mac runtime in KR-P1-001 readiness | Web/local executor readiness does not require native runtime | Premature native trust boundary | High by excluding native runtime | Blocks only if first client is Mac runtime | PENDING |
| OPEN-006 Apple repo path | NO | No Apple workspace/client in KR-P1-001 readiness | First slice can be web/contract-only | Directory/boundary churn | High by excluding Apple files | Blocks only if Apple client is included | PENDING |
| OPEN-007 attention budget | NO | No proactive notification in create-task readiness | Creating a task does not require interruption budget | Notification spam if bundled | High by excluding notifications | Blocks only if slice sends proactive reminders | PENDING |
| OPEN-008 Portal retention | NO | No Portal redirect/retirement in KR-P1-001 | Create-task writer can be validated without default-entry migration | Accidental Portal cutover | High by excluding Portal routing | Blocks only if Portal becomes entry/cutover scope | PENDING |

### KR-P1-001 temporary scope exclusions

| Temporary decision | Status | Approved owner | Approval date | Scope | Review condition |
| --- | --- | --- | --- | --- | --- |
| Work-sourced create-task exclusion | TEMPORARY_APPROVED_FOR_KR-P1-001 | Ken | 2026-07-18 | Exclude Work payload, email-to-task, meeting-to-task, browser Connector capture, bulk import, proactive inferred task, and automatic cross-domain task creation from KR-P1-001; OPEN-002 remains PENDING | Review after KR-P1-001 acceptance and before KR-P1-002 starts |
| KR-P1-001 runtime scope | TEMPORARY_APPROVED_FOR_KR-P1-001 | Ken | 2026-07-18 | Only direct Plan UI task creation and explicit user-requested Assistant CreateTask Action | Review after KR-P1-001 acceptance and before KR-P1-002 starts |
