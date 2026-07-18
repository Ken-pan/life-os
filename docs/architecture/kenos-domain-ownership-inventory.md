---
title: Kenos 领域 Owner 与数据真源盘点
owner: kenpan
last_verified: 2026-07-18
doc_role: phase-0-domain-inventory
status: phase-0-freeze-package-draft
---

# Kenos 领域 Owner 与数据真源盘点

> Phase 0 事实盘点。不授权 rename、迁移、双写、生产查询或删除；每个结论只来自仓库路径、migration、schema、store、测试或显式 `UNKNOWN`。

## 完成口径

- 核心业务对象有当前 source of truth、当前 Owner、writer、reader、offline/sync、backup/recovery 路径证据或 `UNKNOWN`。
- 目标 Owner 只作为迁移建议，不冒充当前生产事实。
- 缺少 security/classification 元数据时采用 `kenos-policy-matrices.md` 的保守默认。
- 双 Owner、直接跨域写入、无 RLS、不可恢复本地真源进入 conflicts/unknowns。

## 核心对象盘点

| Object / stable ID | Current source of truth | Current owner | Writers | Readers / projections | Offline / sync | Security domain | Classification | Backup / recovery | Evidence | Gap / migration candidate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Plan task / `plan.task` | Planner local-first store and optional Supabase sync; exact table/store name requires deeper slice evidence | Plan / Planner | Planner UI; Paper provider functions remain Planner-side; future MCP/tools UNKNOWN | Planner routes/tests; Paper provider reads Plan data through Planner service | Local-first per AGENTS; optional cloud-sync `.env` changes mode | Personal default; Work only when source proves work origin | personal default; unknown external source => sensitive | Browser localStorage/optional Supabase; formal restore path UNKNOWN | `AGENTS.md` local-first note; `docs/architecture/KENOS_REFACTOR.md` Paper provider note; `docs/roadmap/KENOS_REFACTOR_PLAN.md` create-task slice | First vertical migration candidate: wrap `plan.create_task` in Action/Policy/Outbox without moving Plan ownership |
| Plan schedule / `plan.schedule` | Planner app state and/or Supabase sync path UNKNOWN | Plan / Planner | Planner UI UNKNOWN details | Planner calendar/today surfaces | Local-first; conflict policy UNKNOWN | Personal default | personal default | UNKNOWN | `packages/theme/src/generated/appRegistry.js` declares planner `/calendar`; roadmap lists Planner schedules as Phase 0 scope | Needs later inventory before schedule migration |
| Assistant conversation | AIOS / Assistant app state UNKNOWN | Assistant | AIOS/Web/Tauri surfaces UNKNOWN | Assistant UI; future Today | UNKNOWN | Personal default; Work content must stay Work | sensitive default | UNKNOWN | decision register identifies AIOS→Assistant target but current storage not frozen | Inventory blocker before Assistant data migration |
| Assistant memory | UNKNOWN | UNKNOWN | UNKNOWN | Assistant/Today future read model | UNKNOWN | Personal default unless Work/Health/Money evidence | sensitive default; restricted for secrets | UNKNOWN | policy docs require memory/model routing but repo fact absent in Phase 0 sources | Keep UNKNOWN; owner must approve memory scope before implementation |
| Library source/document | Knowledge/Library app state UNKNOWN | Library / KnowledgeOS | Knowledge UI/extension/tools UNKNOWN | Assistant/Work may reference by `EntityRef` target | UNKNOWN | Personal default; Work if source is work_confidential | personal default; work_confidential for Work docs | UNKNOWN | target architecture names Library owner; concrete repo storage not verified in this slice | Need Library-specific inventory before Capture slice |
| Money transaction/purchase/item | Finance app plus Home purchase projection | Money / Finance for financial facts; Home owns spatial item fields | Finance UI/extension; Home can store sanitized purchase provenance on storage items | Home storage item uses sanitized `purchase` metadata | UNKNOWN; Home local project state can be localStorage/IndexedDB depending capability | Personal | sensitive for amounts/order IDs | Finance backup UNKNOWN; Home storage snapshot mirrors only skinny zones | `apps/home/scripts/storage-items-unit.mjs` verifies purchase survives normalization and strips noisy fields; `apps/home/supabase/README.md` says storage snapshots are skinny mirror | Prevent Home from becoming second financial writer; use `EntityRef`/provenance only |
| Home project/scan/object | `homeos_spatial_v1` localStorage for web project; IndexedDB for events; Supabase home schema mirrors selected data | Home | Home UI, iOS import/register paths, MCP storage snapshot upsert | Home UI; `/api/mcp where_is` reads storage snapshot | LocalStorage first; `home.events` append-only mirror with `on conflict do nothing`; storage snapshots are cloud mirror | Household default, currently single-user | sensitive for interior/objects; restricted_local_only for photos/blobs | Local browser state; cloud mirrors for events/snapshots; photos intentionally local | `apps/home/README.md`; `apps/home/supabase/README.md`; `apps/home/supabase/migrations/20260714201817_home_scan_sync.sql`; `apps/home/supabase/migrations/20260717220000_home_storage_snapshots.sql` | Define Household single-user default; no multi-user UI in Phase 0 |
| Health/Focus state | HealthOS/Health app state UNKNOWN | Health for health facts; Focus owner pending | Health/Tauri/companion UNKNOWN | Assistant/Today status read model target | UNKNOWN | Personal health | sensitive/restricted_local_only depending source | UNKNOWN | OPEN-001 explicitly pending; target says Status read model and Focus platform ability recommendation | Keep OPEN-001 pending; no naming or data migration |
| Training workout/readiness | Fitness app state UNKNOWN | Training / Fitness | Fitness UI UNKNOWN | Training views; Assistant summaries target | UNKNOWN | Personal health/training | sensitive | UNKNOWN | app registry and roadmap identify Fitness/Training domain, but storage not verified here | Need Fitness-specific inventory before workout migration |
| Portal settings/today summary | `apps/portal` production entry/read model; exact keys/RPC UNKNOWN | Portal currently; target Assistant/Today | Portal UI/settings/RPC UNKNOWN | Portal cards, app launcher, badges | UNKNOWN | Personal/System mix | sensitive default for summaries | UNKNOWN | AGENTS names Portal production site; ledger has Portal retirement capabilities | Do not redirect/retire; inventory Portal keys before freeze |
| `life_events` / outbox event | Shared Supabase event/outbox baseline | Platform/System event bus | Outbox trigger, app emitters UNKNOWN | Consumers in sync/MCP/app surfaces | Transactional outbox target; current smoke exists | System | metadata; payload classification inherits source object | Supabase backup policy UNKNOWN | AGENTS lists `life_events` + Outbox trigger and verify scripts; contracts event smoke has planner/fitness event examples | Evolve, do not create second bus; add idempotency/correlation in migration slice |

