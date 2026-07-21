---
title: Kenos 重构实施状态审计
owner: kenpan
last_verified: 2026-07-21T04:20:00Z
doc_role: implementation-status-audit
status: controlled-production-canary-legacy-cutover-open
formal_baseline: 502d805c28b29d3d50c0efa2699ab717a301ac45
review_cadence: after-each-production-or-retirement-slice
---

# Kenos 重构实施状态审计

> 本文回答“现在到底实现到哪里”。目标架构仍以 [`kenos-target-architecture.md`](./kenos-target-architecture.md) 为准，阶段出口仍以 [`../qa/kenos-refactor-gates.md`](../qa/kenos-refactor-gates.md) 为准，生产实时事实仍以 [`../qa/kenos-current-production-baseline-live-revalidated.md`](../qa/kenos-current-production-baseline-live-revalidated.md) 为准。
>
> 本次审计以与 `origin/master` 同步的 `502d805c28b29d3d50c0efa2699ab717a301ac45` 为正式代码基线，并单独记录本地未提交工作。**已写代码、已部署 canary、通过阶段出口、完成旧系统退役是四件不同的事。**

## 1. 结论

Kenos 已经越过“规划 / 本地只读原型”阶段，进入了**受控生产 canary + 多端基础完成、正式 cutover 尚未收口**的阶段：

- 核心 TypeScript / SQL / Swift 契约、Plan command RPC、Activity / Approval / Outbox、Focus、Work、Capture、Assistant proposal 已进入 `origin/master`。
- 生产 migration 已到 `20260721144405`（含 `kenos_app_logs` / `kenos_ingest_app_logs`；此前 tip `20260720230000`）；Owner cohort 的 Plan 多条写路径、Capture convert、AIOS Approval/Capture 和 Portal `/today` soft redirect 已有生产验证证据。
- AIOS 已有 Today / Assistant / Spaces / Inbox / Approvals / Activity / Focus / Work 等 Kenos 信息架构；Apple iOS/macOS/watchOS 工程、共享包、模拟器构建与 iPhone 安装/打开已有证据。
- UIUX 六轮优化在正式基线上达到本地 `91/100`，但该轮明确没有生产部署。
- 仍未完成全量 writer cutover、legacy writer revoke、outbox delivery worker、ProductionExecutor、离线队列启用、Portal 退役、完整 Domain Spaces、Apple App Group/APNs/分发和 Phase 5 生产主动智能。

因此当前正确状态不是 `Phase 2 ready`、`Phase 5 complete` 或 `Kenos shipped`，而是：

```text
CONTROLLED_PRODUCTION_CANARY
+ COMMITTED_MULTI_CLIENT_FOUNDATION
+ LEGACY_FALLBACK_RETAINED
+ EXECUTOR_AND_DISTRIBUTION_GATES_OPEN

MAC WEB DAILY BETA: READY
IOS PERSONAL DAILY BETA: READY (LAN-DEPENDENT)  # strict close 2026-07-21T05:45Z — Flow A user-JWT + Flow B no-URL-pin + isolation PASS; Assistant=IN-APP WEB; Continuity=in-app WKWebView; build 202607210524
OVERALL PERSONAL DAILY BETA: READY_LAN_DEPENDENT
NETWORK SCOPE (iOS): LAN-DEPENDENT
```

iOS 真机证据：`docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/`（含 `logs/ios-flow-ab-latest.json`）。
Phase 4 仍 `EXIT_OPEN`（App Group / APNs / 分发）；`KenosAppGroupStore` 仅 LOCAL_FOUNDATION；Daily Beta Owner title writer 已 bake；无硬 Owner Action — 见 `OWNER_ACTION_NEXT.md` / `PHASE4_NEXT_SLICE.md`。

## 2. 状态词汇

