---
title: Kenos Migration Ledger
owner: kenpan
last_verified: 2026-07-19
doc_role: migration-status-ledger
status: phase-4b-cross-device-daily-loop-ready-distribution-gates-open
---

# Kenos Migration Ledger

> 这是重构迁移状态的唯一深度台账。当前所有条目均为目标规划，不代表 cutover 已发生。正式优先级仍以 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) 为准。

## 1. 状态定义

```text
PROPOSED
-> APPROVED
-> PREPARING
-> DUAL_READ
-> BACKFILLING
-> SINGLE_WRITER_NEW
-> OLD_READ_ONLY
-> REDIRECTED
-> OBSERVING
-> RETIRED
-> COMPAT_REMOVED
```

允许跳过不需要的中间态，但不允许跳过 `SINGLE_WRITER_NEW`、验证和退役证据。`DUAL_WRITE` 不是有效状态。

## 2. Program-level ledger

| Migration                               | 当前真源/入口                                               | 目标真源/入口                                                                                   | 状态                                                                                                                                                                       | 前置                                                                                                                       | 单一 writer 切换                                                                                               | 回滚                                                           | Retirement gate                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Life OS 品牌                            | 多处 Life OS/Kenos 混用                                     | 用户可见 Kenos，稳定内部 ID                                                                     | PROPOSED                                                                                                                                                                   | 命名表冻结                                                                                                                 | 不涉及数据 writer                                                                                              | 恢复文案/redirect                                              | 旧文案/域名无必要引用                                                                                                   |
| Portal 默认入口                         | `apps/portal`                                               | Assistant/Today                                                                                 | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY                                                                                                                                      | Today/Inbox/Approval/Activity 本地证据齐备；生产审批未开                                                                   | Portal 写入先冻结，再切入口                                                                                    | 默认入口回 Portal                                              | 两稳定周期 + 无旧写入                                                                                                   |
| Assistant chat                          | AIOS                                                        | Assistant Space                                                                                 | LOCAL_SIMULATION_AND_CONTRACT_READY                                                                                                                                        | 本地只读 + Work 仿真；MCP create 经 command boundary                                                                       | 领域数据仍归原 Owner                                                                                           | 旧 AIOS chat 保留于 `/assistant`                               | hosted Approval/RLS/shadow + 新 Assistant 真实使用通过                                                                  |
| AIOS → Assistant                        | AIOS Tauri/Web                                              | Assistant Space + Kenos Mac                                                                     | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY                                                                                                                                      | Action/Policy/Activity/Approval 本地只读证据                                                                               | 领域数据仍归原 Owner                                                                                           | 旧 AIOS chat 保留于 `/assistant`                               | hosted Approval/RLS/shadow + 新 Assistant 真实使用通过                                                                  |
| Work productivity loop                  | 分散 Plan/Library/Vault/digests；无 Work Space              | Work-owned Project/Deliverable/Meeting/Decision + WorkActionProposal→Plan                       | LOCAL_SIMULATION_AND_CONTRACT_READY                                                                                                                                        | temporary ownership + contracts + review-only SQL + AIOS `/work` + Today projections                                       | Work 不拥有 Task；conversion simulation only；Connector read-only                                              | 禁用 flag / 移除 `/work`；无需生产数据回滚                     | hosted RLS/apply、Executor、auto Connector write、真实项目 Real-use 另审                                                |
| Apple native daily loop                 | 无 Kenos iOS/macOS 产品；仅 KenosContracts + 领域 companion | 单一 Kenos iOS/iPadOS + macOS daily client（shared contracts/client/store/actions/design）      | PARTIAL_PASS_NATIVE_FOUNDATION_READY_WITH_DISTRIBUTION_GATES；Mac Web READY；iOS READY_LAN_DEPENDENT；Stabilization AUTOMATED PASS / Owner 3-day OPEN（2026-07-21） | Phase 1–3 contracts；inventory；mock auth；offline queue；simulator QA；17 Pro Daily Beta + stability harness 2026-07-21 | Apple 不拥有 Task/Approval/Work/Activity 真源；canonical writes 仍走 Action boundary；iOS origin LAN-DEPENDENT | 移除 Apps/新 packages；Contracts 可保留；Mac Web fallback 保留 | production signing/OAuth/push/universal links；watchOS 产品；Executor；App Store；Owner 3-day dogfood；LAN→stable origin |
| Planner → Plan                          | Planner UI/表/本地缓存                                      | `plan` 领域语义                                                                                 | PROPOSED                                                                                                                                                                   | owner inventory                                                                                                            | 先保持原表 writer，仅更改 API/名称                                                                             | 路由/文案回退                                                  | 旧名称兼容到 deep links 稳定                                                                                            |
| Apple cross-device daily loop           | Phase 4A iPhone/macOS foundation；无 Kenos Watch companion  | watchOS companion + notification contracts + handoff/Capture transfer + widget foundation       | CROSS_DEVICE_DAILY_LOOP_READY                                                                                                                                              | Phase 4A ready；KenosNotifications/Handoff；simulator Watch build                                                          | Watch 不拥有 canonical truth；Approvals read-only；mock APNs only                                              | 移除 Watch/Widget/新 packages                                  | production Team/App Group/APNs；Executor；Phase 5；App Store                                                            |
| Phase 5 Focus / contextual intelligence | 无 FocusContext；Nav IA 四入口已对齐                        | System-owned FocusContext + Interruption/Deferred/Suggestions + Training/Deep Work local slices | PARTIAL_PASS_CONTEXTUAL_INTELLIGENCE_READY_WITH_PRODUCTION_GATES                                                                                                           | TEMPORARY_APPROVED_FOR_PHASE_5_FOCUS_FOUNDATION；contracts + AIOS/Apple Focus UI；phase5 guard                             | Domain sessions EntityRef only；no production Executor/APNs；Watch Focus glance local                          | 移除 Focus stores/UI；contracts additive 可保留                | production notifications；Apple Focus entitlements；Executor；writer cutover                                            |
| Phase 6 production Wave 1               | Hosted 无 `kenos_*`；Task direct write 仍开                 | Additive hosted schema/RLS/read RPC package + approval packet                                   | STAGE_A_APPROVAL_PACKET_READY                                                                                                                                              | env/writer matrices；schema diff；Wave 1 review SQL index；Focus review SQL；backup template；dual-user plan；phase6 guard | **No hosted apply**；revoke/cutover/Portal/Apple dist 另批批准                                                 | 撤回 Stage A docs/SQL drafts；不触生产                         | `APPROVE_KENOS_PRODUCTION_WAVE_1`                                                                                       |
| Knowledge → Library                     | Vault + KnowledgeOS                                         | Library Space/API                                                                               | PROPOSED                                                                                                                                                                   | Library/Memory 边界                                                                                                        | Vault 仍唯一正文 writer                                                                                        | 旧壳继续                                                       | 新客户端能编辑/恢复/深链                                                                                                |
| Fitness → Training                      | Fitness app/schema                                          | Training Space/domain                                                                           | PROPOSED                                                                                                                                                                   | domain ID freeze                                                                                                           | 不先改存储                                                                                                     | 文案回退                                                       | 行为与历史数据 parity                                                                                                   |
| Finance → Money                         | Finance app/schema                                          | Money Space/domain                                                                              | PROPOSED                                                                                                                                                                   | domain ID freeze                                                                                                           | 不先改存储                                                                                                     | 文案回退                                                       | 报表/导入/购买历史 parity                                                                                               |
| HealthOS → Health                       | local JSON/HealthKit/Tauri                                  | Health domain + Kenos clients                                                                   | PROPOSED                                                                                                                                                                   | OPEN-001                                                                                                                   | HealthKit/本地数据 writer 冻结后切                                                                             | 旧 companion/Tauri                                             | 真机、离线、隐私与恢复通过                                                                                              |
| Apple unified client                    | 多壳                                                        | Kenos 3 targets                                                                                 | PROPOSED                                                                                                                                                                   | Phase 1 contracts                                                                                                          | 按 capability 切                                                                                               | 旧壳继续                                                       | 每个旧壳单独退役                                                                                                        |

