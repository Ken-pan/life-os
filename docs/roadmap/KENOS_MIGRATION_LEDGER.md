---
title: Kenos Migration Ledger
owner: kenpan
last_verified: 2026-07-18
doc_role: migration-status-ledger
status: initialized-no-active-cutovers
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

| Migration | 当前真源/入口 | 目标真源/入口 | 状态 | 前置 | 单一 writer 切换 | 回滚 | Retirement gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Life OS 品牌 | 多处 Life OS/Kenos 混用 | 用户可见 Kenos，稳定内部 ID | PROPOSED | 命名表冻结 | 不涉及数据 writer | 恢复文案/redirect | 旧文案/域名无必要引用 |
| Portal 默认入口 | `apps/portal` | Assistant/Today | PROPOSED | Today/Inbox/Approval/Activity | Portal 写入先冻结，再切入口 | 默认入口回 Portal | 两稳定周期 + 无旧写入 |
| Planner → Plan | Planner UI/表/本地缓存 | `plan` 领域语义 | PROPOSED | owner inventory | 先保持原表 writer，仅更改 API/名称 | 路由/文案回退 | 旧名称兼容到 deep links 稳定 |
| AIOS → Assistant | AIOS Tauri/Web | Assistant Space + Kenos Mac | PROPOSED | Action/Policy/Activity | 领域数据仍归原 Owner | 旧 AIOS 继续运行 | 新 Assistant 真实使用通过 |
| Knowledge → Library | Vault + KnowledgeOS | Library Space/API | PROPOSED | Library/Memory 边界 | Vault 仍唯一正文 writer | 旧壳继续 | 新客户端能编辑/恢复/深链 |
| Fitness → Training | Fitness app/schema | Training Space/domain | PROPOSED | domain ID freeze | 不先改存储 | 文案回退 | 行为与历史数据 parity |
| Finance → Money | Finance app/schema | Money Space/domain | PROPOSED | domain ID freeze | 不先改存储 | 文案回退 | 报表/导入/购买历史 parity |
| HealthOS → Health | local JSON/HealthKit/Tauri | Health domain + Kenos clients | PROPOSED | OPEN-001 | HealthKit/本地数据 writer 冻结后切 | 旧 companion/Tauri | 真机、离线、隐私与恢复通过 |
| Apple unified client | 多壳 | Kenos 3 targets | PROPOSED | Phase 1 contracts | 按 capability 切 | 旧壳继续 | 每个旧壳单独退役 |

## 3. Platform contract ledger

| Slice | 旧机制 | 新机制 | 状态 | 首批 producer | 首批 consumer | 兼容删除条件 |
| --- | --- | --- | --- | --- | --- | --- |
| EntityRef v1 | wikilink/URL/私有 ID | stable ref + owner/security/classification | PROPOSED | Plan | Work/Assistant | 所有试点不再解析私有 URL |
| ActionRequest v1 | MCP/前端直接调用各自写入 | Policy → domain executor | PROPOSED | Assistant | Plan | 旧直接写工具无调用 |
| Activity v1 | 分散 toast/log | 用户可读 Activity + audit | PROPOSED | Plan executor | Assistant/System | 关键动作 100% 有 Activity |
| Approval v1 | 各 UI 自有确认 | payload-bound approval | PROPOSED | Assistant | Executor | R3/R4 旧确认流无调用 |
| Capture v1 | app/插件各自保存 | durable capture inbox + routing | PROPOSED | Web Lens/iPhone | Library/Plan | 旧 capture 无写入 |
| Mutation/Outbox v1 | `life_events` 现有 envelope | version/idempotency/correlation/dead-letter | PROPOSED | Plan | Activity/Assistant | 老 envelope 消费者升级 |
| Connector v1 | MCP 配置/错误分散 | lifecycle/scopes/domain/health | PROPOSED | MCP fleet | System | 旧 health 配置无读取 |

## 4. Web platform convergence ledger

| Slice | 当前 | 目标 | 状态 | Keep local | 删除条件 |
| --- | --- | --- | --- | --- | --- |
| Planner AppShell | 自有外层 shell | `LifeOsAppShell` | PROPOSED | Planner nav/content/domain overlays | shell spec + PWA + real-use 通过 |
| Finance AppShell | 自有外层 shell | `LifeOsAppShell` 或有证据 keep | PROPOSED | Finance IA/业务布局 | 先做 concern map，再决定 |
| Portal shell | 自有 Portal | 不迁；随 Portal 退役 | PROPOSED | 仅迁移期修复 | Portal 删除 |
| Appearance settings | Planner/Fitness/Finance/Home 有重复组合 | shared behavior/pattern | PROPOSED | i18n/store adapter | 2+ 不同 app 采用且 API 稳定 |
| Music settings | 部分共享 | 通用项共享、视觉 theme/variant | PROPOSED | 音乐领域设置和沉浸内容 | 无普通 toggle/segment fork |
| System states | app-local error/offline | Action/Capture/System shared patterns | PROPOSED | 领域错误解释 | 三真实场景通过 |

## 5. Portal retirement ledger

| Capability | Portal 当前实现 | 目标 Owner/UI | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| Today summary | Portal RPC/cards | Assistant Today read model | PROPOSED | 计数口径 parity + 可直接行动 |
| App launcher | Portal cards/switcher | Kenos Spaces/global nav | PROPOSED | 所有现役 Space 可达 |
| Default app | Portal setting | Kenos default intent/route | PROPOSED | 登录/深链/通知入口一致 |
| Badges/events | Portal cards | Today/Inbox | PROPOSED | 无丢失/重复，支持处理 |
| Settings | Portal embedded settings | System/Appearance | PROPOSED | 用户偏好迁移、旧写入冻结 |
| PWA install | Portal flow | Kenos native/Web install strategy | PROPOSED | 决定保留/取消 |
| `portal.kenos.space` | live domain | Assistant Today redirect | PROPOSED | TLS、auth、deep link、analytics/traffic observation |

## 6. Native shell retirement ledger

| Legacy surface | 能力 | New surface | 状态 | Writer cutover | Retirement evidence |
| --- | --- | --- | --- | --- | --- |
| AIOS Tauri | Chat/Assistant | Kenos Mac Assistant | PROPOSED | conversations/actions 单独切 | 日用、local AI、恢复通过 |
| AIOS Tauri | Runtime controls | Kenos Mac System | PROPOSED | Runtime API 冻结 | jobs/status/pause/errors parity |
| KnowledgeOS Tauri | Vault/Library | Kenos Mac Library | PROPOSED | Vault writer 只能一个 | edit/index/search/recovery parity |
| HealthOS Tauri | Health/Focus | Kenos Mac Health/System | PROPOSED | local event writer 冻结 | 趋势、Focus、导出 parity |
| Health companion | HealthKit/Watch | Kenos iOS/watchOS | PROPOSED | HealthKit source identifiers 映射 | 真机连续交付 + offline sync |
| Music Capacitor | playback/now playing | Kenos iOS/Mac/Watch Music | PROPOSED | playback session 只一个 owner | background/remote controls parity |

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