| 状态                   | 含义                                                | 可以对外宣称什么                 |
| ---------------------- | --------------------------------------------------- | -------------------------------- |
| `FORMAL_COMMITTED`     | 已进入 `origin/master`                              | 正式基线存在实现与测试           |
| `PROD_VERIFIED_CANARY` | 有生产 deploy / migration / owner smoke 证据        | 限定 cohort、flag 和路径已验证   |
| `LOCAL_VERIFIED`       | 本地测试、preview、Simulator 或 fixture 通过        | 只代表本地能力，不代表生产       |
| `LOCAL_WIP`            | 工作树中存在但未提交                                | 不能当正式实现、不能写入 Shipped |
| `EXIT_OPEN`            | 阶段已有实现，但阶段出口条件未全部满足              | 继续迁移，不得宣布阶段完成       |
| `RETIRED`              | 旧 writer/app/route/build/deploy 已删除并有观察证据 | 才能宣称 cutover 完成            |

## 3. 正式基线与生产事实

### 3.1 Git 基线

| 项目                        | 结果                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `master` vs `origin/master` | `0 / 0`，审计时同步                                                                                  |
| 正式 SHA                    | `502d805c28b29d3d50c0efa2699ab717a301ac45`                                                           |
| 最近实现范围                | Contracts、Plan writers、AIOS、Portal strangler、Apple clients、Focus/Work/Capture、UIUX compounding |
| 工作树                      | 有大量并行未提交 WIP；不属于正式基线，见第 9 节                                                      |

### 3.2 已记录的生产基线

以下数值来自 2026-07-20 `LIVE_REVALIDATED` 报告；再次部署或迁移后必须回到生产报告更新，不能只改本文。

| 项目                                   | 已验证值                                                              | 当前含义                                                                           |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Migration tip                          | `20260721144405`                                                      | Wave 1 + Plan/…/Assistant proposal + native `kenos_app_logs` ingest 已在生产历史中 |
| Planner production bake                | code SHA `9bc298c28a546f9e09dfbc27bfaeef457c3b5fd0`                   | Owner cohort 的 Plan 写路径已上线，但不是全量 cutover                              |
| AIOS published deploy                  | `6a5e3298a269f920f5314a01`                                            | AIOS read/Capture/Approval canary 基线                                             |
| Portal published deploy                | `6a5e347265864128941f0777`                                            | 仅 Owner-limited `/today` soft redirect                                            |
| Plan writer routing                    | create/title/due/schedule/project/complete/reopen/archive → Kenos RPC | 非 cohort、未覆盖字段与 sync upsert 仍保留 legacy                                  |
| Outbox / Activity / Approval / Capture | `44 / 49 / 0 / 2`                                                     | 数据面存在；数量是时间点快照                                                       |
| Outbox delivered/published             | `0`                                                                   | 不能宣称事件投递闭环完成                                                           |
| ProductionExecutor                     | Off                                                                   | 不能宣称主动执行已生产化                                                           |
| Offline queue                          | Off                                                                   | 只有 foundation / contract，未正式启用                                             |
| Seven sites `stop_builds`              | `true`                                                                | 生产变更仍受控，不代表站点退役                                                     |

## 4. 按阶段的真实实施状态