## 3. Platform contract ledger

| Slice              | 旧机制                      | 新机制                                              | 状态                                    | 首批 producer          | 首批 consumer         | 兼容删除条件                                                             |
| ------------------ | --------------------------- | --------------------------------------------------- | --------------------------------------- | ---------------------- | --------------------- | ------------------------------------------------------------------------ |
| EntityRef v1       | wikilink/URL/私有 ID        | stable ref + owner/security/classification          | V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW | Plan                   | Work/Assistant        | 所有试点不再解析私有 URL                                                 |
| ActionRequest v1   | MCP/前端直接调用各自写入    | Policy → domain executor                            | V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW | Assistant              | Plan                  | 旧直接写工具无调用                                                       |
| Activity v1        | 分散 toast/log              | 用户可读 Activity + audit                           | V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW | Plan executor          | Assistant/System      | 关键动作 100% 有 Activity                                                |
| Approval v1        | 各 UI 自有确认              | Platform/System-owned payload-bound Approval record | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY   | Assistant read adapter | 未接入的未来 Executor | review-only SQL 通过 production review、读流量观察、R3/R4 旧确认流无调用 |
| Capture v1         | app/插件各自保存            | durable capture inbox + routing                     | V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW | Web Lens/iPhone        | Library/Plan          | 旧 capture 无写入                                                        |
| Mutation/Outbox v1 | `life_events` 现有 envelope | version/idempotency/correlation/dead-letter         | V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW | Plan                   | Activity/Assistant    | 老 envelope 消费者升级                                                   |
| Connector v1       | MCP 配置/错误分散           | lifecycle/scopes/domain/health                      | PROPOSED                                | MCP fleet              | System                | 旧 health 配置无读取                                                     |

