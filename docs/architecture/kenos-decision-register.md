---
title: Kenos 重构决策登记表
owner: kenpan
last_verified: 2026-07-19
doc_role: architecture-decision-register
status: active-for-phase-2-local-beta
---

# Kenos 重构决策登记表

本表不代替详细 ADR，用于防止 review 中的“定案”被误解为“仓库已实现”。

## 状态

- `TARGET_APPROVED`: 目标方向已由最新 review 确认，实现/cutover 仍需 gate。
- `FREEZE_REQUIRED`: 实施前还需 owner 补充边界或取值。
- `CURRENT_INVARIANT`: 当前仓库已强制的规则。
- `IMPLEMENTED`: 已有代码、测试和必要远程证据。
- `RETIRED`: 不再适用且已删除兼容层。
- `TEMPORARY_APPROVED_FOR_KR-P1-001`: 仅限 `KR-P1-001 Plan create task Action/Outbox vertical slice` 的临时批准；KR-P1-001 验收完成后、KR-P1-002 开始前必须复审，不是 Kenos 永久架构决定。
- `V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW`: 跨 TypeScript/SQL/Swift 的 major v1 语义已冻结；只允许 additive optional 演进，不表示生产 apply/cutover 获批。
- `LOCAL_BETA_IN_PROGRESS_NO_PRODUCTION_CUTOVER`: owner 已批准本地产品迁移开发；不得据此 apply 生产 migration、切 writer/default domain、deploy、redirect 或删除旧路径。
- `TEMPORARY_APPROVED_FOR_PHASE_2_APPROVAL_READ_MODEL`: 仅批准 Phase 2 canonical Approval 只读模型的兼容契约、review-only persistence/RLS artifact 与本地验证；真实 Executor integration 前必须复审。

## P0 决策

| ID | 决策 | 状态 | 实施前最后一步 | 证据/约束 |
| --- | --- | --- | --- | --- |
| KENOS-001 | 产品品牌为 Kenos，内部领域 ID 与用户文案分离 | TARGET_APPROVED | 冻结 ID 表和旧路由保留期 | 不做超级 rename |
| KENOS-002 | Assistant / Today 成为唯一默认协调入口 | PARTIAL_PASS_WITH_EXPLICIT_READ_MODEL_BLOCKERS | 已部署 canonical Approval read model，再完成真实使用、读模型 parity 与生产入口评审 | Today/Inbox/Activity 已有真实只读 adapter；Approval 明示 unsupported；Portal 仍是生产入口 |
| KENOS-003 | Portal 是待退役迁移源，不是长期 Space | PARTIAL_PASS_WITH_EXPLICIT_READ_MODEL_BLOCKERS | Today/Inbox/Approval/Activity 全部真实读模型与观察 gate | Portal 只增加默认 Off 的 Assistant launcher/deep links；未 freeze、redirect 或删除 |
| KENOS-004 | 模块化单体 + 清晰领域边界 + 一个 Supabase 项目 | TARGET_APPROVED | 冻结 schema/package 边界和依赖方向 | 不过早拆微服务/多 DB |
| KENOS-005 | 每类数据一个写入 Owner，其他域只引用/投影 | TARGET_APPROVED | 对存量表和本地真源做 ownership inventory | 不允许长期双写 |
| KENOS-006 | 安全域为 Personal / Work / Household / System | TARGET_APPROVED | 冻结跨域默认值、Work 保留和 cloud AI 政策 | 缺失分类按更严格处理 |
| KENOS-007 | 数据分类为 public/personal/sensitive/work_confidential/restricted_local_only/ephemeral | TARGET_APPROVED | 定义 storage/model/search/retention 策略 | 先加元数据和强默认 |
| KENOS-008 | Assistant 只提交 Action Request，不可越过 Policy/Approval/Executor | TARGET_APPROVED | 冻结 R0-R4 和不可永久授权列表 | 高风险动作 100% 审计 |
| KENOS-009 | 核心互通为 Entity/Action/Capture/Activity/Approval/Outbox/Connector 契约 | TARGET_APPROVED | RFC 评审和两个真实消费者试点 | 现有 `contracts/events` 增量演进 |
| KENOS-010 | 采用 Strangler Fig，兼容层必须有删除日期 | TARGET_APPROVED | 每个 slice 先进入 Migration Ledger | 不做一次性重写 |
| KENOS-011 | Minimum Sustainable Core 高于高级自动化 | TARGET_APPROVED | 冻结 Core SLO 和降级演练 | Capture/Find/Plan/Work/Library/Sync/Permissions/Activity/Backup/Basic Assistant |
| KENOS-012 | Git 以 `master` 为唯一分支，无 worktree/stash/checkpoint branch | CURRENT_INVARIANT | 无 | 根 `AGENTS.md` 覆盖 review 早期分支建议 |
| KENOS-013 | Entity/Action/Decision/Result/Approval/Activity/Mutation/Outbox/Capture/error envelope 使用 string major v1，未知 additive 字段忽略，未知 major/枚举/必需语义 fail closed | V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW | 生产 privilege/migration/writer 人工评审 | canonical manifest/corpus + TypeScript/server/browser/SQL/Swift tests；breaking change 必须新 major + migration + compatibility decision |