| 阶段                            | 已落地                                                                                                                                                                                          | 当前状态                                                                                    | 仍缺少的出口证据                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 治理与边界              | Constitution、ownership/policy inventory、decision register、migration ledger、Phase guards                                                                                                     | `FORMAL_COMMITTED / EXIT_OPEN`                                                              | 部分 owner 决策、ledger retirement 日期；Phase 0 worktree allowlist 需在干净 checkout/CI 运行                                 |
| Phase 1 契约与 Plan 垂直切片    | Zod/SQL/Swift corpus；Plan create/update/complete/reopen/archive RPC；RLS/idempotency/outbox foundation；Planner writer hosts                                                                   | `PROD_VERIFIED_CANARY / EXIT_OPEN`                                                          | 全 cohort/全字段 cutover、legacy revoke、offline flush ON、持续对账、dead-letter/recovery 演练                                |
| Phase 2 Assistant/Today/Portal  | AIOS Today/Assistant/Inbox/Approvals/Activity；read canary；Approval/Capture owner-limited；Portal `/today` soft redirect                                                                       | `PROD_VERIFIED_CANARY / EXIT_OPEN`                                                          | 两个真实使用周期、Portal writes/build/registry/compat 全退役、默认入口全量切换、流量观察                                      |
| Phase 3 Work 闭环               | Work contracts、project create/archive RPC、Assistant proposal、Work/Spaces routes、Capture ingest/convert                                                                                      | `FORMAL_COMMITTED + LIMITED_PROD_FOUNDATION / EXIT_OPEN`                                    | 一个真实 Work 项目 + Connector 的完整 capture→Library/Plan→review 闭环与复利数据                                              |
| Phase 4 Apple clients           | iOS/macOS/watchOS targets、共享 Contracts/Client/Store/Actions/Handoff/Notifications/Design、Simulator/Mac build、iPhone 17 Pro install/open + LAN Daily Beta Continuity + FLOW A/B device PASS | `DEVICE_FOUNDATION_VERIFIED / EXIT_OPEN`；**iOS Personal Daily Beta READY (LAN-DEPENDENT)** | App Group 持久共享、APNs/Focus entitlement、完整真机矩阵、签名/分发、旧 Tauri/Capacitor/companion 逐能力退役；非 LAN 公网入口 |
| Phase 5 Contextual Intelligence | Focus contracts、Web/Apple/Watch 本地行为、interruption policy、建议 explanation/budget、start/end RPC                                                                                          | `LOCAL_VERIFIED + LIMITED_DATA_PATH / EXIT_OPEN`                                            | ProductionExecutor、生产通知、Approval 执行闭环、跨设备 Focus state、真实信任升级与撤销/维护指标                              |
| Phase 6 生产收敛                | Wave migrations、受控 deploy、owner-limited canaries、rollback IDs、build pause、pre-revoke bypass                                                                                              | `CONTROLLED_PRODUCTION_CANARY / EXIT_OPEN`                                                  | legacy revoke、outbox worker、final rollback drill、长期观察、旧路径/站点/兼容层删除                                          |

### 4.1 为什么不能按最高 Phase 数字判断完成度

Phase 4/5/6 的 foundation 和 canary 可以在 Phase 1/2/3 的最终退役 gate 之前准备，但这不等于前一阶段已经完成。例如：

- Apple app 能构建和安装，不代表 Portal、Tauri 或 Capacitor 已退役。
- Focus 行为在本地通过，不代表生产通知和 Executor 已开放。
- Wave 1 migration 已应用，不代表 Planner legacy writer 已撤销。
- Portal `/today` owner-limited redirect 已上线，不代表 Portal app 已删除。

## 5. 能力与代码证据

### 5.1 核心契约与数据面

正式基线包含：

- `packages/contracts/src/kenos.ts`
- `packages/contracts/src/kenos-focus.ts`
- `packages/contracts/src/kenos-focus-runtime.ts`
- `packages/contracts/scripts/kenos.test.mjs`
- `packages/contracts/scripts/kenos-focus.test.mjs`
- `clients/apple/Packages/KenosContracts/**`

生产 migration 从 `20260719130100_kenos_wave1_plan_create_task_command.sql` 延伸到 `20260721144405_kenos_app_logs.sql`（中间含 `20260720230000` Assistant proposal），覆盖 Plan、privilege、Approval、Focus、Work、Activity、Outbox、Capture、proposal 与 iOS native log ingest。迁移存在与 migration tip 被记录，只证明 schema/function 已部署；每条业务路径是否全量启用仍由 flag、cohort 和 writer-routing 证据决定。

### 5.2 Plan

已正式提交的 Planner Kenos writer 包含 create、title、due date、schedule、project、complete/reopen、archive，以及 production guard、mutation audit、session cleanup 和 offline intent queue foundation。生产报告确认 Owner cohort 主要写命令已转 Kenos RPC。

尚未完成：

- 非 cohort 与 sync/upsert 的 legacy 路径仍在。
- Offline intent queue 的生产 flag 仍为 Off。
- “数据库命令存在”不能替代 writer revoke matrix、持续 shadow/对账和 rollback 演练。

### 5.3 Assistant / Today / Portal

AIOS 正式 routes 已包含 `/assistant`、`/inbox`、`/approvals`、`/activity`、`/focus`、`/spaces`、`/spaces/training`、`/spaces/work`、`/work`。Portal 已有 `kenosStrangler.js` 和 routing test，生产仅对 Owner cohort `/today` 执行 soft redirect。