## 4. Web platform convergence ledger

| Slice               | 当前                                    | 目标                                  | 状态     | Keep local                          | 删除条件                         |
| ------------------- | --------------------------------------- | ------------------------------------- | -------- | ----------------------------------- | -------------------------------- |
| Planner AppShell    | 自有外层 shell                          | `LifeOsAppShell`                      | PROPOSED | Planner nav/content/domain overlays | shell spec + PWA + real-use 通过 |
| Finance AppShell    | 自有外层 shell                          | `LifeOsAppShell` 或有证据 keep        | PROPOSED | Finance IA/业务布局                 | 先做 concern map，再决定         |
| Portal shell        | 自有 Portal                             | 不迁；随 Portal 退役                  | PROPOSED | 仅迁移期修复                        | Portal 删除                      |
| Appearance settings | Planner/Fitness/Finance/Home 有重复组合 | shared behavior/pattern               | PROPOSED | i18n/store adapter                  | 2+ 不同 app 采用且 API 稳定      |
| Music settings      | 部分共享                                | 通用项共享、视觉 theme/variant        | PROPOSED | 音乐领域设置和沉浸内容              | 无普通 toggle/segment fork       |
| System states       | app-local error/offline                 | Action/Capture/System shared patterns | PROPOSED | 领域错误解释                        | 三真实场景通过                   |

## 5. Portal retirement ledger

| Capability           | Portal 当前实现                                                     | 目标 Owner/UI                     | 状态                                         | 验收                                                                                                     |
| -------------------- | ------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Today summary        | Portal RPC/cards                                                    | Assistant Today read model        | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY        | 复用现有只读 `portal_today_summary`；保留 Owner/source/freshness/deep link                               |
| App launcher         | Portal cards/switcher                                               | Kenos Spaces/global nav           | LOCAL_BETA_IN_PROGRESS_NO_PRODUCTION_CUTOVER | Assistant 可达所有现役 Space；Portal 仅增加默认 Off 的实验入口                                           |
| Default app          | Portal setting                                                      | Kenos default intent/route        | PROPOSED                                     | 登录/深链/通知入口一致                                                                                   |
| Badges/events        | Portal cards                                                        | Today/Inbox                       | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY        | Inbox 只读 `life_events` pending 与 `planner_tasks` EntityRef projection；无写入                         |
| Approval queue       | review-only `kenos_action_approvals` + RPC artifact（未生产 apply） | Assistant Approvals               | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY        | canonical v1/corpus/Swift + disposable dual-user RLS/privilege + real RPC read adapter；无 Executor/写入 |
| Activity feed        | `life_events` 兼容 event 来源                                       | Assistant Activity                | LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY        | 只读、去重、截断、敏感字段 redaction；不宣称是 Phase 1 canonical Activity table                          |
| Settings             | Portal embedded settings                                            | System/Appearance                 | PROPOSED                                     | 用户偏好迁移、旧写入冻结                                                                                 |
| PWA install          | Portal flow                                                         | Kenos native/Web install strategy | PROPOSED                                     | 决定保留/取消                                                                                            |
| `portal.kenos.space` | live domain                                                         | Assistant Today redirect          | PROPOSED                                     | TLS、auth、deep link、analytics/traffic observation                                                      |

## 6. Native shell retirement ledger

| Legacy surface    | 能力                 | New surface               | 状态     | Writer cutover                    | Retirement evidence               |
| ----------------- | -------------------- | ------------------------- | -------- | --------------------------------- | --------------------------------- |
| AIOS Tauri        | Chat/Assistant       | Kenos Mac Assistant       | PROPOSED | conversations/actions 单独切      | 日用、local AI、恢复通过          |
| AIOS Tauri        | Runtime controls     | Kenos Mac System          | PROPOSED | Runtime API 冻结                  | jobs/status/pause/errors parity   |
| KnowledgeOS Tauri | Vault/Library        | Kenos Mac Library         | PROPOSED | Vault writer 只能一个             | edit/index/search/recovery parity |
| HealthOS Tauri    | Health/Focus         | Kenos Mac Health/System   | PROPOSED | local event writer 冻结           | 趋势、Focus、导出 parity          |
| Health companion  | HealthKit/Watch      | Kenos iOS/watchOS         | PROPOSED | HealthKit source identifiers 映射 | 真机连续交付 + offline sync       |
| Music Capacitor   | playback/now playing | Kenos iOS/Mac/Watch Music | PROPOSED | playback session 只一个 owner     | background/remote controls parity |