## Apple 客户端决策

| ID | 决策 | 状态 | 实施前最后一步 |
| --- | --- | --- | --- |
| APPLE-001 | 用户只看到 Kenos，领域是 Spaces，不是多个需安装的 App | TARGET_APPROVED | 为现有 Tauri/Capacitor/companion 列出渐进退役图 |
| APPLE-002 | 一个 Apple workspace，三个 product target，共享 Swift packages | TARGET_APPROVED | 决定 monorepo 目标路径和工程生成策略 |
| APPLE-003 | iPhone/iPad=随身感知与执行；Mac=深度工作与本地 AI；Watch=即时状态与微操作 | TARGET_APPROVED | 冻结首批导航与非目标 |
| APPLE-004 | Web 保留深度管理与快速演进，WebView 只是过渡 | TARGET_APPROVED | 对每个 Space 做 native-value 矩阵 |
| APPLE-005 | App Intents 是 Apple 系统入口的 adapter，核心 Action Contract 不以 Swift 为唯一真源 | TARGET_APPROVED | 先实现 CreateTask/CompleteTask/CaptureContent 三个端到端契约 |
| APPLE-006 | 三端各有本地缓存与 Outbox，不新建领域真源 | TARGET_APPROVED | 冻结 SQLite、冲突策略和密钥保存方式 |


## KR-P1-001 临时批准决策

Approved owner: Ken  
Approval date: 2026-07-18  
Scope: `KR-P1-001 Plan create task Action/Outbox vertical slice` only.  
Expiration/review condition: KR-P1-001 验收完成后、KR-P1-002 开始前必须复审；不得扩展为 Kenos 永久架构决定。

| ID | Decision | Status | Scope / non-scope | Expiration / review |
| --- | --- | --- | --- | --- |
| KR-P1-001-TEMP-001 | Plan domain 是 canonical Task entity 和 Task lifecycle 的唯一 Owner；其他 domain 可提交 Action、引用 Task ID、消费 projection，但不得直接创建/修改 canonical Task 或维护第二份 canonical Task 真源 | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 create-task vertical slice；不批准 schedule/complete/workflow owner 迁移 | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-002 | 所有任务创建经过唯一 `Plan Task Command Handler`；Planner UI、Assistant、Work、Connector 或其他入口不得直接写 canonical Task storage；现有入口可通过 adapter 调用 single writer；无法安全退休的旧路径暂时保留并记录 | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 create-task；不执行 writer cutover 或删除旧生产路径 | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-003 | Assistant 是 Action producer，不是 Task domain writer；只能根据用户明确指令创建并提交 `CreateTaskAction`；不得绕过 validation、policy、approval、command handler 或直接 insert/update Task storage | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 explicit user-requested Assistant CreateTask Action；排除 proactive inference | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-004 | Task mutation 与 durable Outbox record 必须在同一事务或等价原子提交边界内完成；只允许同时成功或同时回滚；禁止孤立 Task 或孤立 Outbox event；可生成和测试 migration artifact，但不得 apply 生产 migration | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 local/test migration artifact 与 non-production verification | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-005 | 优先保留当前稳定 Task ID 格式；每个 CreateTask Action 必须包含稳定 `idempotency_key` 和 `correlation_id`；通过数据库唯一约束或等价 durable constraint 保证幂等；相同 key 重试返回第一次创建的同一 Task；不得用标题或模糊内容匹配做幂等 | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 create-task idempotency | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-006 | Offline retry 使用 durable local queue、at-least-once delivery、幂等 server/handler、网络恢复自动重试、exponential backoff with jitter、用户可见 pending/failed/retry；禁止静默丢弃；永久 validation/permission error 不得无限重试 | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 create-task retry queue | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-007 | Risk defaults: R0 read-only no approval；R1 用户明确请求的单个可逆本地域写入可自动执行、必须 Activity 且支持 Undo/等价回滚；R2 Assistant 推断或跨域可逆写入需预览确认，除非已有有效授权；R3 显式批准；R4 fail closed，不得无人值守执行。KR-P1-001 中 explicit single Task create 为 R1；Assistant proactive inferred create 为 R2 且排除；批量、生产、外部 Connector 自动创建排除 | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 direct Plan UI task creation 与 explicit user-requested Assistant CreateTask Action | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-008 | Activity 记录 Action ID、correlation ID、actor type、source、action type、policy result、approval state、execution result、resulting Task ID、timestamps、error category、undo/rollback state；不得默认复制 secret/token/auth data/完整 Connector payload/不必要完整对话/Task canonical content 第二长期副本；可保存 redacted summary 和 entity reference | TEMPORARY_APPROVED_FOR_KR-P1-001 | 仅限 create-task Activity semantics | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |
| KR-P1-001-TEMP-009 | Work-sourced create-task 完全排除在 KR-P1-001 外；OPEN-002 保持 PENDING；本 slice 仅覆盖 direct Plan UI task creation 与 explicit user-requested Assistant CreateTask Action | TEMPORARY_APPROVED_FOR_KR-P1-001 | 明确排除 Work payload、email-to-task、meeting-to-task、browser Connector capture、bulk import、proactive inferred task、automatic cross-domain task creation | KR-P1-001 验收完成后、KR-P1-002 开始前复审 |

