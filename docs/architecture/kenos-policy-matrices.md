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