## 7. 每个 slice 必填记录

复制以下模板到本文件末尾或 app-owned migration doc，并从表中链接:

```markdown
## MIGRATION: <name>

- Status:
- Owner:
- Scope / non-scope:
- Current source of truth:
- Target source of truth:
- Current writers:
- Target single writer:
- Readers / consumers:
- Security domain / classification:
- Risk level:
- Compatibility read:
- Backfill query/script:
- Reconciliation query:
- Cutover trigger:
- Cutover date:
- Rollback deadline and steps:
- Old read-only date:
- Redirect date:
- Observation window:
- Retirement date:
- Compatibility removal date:
- Validation commands:
- Remote/deploy evidence:
- Real-use evidence:
- Remaining unknowns:
```

## 8. Ledger 更新规则

- 任何 schema、writer、入口或域名迁移开始前先更新此表。
- 状态变化必须附代码/测试/远程/真实使用证据之一；仅有 commit 不等于生产切换。
- 切到 `SINGLE_WRITER_NEW` 后，旧 writer 必须在同一工作包关闭或进入明确只读。
- 超过计划 expiry 的兼容层自动升级为 P0 debt。
- `RETIRED` 只有在旧代码、部署、权限、任务和文档都删除后使用。
- `COMPAT_REMOVED` 才是迁移真正完成。

## MIGRATION: KR-P1-001 Plan create task Action/Outbox vertical slice

- Status: `TEMPORARY_APPROVED_FOR_KR-P1-001` — temporary governance defaults approved by Ken on 2026-07-18 for this slice only; no production SQL/RLS/auth, deploy, writer cutover, push, or merge has been performed.
- Owner: Plan / Planner remains the only task data Owner.
- Scope / non-scope: Scope is one reversible `plan.create_task` Action path for direct Plan UI task creation and explicit user-requested Assistant `CreateTaskAction`; includes single `Plan Task Command Handler`, validation/risk policy, stable `idempotency_key`, `correlation_id`, durable local queue/offline retry, Task + durable Outbox atomicity, Activity semantics, compatibility adapters, rollback plan, and tests. Non-scope: Work-sourced payload, email-to-task, meeting-to-task, browser Connector capture, bulk import, proactive inferred task creation, automatic cross-domain task creation, production migration apply, writer cutover, deleting old production paths, Portal redirect, schedule/complete/reschedule, Apple clients, push/merge/deploy.
- Current source of truth: Planner local-first task state with optional Supabase sync; exact table/store names must be verified in the implementation slice before code changes.
- Target source of truth: Same Plan task truth; Action/Outbox is a write envelope, not a new task store.
- Current writers: Planner UI and any existing Planner provider/API paths; Paper provider functions stay Planner-side per AGENTS. MCP/tool writers are `UNKNOWN` until implementation inventory.
- Target single writer: `Plan Task Command Handler` validates and writes the canonical Task; Planner UI and explicit user-requested Assistant CreateTask Action must call this single writer directly or through compatibility adapter; Assistant is Action producer only and must not insert/update Task storage.
- Readers / consumers: Planner UI remains canonical reader; Assistant/Activity reads task `EntityRef` and result metadata only.
- Security domain / classification: Personal + `personal` by default. If request source is Work/Health/Money/Home sensitive data, source classification is preserved and Activity is redacted.
- Risk level: R1 for user-explicit single reversible local-domain Task creation; Assistant proactive inferred task creation is R2 and excluded from this slice; R3 external/bulk/sensitive-permission changes and R4 production/irreversible/core-data operations are fail-closed and excluded.
- Compatibility read: Existing Planner reads continue unchanged during the slice; Action result returns `EntityRef` and current task projection.
- Backfill query/script: None for Phase 1 first slice because no historical task migration is planned. If an Activity table is introduced later, backfill is not required for old tasks unless owner signs a separate ledger row.
- Reconciliation query: For a fixture/user, count accepted create-task idempotency keys equals number of new Plan tasks plus documented rejected/duplicate requests. Duplicate requests with same idempotency key must resolve to one task.
- Cutover trigger: After local fixture tests prove Policy → Executor → task write → outbox/activity is atomic and Planner existing tests still pass.
- Cutover date: `NOT_ALLOWED_IN_KR-P1-001`; writer cutover requires separate owner approval after acceptance evidence.
- Rollback deadline and steps: Before old direct non-UI writers are disabled. Rollback by routing new entry points back to existing Planner writer and leaving any created tasks as normal Plan tasks; no destructive down migration.
- Old read-only date: `NOT_ALLOWED_IN_KR-P1-001`; unsafe old paths may be recorded and adapted, not deleted or forcibly retired in this slice.
- Redirect date: N/A.
- Observation window: Minimum one stable release or owner-defined real-use window for create-task only.
- Retirement date: `OWNER_PENDING_AFTER_KR-P1-001_ACCEPTANCE`; old direct non-UI create-task writer retirement requires evidence that no callers bypass Action and a separate owner-approved slice.
- Compatibility removal date: `OWNER_PENDING_AFTER_KR-P1-001_ACCEPTANCE`; must be reviewed before KR-P1-002 starts.
- Validation commands: `node scripts/check-kenos-phase0.mjs`; `npm run verify:ticket-naming`; `npm run verify:kenos-refactor`; `npm run check:lifeos-boundaries`; `npm run check:app-manifests`; targeted Planner/Action/Outbox/offline/idempotency/Activity tests to be named in implementation slice.
- Remote/deploy evidence: None; remote/deploy explicitly prohibited for Phase 0 preparation.
- Real-use evidence: Not applicable until Phase 1 implementation; Phase 0 evidence is repository-only.
- Temporary approval metadata: approved owner Ken; approval date 2026-07-18; expiration/review condition is mandatory review after KR-P1-001 acceptance and before KR-P1-002 starts.
- Remaining unknowns: Exact Planner task store/table symbols, current MCP create-task path, existing outbox schema fields, Activity storage target, and RLS/idempotency enforcement location must be verified before runtime changes.