尚未完成：默认入口全量切换、Portal read-only period、旧域名流量/写入归零、Portal app/build/registry/compat 删除。

### 5.4 Work / Capture / Domain Spaces

Work project create/archive、Assistant proposal、Capture ingest、Capture→Plan convert 已有正式 migration 与应用侧 foundation。Training、Money、Music、Home 已有不同程度的 read foundation，但领域 writer ownership 和完整 Space 体验没有统一完成。

不能把 read projection、deep link 或 landing page 当作领域迁移完成；领域完成至少还需要唯一 writer、真实数据、错误/离线/恢复、跨域引用和 retirement 证据。

### 5.5 Apple

正式基线包含 Kenos iOS/macOS/watchOS targets，以及 Contracts、Client、Store、Actions、Handoff、Notifications、Design packages。QA 记录了 Swift tests、Simulator build、Mac build、physical iPhone build/install 和 owner-open。

尚未完成：跨端持久状态、App Group、APNs、真实 Focus entitlement、生产通知、完整设备矩阵、TestFlight/正式分发和旧 native shells retirement。

### 5.6 UIUX

正式 UIUX compounding 报告记录六轮优化、本地 `91/100`、iPhone Simulator / Web preview 证据和无 P0/P1 blocker；同一报告明确写明 `Production deploy: NOT performed`。因此 UIUX 可写为“preview/simulator ready”，不可写成“production shipped”。

## 6. 正式基线守卫复核

本次在 `git archive HEAD` 的隔离副本中复核正式 SHA，避免本地 WIP 污染结果。Phase 0 guard 例外：它主动调用 `git diff` / `git ls-files` 验证 Cloud 任务工作树 allowlist，纯归档没有 Git metadata，因此不能用同一方式运行。