## Phase 2 Approval read-model 临时批准

Approved owner: Ken  
Approval date: 2026-07-19  
Scope: canonical Approval read contract、review-only persistence/RLS/privilege proof、Assistant read projection 和 shadow diagnostics only.  
Expiration/review condition: 真实 approve/reject、Executor integration 或生产 privilege/migration 前必须复审。

| ID | Decision | Status | Scope / non-scope | Expiration / review |
| --- | --- | --- | --- | --- |
| KR-P2-APPROVAL-TEMP-001 | Canonical Approval lifecycle 由 Kenos Platform / System policy layer 拥有；Assistant 仅读；请求 domain 继续拥有 Action 与业务对象；Activity/Outbox 可引用但不是 Approval 真源 | TEMPORARY_APPROVED_FOR_PHASE_2_APPROVAL_READ_MODEL | 只允许 additive v1 record、canonical corpus、review-only SQL、disposable DB、只读 adapter/UI；禁止真实 decision、Executor、生产 apply/cutover/deploy | 真实 Executor integration 前复审 |

## 仍需冻结的业务决策

| ID | 问题 | 默认建议 | 不决定的影响 |
| --- | --- | --- | --- |
| OPEN-001 | HealthOS 用户名称最终是 Health 还是 Status？Focus 归哪里？ | 领域 ID `health`；Status 为 Assistant/Today 读模型，Focus 为平台能力 | 命名和数据 Owner 可漂移 |
| OPEN-002 | Work 保密内容能否进入个人 Supabase/本地模型？ | 默认不进个人云；本地处理也以公司政策为准 | 不得开 Work connector 镜像或 embedding |
| OPEN-003 | Household 是否当期实现多用户？ | 首期只定义域与 Owner，不做多账户界面 | 避免过早扩张 RLS |
| OPEN-004 | Goal/Value 层是独立 Core 还是 Plan 子域？ | 作为 Core Goals，不直接修改领域数据 | Coordination 缺稳定决策依据 |
| OPEN-005 | Mac Runtime 是 XPC、localhost service 还是延续 Tauri sidecar？ | 先做威胁模型和能力 spike，不在 UI 开发中顺便定 | 连接安全与后台生命周期不可验收 |
| OPEN-006 | Apple 客户端 workspace 最终目录/工程生成策略？ | `clients/apple`；Phase 1 已在此放置无 UI 的 `KenosContracts` Swift Package | Xcode workspace 与 Phase 4 targets 仍未批准；不阻塞契约 package |
| OPEN-007 | 每日主动中断预算是否冻结为 3？ | 3 为初始默认，用真实数据调整 | Notifications 先保持 Digest/Contextual |
| OPEN-008 | Portal 域名和旧 deep link 保留多久？ | 至少两个稳定发布周期 + 30 天无旧写入 | 无法冻结 retirement 日期 |

## 决策记录模板

```markdown
## KENOS-XXX 标题

- Status: PROPOSED | TARGET_APPROVED | IMPLEMENTED | RETIRED
- Owner:
- Date:
- Context:
- Decision:
- Alternatives considered:
- Consequences:
- Data owner / security domain / classification:
- Offline and failure behavior:
- Migration and rollback:
- Validation evidence:
- Review or expiry date:
```