## MIGRATION: KR-P1-001A Durable server Action / Outbox hardening draft

- Status: `V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW` — non-production contracts, browser/server command handlers, review-only SQL/privilege artifacts, canonical corpus, Swift Codable package, parity guard, disposable DB proof, and writer cutover simulation are locally verified. Production DB apply, caller cutover, deploy, and old-path deletion were not performed.
- Owner: Plan / Planner remains the only Task lifecycle Owner. The new server command boundary is an execution envelope for `plan.create_task`, not a new task source of truth.
- Scope: `Assistant or remote CreateTaskAction -> server command boundary -> atomic Task + Outbox + Activity persistence draft -> durable idempotency -> Outbox delivery lifecycle -> retry/backoff/terminal failure classification` for non-production review.
- Implemented artifacts: `packages/contracts/fixtures/kenos/v1/manifest.json` and `corpus.json` are the only fixture truth for Entity/Action/Decision/Result/Approval/Activity/Mutation/Outbox/Capture/error envelopes. Zod, Planner browser/server, SQL injection runner, and `clients/apple/Packages/KenosContracts` consume it; `scripts/check-kenos-contract-parity.mjs` sends Swift-encoded output back through Zod. Review SQL targets the real `planner_tasks(user_id,id,data,updated_at)` shape; the separate privilege artifact and tests enforce client/worker boundaries.
- Acceptance covered: duplicate idempotency key returns the first Task; one Action UUID cannot be rebound to a different idempotency key; transaction failure rolls back Task/Outbox/Activity together in the test boundary; disposable SQL proves one canonical Task/Outbox/Activity result plus dual-user RLS/auth isolation and direct-write denial; schema-version/UUID/security/version/expiry failures are fail-closed; Outbox lifecycle covers pending/processing/published/retry/dead-letter; retry uses capped exponential backoff with jitter; permanent errors become dead-letter with a visible reason; Activity redacts sensitive fields.
- Deferred production gate: structured `planner_tasks(user_id,id,data,updated_at)` remains the canonical cloud Task table, with `planner_user_state` retained for settings/legacy backup. Contract v1 is frozen for review, but production apply remains blocked until owner/security/database/runtime reviewers approve the fixed-search-path definer model, function owners, worker identity, RLS/advisors, server caller integration, thresholds, and writer cutover. Cutover and old-writer retirement require separate approvals.
- Rollback: remove/disable the feature-flagged server command path and keep Planner UI on the existing KR-P1-001 local command adapter. Do not drop user tasks; any non-production rows created during local testing can be discarded with the disposable database.
- Cutover trigger: owner-approved production migration design, passing disposable-database dry-run against the actual Planner schema, RLS/privilege review, dual-user authorization tests, and explicit approval to route Assistant/remote create-task traffic to the server RPC.
- Validation commands: `npm test -w @life-os/contracts`; `node apps/planner/server/kenos/createTaskCommand.test.mjs`; `node scripts/check-kenos-phase1.mjs`; `npm run test -w planner-os -- --run src/lib/domain/planTaskCommand.test.js`; milestone repository gates before PR.

## MIGRATION: KR-P2-001 Assistant / Today read-only strangler