| 守卫                      | 结果                         | 解释                                                                                                                                               |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-kenos-phase0.mjs`  | CONTEXT_BLOCKED              | 当前共享工作树有大量非本审计 WIP，worktree allowlist 会按设计失败；纯 HEAD 归档缺少 Git metadata。不能把该结果记成正式代码回归，也不能宣称本次通过 |
| `check-kenos-phase1.mjs`  | PASS                         | 包含 Swift parity、writer cutover simulation、policy/MCP 检查                                                                                      |
| `check-kenos-phase2.mjs`  | FAIL                         | 仍要求 Approvals UI 出现旧的 `Executor` token；需按当前 fail-closed 行为重写断言                                                                   |
| `check-kenos-phase3.mjs`  | PASS_FORMAL / FAIL_LOCAL_WIP | 正式 HEAD 通过；当前未提交 Today 改动缺少既有 Work projection/owner/deep-link 合同，提交前必须恢复合同或经评审更新 guard                           |
| `check-kenos-phase4.mjs`  | PASS                         | Apple foundation guard 通过                                                                                                                        |
| `check-kenos-phase4b.mjs` | PASS                         | Cross-device foundation guard 通过                                                                                                                 |
| `check-kenos-phase5.mjs`  | PASS                         | Contextual intelligence 本地 guard 通过                                                                                                            |
| `check-kenos-phase6.mjs`  | PASS_WITH_STALE_MESSAGE      | 脚本通过，但输出仍写 `apply still blocked`，与生产 migration tip 证据冲突                                                                          |

结论：当前不能宣称 `verify-kenos-refactor` 全绿。Phase 2 正式基线 failure、Phase 3 本地 WIP regression/合同变化、Phase 6 stale message 和 Phase 0 的 clean-checkout 运行条件都需要显式处理；修复时必须保留安全与行为断言，不能为了变绿删除 gate。

## 7. 尚未完成的关键收口项

| 优先级 | 收口项                               | 完成标准                                                                                 | 主要回滚/停止条件                                                  |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P0     | 修复事实真源与守卫漂移               | phase guard 只验证本阶段稳定合同；Phase 6 不再显示过期 apply 状态                        | 如果新 guard 掩盖权限、writer 或 fail-closed 语义，停止            |
| P0     | Plan 单一 writer cutover             | 全目标 cohort/字段经 Kenos command；legacy revoke matrix 归零并完成观察                  | mismatch、auth/RLS、重复写、rollback SLO 超阈值立即回 legacy route |
| P0     | Outbox delivery 与 Executor 分离上线 | 先只读/投递 worker，再低风险 executor；Activity/Approval/Undo/kill switch 全有证据       | 未授权执行、重复投递、dead-letter 激增、无法撤销立即关闭           |
| P1     | Offline queue 生产启用               | 飞行模式创建/重连/幂等/冲突/登出清理真机通过                                             | 重放重复、跨用户泄漏、队列丢失立即关 flag                          |
| P1     | Assistant 默认入口与 Portal 退役     | 两个稳定周期后，Portal 写入、build、registry、route compatibility 全删除                 | deep link/登录/Today 数据口径回归则恢复 redirect target            |
| P1     | Work 真实闭环                        | 一个真实项目从 Capture/Connector 到 Plan/Library/Assistant review，测得少复制/少准备时间 | Work body 越域、第二任务真源、Connector 权限不清时停止             |
| P1     | Domain Spaces 分批迁移               | 每域有 owner、read/write policy、错误/离线/恢复和 retirement evidence                    | 禁止一次全域 writer cutover                                        |
| P1     | Apple 分发与跨端状态                 | App Group/APNs/entitlement/签名/TestFlight/真机矩阵完成                                  | 通知、账号、共享状态或隐私边界不可靠时保持本地 foundation          |
| P2     | Phase 5 主动能力                     | Observe→Suggest→Draft→Confirm 分 capability 放量，撤销率/维护成本可测                    | ProductionExecutor 默认保持 Off；任何未解释写入即停止              |

## 8. 建议操作顺序

### Slice A — 先修“我们如何知道它是对的”

1. 保留 Phase 0 的 Cloud worktree allowlist，并在干净 checkout/CI 提供可复核结果；如需要正式基线模式，应新增显式 mode，不能静默绕过 allowlist。
2. 把 Phase 2 的 `Executor` 展示文案断言改为可观察的 read-only/fail-closed 行为合同。
3. 对当前 Phase 3 WIP 做选择：恢复 Today 的 Work owner/deep-link 合同，或先评审新 IA，再同步更新行为 guard；正式 HEAD 目前仍是 PASS。
4. 更新 Phase 6 guard 的过期输出；让 apply 状态从生产证据读取或由明确参数提供。
5. 在干净 `origin/master` 基线上运行所有 phase guards，再运行 `npm run check`、boundary、manifest、build。

停止条件：为了通过而删掉 RLS、权限、单一 writer、fail-closed 或 rollback 断言。

### Slice B — Plan writer 正式收口

1. 冻结目标 cohort、命令字段和 legacy bypass 列表。
2. 观察 Kenos/legacy parity、错误率、重复写、Activity/outbox 一致性。
3. 先撤销最窄的 legacy 入口，再逐条扩大；每条都有独立 kill switch。
4. 启用 offline queue 前完成跨用户登出清理、重连、冲突和幂等真机测试。
5. 观察窗口通过后删除兼容路径，而不是永久保留双路由。

停止条件：数据量对不上、RLS/身份异常、重复命令、无法在既定 SLO 回滚。

### Slice C — Outbox、Approval、Executor

1. 先上线只处理 allowlisted event 的投递 worker，不启用业务自动执行。
2. 验证 claim/lease/retry/dead-letter/replay 与至少一次投递下的消费者幂等。
3. 将 executor 与 worker 分进程、分权限、分 kill switch。
4. 只对 R0/R1 或明确 owner-confirmed capability 开最小 cohort。
5. 每次动作必须有 Activity、理由、权限、影响、结果和 Undo/补偿。

停止条件：outbox backlog 无界增长、重复副作用、未审批 R3、无法 kill 或无法审计。

### Slice D — Assistant / Portal strangler

1. 证明 Today、Spaces、Inbox、Approvals、Activity 能覆盖 Portal 真实日用入口。
2. 保持 owner-limited redirect，记录 old/new route 流量、错误、登录和 deep-link parity。
3. 扩 cohort 后进入 Portal read-only period。
4. 只有写入归零、deep links 稳定、两个真实使用周期通过后，才删除 Portal app/build/registry/compat。

停止条件：用户无法到达任一现役 domain、Today 口径错误、redirect loop、SSO 丢失。

### Slice E — Work、Spaces、Apple、主动能力

1. 先做一个真实 Work 项目，不并行迁所有 domain writer。
2. 每个 Space 依次完成 read → reference/action → owner writer → recovery → retirement。
3. Apple 先完成持久共享、签名/分发和核心每日闭环，再退役旧 shells。
4. 主动能力最后按 capability 升级，ProductionExecutor 默认 Off。

停止条件：出现第二真源、长期双写、越域原文上传、不可逆外部动作或不可解释自动写入。

## 9. 本地未提交工作边界

审计时工作树存在大量并行 WIP，包括但不限于：

- 扩展的 AIOS DomainLaunch / KenosSystemBar 与 Home/Knowledge/Money/Music/Plan Spaces routes；
- Space continuity / resume / pin / recent 相关 contracts、platform-web 与 Apple store；
- 新一轮 UIUX rescue、review boards、截图与 QA 文档；
- Planner/Fitness/Finance/Portal 和 Kenos guards 的进一步改动。

这些内容可以作为“下一候选基线”评审，但在被 owner 审核、外科式提交并推送前统一标记为 `LOCAL_WIP`。本文没有修改或 stage 它们，也没有用它们提高正式完成度。

## 10. 文档新旧关系

| 文档                                                                                                                         | 角色              | 当前解释                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| 本文                                                                                                                         | 当前实施审计      | “现在做到哪里”的入口                                |
| [`KENOS_REFACTOR.md`](./KENOS_REFACTOR.md)                                                                                   | 计划导航          | 目标、边界、文档地图                                |
| [`../roadmap/KENOS_REFACTOR_PLAN.md`](../roadmap/KENOS_REFACTOR_PLAN.md)                                                     | 阶段设计          | 出口定义，不代表线性完成度                          |
| [`../roadmap/KENOS_REFACTOR_EXECUTION_STATE.md`](../roadmap/KENOS_REFACTOR_EXECUTION_STATE.md)                               | 执行历史          | 保留 Phase 0 Cloud 和后续阶段追踪；顶部快照指向本文 |
| [`../qa/kenos-current-production-baseline-live-revalidated.md`](../qa/kenos-current-production-baseline-live-revalidated.md) | 生产事实          | deploy/migration/flag/row count 的实时真源          |
| `kenos-completion-inventory-2026-07-20.md`                                                                                   | 历史起点盘点      | 不代表当前最新状态                                  |
| `kenos-production-wave1-apply-report.md`                                                                                     | 历史停止报告      | 已被后续 live baseline 的 migration tip 证据取代    |
| `kenos-production-wave1-final-approval-packet.md`                                                                            | apply 前审批包    | 不能替代 apply 后生产证据                           |
| `kenos-uiux-compounding-optimization-report.md`                                                                              | 本地视觉/体验证据 | `91/100`，明确未生产部署                            |

## 11. 何时才可以宣布“重构完成”

以下条件必须同时满足：

- 核心数据对象有唯一 Owner，目标路径只剩一个 writer，legacy writer/双写已删除。
- Outbox 能投递、重试、dead-letter 和恢复；Executor 权限隔离、可 kill、可审计、可撤销。
- Assistant/Today 成为默认入口，Portal app、专属写入、build、registry 和兼容路由已退役。
- 至少一个 Work 闭环与主要个人 Domain Spaces 通过真实使用和复利 gate。
- iPhone/iPad、Mac、Watch 的共享状态、离线、通知、签名/分发和核心真机矩阵完成。
- Phase 5 每个主动能力独立升级，无未解释写入，撤销率、审核量和维护成本可接受。
- 所有 phase guards 在干净正式基线上通过；production baseline、ledger、roadmap、system overview 与实际部署一致。
- rollback/restore/retirement 演练完成，旧 app、旧壳、旧 migration compatibility 和无消费者平台代码已删除。

在这些条件满足前，最诚实的发布语言是“受控生产 canary / foundation ready / exit open”，不是“Kenos 重构完成”。