## External systems and connectors

| Connector / external object | External owner | Local representation | Read/write mode | Auth location | Failure/reauth behavior | Evidence | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PaperOS provider API | PaperOS sibling repo owns device runtime; Planner owns provider API in this repo | Planner `paper-*` functions/service | Planner-side provider; no Phase 0 writes changed | UNKNOWN | UNKNOWN | `AGENTS.md` PaperOS extraction note | Contract boundary should remain Planner Action/EntityRef only |
| Home MCP `where_is` | Home | `home.storage_snapshots` skinny mirror | Read via `/api/mcp`; writer is Home active project snapshot | Supabase auth/RLS | UNKNOWN | `apps/home/supabase/README.md` HOME.MCP.13 row | Ensure MCP cannot mutate Home objects |
| Finance extension | Finance/Money | Chrome extension under `apps/finance/extension` | Production plugin sync; details UNKNOWN | UNKNOWN | UNKNOWN | AGENTS layout | Classify writes R2/R3 before connector migration |
| Future Work connectors | External work systems | Not implemented/frozen | Default read-only; write R3 recommendation | Not approved | reauth/rate/schema-change policy needed | OPEN-002, target connector policy | Block Work mirroring/embedding until owner approval |

## Local-only and native paths

| Runtime / path | Unique data | Writer | Backup/export | Upgrade behavior | Evidence | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Home web localStorage `homeos_spatial_v1` | Spatial project/edit truth | Home UI | Browser/local; no guaranteed cross-device for blobs | UNKNOWN | `apps/home/README.md` URL/project truth and blob caveat | Device loss can lose unique spatial/photo data |
| Home IndexedDB `homeos_events` | First landing for events | Home UI/event derivation | Supabase mirror for events | `on conflict do nothing` idempotent sync | `apps/home/supabase/README.md` event row | Good reversible candidate pattern, but not Plan owner |
| Old native shells | AIOS/Knowledge/Health Tauri, Health companion, Music Capacitor capabilities | App-specific | UNKNOWN | UNKNOWN | QA gates list retirement requirements | Must not delete until per-capability inventory proves no unique data |

## Confirmed conflicts and unknowns

| ID | Finding | Evidence | Risk | Proposed owner decision or ledger slice | Status |
| --- | --- | --- | --- | --- | --- |
| INV-001 | Checkout branch is `work`, while repo policy says `master` only | `git branch --show-current` preflight; AGENTS git policy | Cloud/task provenance mismatch | Record in execution state; do not create/switch branches in task | OPEN |
| INV-002 | Ticket naming baseline is red due broken docs link unrelated to Kenos allowlist | `npm run verify:ticket-naming` reports `docs/qa/README.md` -> `../ui-qa-screenshots/` | Final verify remains red unless owner allows non-Kenos docs fix | Treat as baseline failure; do not edit allowlist-excluded path | OPEN |
| INV-003 | Multiple core objects have UNKNOWN concrete stores/writers | This inventory | Owner freeze package may be incomplete for those domains | First migration must avoid UNKNOWN domains and choose Plan create-task only after Plan writer is verified in its slice | OPEN |