- Status: `LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY` (historical alias `READ_ONLY_INTEGRATION_READY`); all local read-only gates pass under `TEMPORARY_APPROVED_FOR_PHASE_2_APPROVAL_READ_MODEL`. This does not approve production apply, Executor or entry cutover.
- Owner: Assistant owns projection/orchestration UI only. Platform/System policy layer owns canonical Approval lifecycle; requesting domains own their Action/business object. Plan, Money, Training, Music, Home and System retain their existing data ownership.
- Scope / non-scope: read-only adapters, canonical Approval v1/corpus/parity, review-only persistence/RLS/privilege proof, source-state UX, redacted shadow diagnostics, legacy route compatibility, Portal default-Off experiment and local browser evidence. No real approve/reject, Executor, command mutation, production migration/RLS, writer cutover, Portal default change/redirect, deploy, data deletion or Phase 3.
- Current source of truth: `public.portal_today_summary` for Today compatibility summary; `public.life_events` pending plus `public.planner_tasks` references for Inbox; `public.life_events` for Activity compatibility; review-only `public.kenos_action_approvals` and `public.kenos_list_action_approvals` define the canonical Approval read source pending production review/apply.
- Target source of truth: domain-owned read projections consumed by Assistant. Assistant does not become a second domain store. Approval record is Platform/System-owned and binds one Action by ID/correlation without copying its payload.
- Current/target writers: unchanged. This slice adds no writer and read adapters statically reject direct mutation/command-handler references.
- Compatibility read: Portal remains the production entry. `/chat` redirects locally to `/assistant` preserving query/hash; unknown routes fail safely.
- Reconciliation: deterministic projection tests cover multi-source sorting/dedupe, empty/malformed/unknown/stale/error states, redaction and mismatch categories. Shadow records redacted fingerprints only.
- Cutover trigger/date: `NOT_ALLOWED`; owner-approved production security/caller review, hosted RLS/advisors, backup/change window, shadow thresholds and observation gates are required before any production entry review.
- Rollback deadline and steps: while the experiment remains default Off, remove the Portal experimental launcher/deep links and restore prior AIOS root chat. No data rollback.
- Observation/retirement/compatibility removal: `NOT_STARTED`; Portal retirement is explicitly prohibited.
- Validation commands: `npm run test -w aios-os`; `npm run check -w aios-os`; `npm run build -w aios-os`; `npm run test:kenos-routing -w portal`; `npm run check -w portal`; `npm run build -w portal`; `node scripts/check-kenos-phase2.mjs`; repository milestone gates.
- Remote/deploy evidence: none; intentionally local-only.
- Real-use evidence: local desktop/mobile browser QA covers canonical empty/permission states plus explicit no-write rehearsal for pending/expired/superseded/stale/partial/long-summary and offline/fallback behavior. Authenticated hosted parity remains a production-review prerequisite.
- Remaining unknowns: production function ownership/caller identity, hosted RLS/advisors, backup/change window, production shadow sample/threshold/owner, observation duration, real approve/reject command design, Executor revalidation and rollback authority.

## MIGRATION: KR-P3-001 Work productivity loop foundation

- Status: `LOCAL_SIMULATION_AND_CONTRACT_READY` (historical alias `WORK_LOOP_FOUNDATION_READY`) under `TEMPORARY_APPROVED_FOR_PHASE_3_WORK_FOUNDATION`. Local/disposable only; no production apply, Executor, Connector auto-write, or Plan Task owner change.
- Owner: Work owns Project/Deliverable/Meeting/Decision/context/status/source refs. Plan remains sole Task owner. Library remains Document owner. Assistant reads/submits Actions only. Connector emits CaptureEnvelope/source refs only.
- Scope: inventory, additive Work contracts/fixtures/Swift parity, review-only SQL/RLS, AIOS `/work` UI, WorkActionProposal→Plan simulation, Library EntityRef projections, Today Work section, Activity recording in local store, Connector registry proposal, shadow diagnostics, Phase 3 guard.
- Non-scope: production migration/RLS/auth apply, Executor, silent conversion, automatic Gmail/Figma/browser→canonical Work writes, Phase 4 Apple UI, Phase 5 proactive intelligence, Portal retirement, push/deploy.
- Compatibility: Plan `planner_projects` remain Plan-owned task groups and are not Work Projects. OPEN-002 still blocks Work body mirroring into personal cloud/models.
- Rollback: disable `VITE_KENOS_PHASE3_WORK` / demo query and remove `/work` entry; review SQL was never production-applied.
- Validation: `node packages/contracts/scripts/kenos.test.mjs`; Swift KenosContracts tests; `node --test apps/aios/src/lib/workCommand.core.test.js`; `node scripts/check-kenos-phase3-work-db.mjs`; `node scripts/check-kenos-phase3.mjs`; AIOS test/check/build; Phase 1/2 guards.

## MIGRATION: KR-P4A-001 Apple native daily loop foundation

- Status: `PARTIAL_PASS_NATIVE_FOUNDATION_READY_WITH_DISTRIBUTION_GATES` (historical alias `APPLE_NATIVE_DAILY_LOOP_READY`) under `TEMPORARY_APPROVED_FOR_PHASE_4A_NATIVE_DAILY_LOOP`. Local/simulator only.
- Owner boundary: Apple clients consume Phase 1–3 shared contracts; no Apple-owned Task/Approval/Work/Activity truth. Canonical writes remain Action/command-bound; Approvals read-only; FakeActionExecutor only.
- Scope: inventory; packages KenosContracts/Client/Store/Actions/Design; Keychain session abstraction + mock auth; projection cache; offline R1 queue; iOS/iPadOS + macOS shells; Today/Assistant/Inbox/Approvals/Activity/Work vertical slice/Quick Capture/deep links; Phase 4 guard; simulator/XCTest evidence.
- Non-scope: watchOS product; production Team/signing/OAuth/push/universal links; App Store/TestFlight/notarization; production Executor; Phase 5 proactive automation; production DB/migration/deploy/push.
- Compatibility: HomeScan, Health companion, Music Capacitor, Tauri shells retained as domain/experimental assets — not a second Kenos product.
- Rollback: remove `clients/apple/Apps` and new packages; retain KenosContracts for parity. No production data rollback.
- Validation: Swift package tests; `xcodegen` + `xcodebuild` iPhone/iPad/macOS build+test; `node scripts/check-kenos-phase4.mjs`; Phase 1–3 guards; `git diff --check` on Kenos paths.

## MIGRATION: KR-P4B-001 Apple cross-device daily loop foundation

- Status: `CROSS_DEVICE_DAILY_LOOP_READY` with distribution qualifier `PARTIAL_PASS_CROSS_DEVICE_FOUNDATION_READY_WITH_DISTRIBUTION_GATES` under `TEMPORARY_APPROVED_FOR_PHASE_4B_CROSS_DEVICE_DAILY_LOOP`. Local/simulator only.
- Owner boundary: Watch/iPhone share Phase 1–3 contracts; glances are display mappings only. Approvals remain read-only. Capture uses CaptureEnvelope + idempotent fake companion transport. Notifications use mock provider (no APNs).
- Scope: watch role doc; KenosNotifications + KenosHandoff; Today/Capture/Inbox/Approvals/Activity Watch surfaces; iPhone handoff/notification destinations; WidgetKit source + complication helpers; Phase 4B guard; SE 3 40mm simulator tests.
- Non-scope: production Team/App Group/APNs, WatchConnectivity production entitlements, Approval decisions, Executor, Phase 5, App Store/TestFlight, Widget host-embed signing cutover.
- Compatibility: Health companion watch remains separate. Widget may build without host embed while App Group/signing gates remain open.
- Rollback: remove Watch/Widget targets and new packages; retain Phase 4A. No production data rollback.
- Validation: Swift Notifications/Handoff tests; `xcodebuild` KenosWatch/KenosIOS/KenosMac tests; `node scripts/check-kenos-phase4b.mjs`; Phase 1–4 guards.

## Space Continuity (Web) — FUNCTIONALLY CLOSED

- Status: **FUNCTIONALLY CLOSED** (2026-07-20). Continuity **behavior is frozen**.
- Canonical E2E run: `continuity-e2e-2026-07-20T20-12-22-998Z` under `docs/qa/evidence/kenos-space-continuity-2026-07-20/e2e-flows/`.
- Preserve (do not rename / do not regress assertions without Owner):
  - E2E testids: `kenos-space-switcher`, `kenos-space-switcher-fab`, `kenos-space-switcher-trigger`, `kenos-space-switcher-sidebar`
  - Resume descriptor schema, owner binding, deep-link / `kenosResume` params
  - Planner / Fitness data paths used by Continue launch
- Non-scope for Continuity freeze: Owner Review sheet; P5 visual knives 3–5; production cutover.

## P5 Knife 2 — Continue overlay hierarchy — PASSED

- Status: **PASSED** (2026-07-20). Visual Quality overall remains **IN_PROGRESS**.
- Canonical chrome result: **Direction A**
  - Mobile `<600`: bottom sheet
  - Tablet `600–899`: form sheet
  - Desktop `≥900`: **anchored** panel to Continue trigger
- Superseded: early Knife 2 pass that used a **centered** desktop command panel (~460px). Evidence marked under `docs/qa/evidence/kenos-uiux-rescue/p5-knife2-sheet-hierarchy/SUPERSEDED-EARLY-PASS.md`.
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-knife2-sheet-hierarchy/` (`manifest-r2.json`).
- Owner Review: **NOT OPEN**. Next visual knife: domain identity (Knife 4).

## P5 Knife 3 — iPad adaptive material — DONE

- Status: **DONE** (2026-07-20). Visual Quality overall remains **IN_PROGRESS**.
- Adaptive rule: `≥900` uses `tablet-lg` form sheet unless `(pointer: fine)` **and** `(hover: hover)` → desktop anchored.
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-knife3-ipad-material/`.
- Continuity contracts unchanged; regression PASS.
- Owner Review: **NOT OPEN**.


### Personal Daily Beta — iOS close (2026-07-21)

- **IOS PERSONAL DAILY BETA: READY_LAN_DEPENDENT** on Ken’s 17 Pro.
- Assistant / Today / Spaces / Inbox: in-app WKWebView; Plan/Training Continuity: in-app WKWebView cover.
- Flow A/B + isolation PASS. **PHASE 4: EXIT_OPEN** (App Group / APNs / distribution / cross-device still open).
- Evidence: `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/`.

### iOS Daily Beta Stabilization — reliability closure (2026-07-21)

- **AUTOMATED STABILITY: PASSED** / **OWNER 3-DAY DOGFOOD: OPEN**
- Native build `202607211716` · HEAD `71ad6d5f3…` · evidence `docs/qa/evidence/kenos-ios-stability-2026-07-21/`
- Product fix: Planner LWW `coerceTimestamp` for ISO `updatedAt` (prevents Continuity sync clobber)
- Residual P1: LAN DHCP IP origin · true Mac sleep / Wi‑Fi = Owner
- **Not** `READY_LAN_DEPENDENT_STABILIZED` until Owner dogfood days close

## MIGRATION: KR-F5-02/03/04 Supabase closure · security red team · architecture convergence (2026-07-21)

- Status: `LOCAL_VERIFIED_READY_FOR_PRODUCTION_GATE`. Local-only; no production apply/deploy/push performed.
- **F5-02 Supabase**: canonical CORE-LOOP schema reproducible from migrations into an empty DB — `scripts/kenos-cleanroom/replay.sh` (32 migrations, 0 failures) + RLS/authz T1–T14 + RPC integrity R1–R6 all PASS. Report `docs/qa/kenos-f5-02-supabase-closure.md`. Fixed invalid `create policy if not exists` in fitness_core (drift proof). Drift found: `kenos_crash_events` applied-untracked; `20260721180000_kenos_app_logs_analyze_alert` committed-but-unapplied → cutover GATE A/B (owner-run). Full 6-app union NOT from-empty replayable (finance-centric baseline overlap/omission) → owner-gated `supabase migration squash` remediation.
- **F5-03 Security**: `PASS_NO_KNOWN_P0_P1`. Fixed P1-A iOS WebView session-token theft (substring host match → exact-suffix; `allowSharedAuth` anchors real origin) and P1-B AI `fetch_url` exfiltration (egress guard). Report `docs/qa/kenos-f5-03-security-redteam.md`. Regression suites: `scripts/kenos-cleanroom/*`, `toolEgressGuard.core.test.js`, `chat-tool-loop.core.test.js`, `trustedDeviceAuth.test.mjs`, `KenosDailyBetaConfigTests` spoof test.
- **F5-04 Architecture**: single canonical writer per core-loop entity confirmed; internal tables (activity/outbox/idempotency/capture) are RPC-only (no client grant — proven by clean-room `permission denied`). Static guard `scripts/check-kenos-architecture.mjs` wired into `verify-kenos-refactor.sh`. Report `docs/qa/kenos-f5-04-architecture-convergence.md`.
- **Convergence debt (tracked, not permanent dual-write)**: AIOS `plannerAddTask` (`apps/aios/src/lib/lifeos.js`) writes `life_events core.task_captured` — a legacy assistant task-capture path competing with the canonical `kenos_create_plan_task_action` (which the MCP `add_task` path already uses). Flag-gated off in prod (fail-closed unless `VITE_KENOS_PROD_WRITES=1`). Owner: converge `plannerAddTask` onto the canonical create RPC; expiry before next assistant-write slice. Pinned in the architecture guard allowlist so no NEW life_events core.* writer can appear.
- Owner gates: production apply (GATE A/B), migration squash, iOS App-Bound-Domains + Continuity navigation allowlist, `DEVICE_AUTH_HMAC_SECRET`/`APPLE_APP_ATTEST_ALLOW_DEV=0` prod env, `plannerAddTask` convergence.
- Validation: `scripts/kenos-cleanroom/replay.sh`; `npm test -w aios-os`; `node apps/planner/server/trustedDeviceAuth.test.mjs`; `xcodebuild … KenosMac`; `bash scripts/verify-kenos-refactor.sh` (all green 2026-07-21).
