---
title: Kenos 重构分阶段执行计划
owner: kenpan
last_verified: 2026-07-18
doc_role: refactor-roadmap-deep-dive
status: proposed-not-in-now
---

# Kenos 重构分阶段执行计划

> 本文是重构深度计划，不是当前 Now 真源。激活前必须在 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) 明确列为当前主航道。实施状态只在 Hub 和 [`KENOS_MIGRATION_LEDGER.md`](./KENOS_MIGRATION_LEDGER.md) 更新，避免多份 Now/Next。

## 1. 执行原则

1. 先冻结 Owner、安全、权限、迁移和恢复，再做新 UI。
2. 每个阶段交付一个真实垂直闭环，不建设没有消费者的通用平台。
3. 一次只迁一个写入 Owner 或一个用户入口，不同时做全仓 rename、schema、UI、客户端和域名切换。
4. 旧系统可兼容读取，但新旧不能长期同时写。
5. 每个阶段都经过 Architecture、Implementation、Integration、Real-use、Compounding 等 gates。
6. 当前仓库直接在 `master` 工作；不创建 branch、worktree、stash 或 checkpoint ref。
7. 现有 AppShell、contracts、events、SSO、MCP、generator 和 design-catalog 是底座，不重做。

## 2. 总体顺序

```text
Phase 0  Governance and boundary freeze
  -> Phase 1  Core contracts + one vertical slice + Web convergence
  -> Phase 2  Assistant/Today and Portal retirement
  -> Phase 3  Work productivity loop
  -> Phase 4  Unified Apple clients
  -> Phase 5  Proactive coordination and automation
```

Phase 4 的架构准备可在 Phase 0 写文档，但实现不得绕过 Phase 1 的 Action/Sync/Permission 契约。Phase 5 不得提前。

## 3. Phase 0 - 治理和边界冻结

### 目标

让任何数据、动作、客户端和迁移都能回答: 属于谁、能被谁访问、失败怎么办、如何回滚、何时删除旧实现。

### 交付物

| 工作包 | 内容 | 产出 | 完成标准 |
| --- | --- | --- | --- |
| Constitution | 取舍顺序、反原则、例外机制 | `kenos-constitution.md` | owner 签署，无 P0 冲突 |
| Decision freeze | 目标命名、Portal、Apple、Health/Status、Goal owner | decision register | P0 无 `FREEZE_REQUIRED` |
| Domain inventory | 逐表/文件/本地 store/外部对象标 Owner | ownership inventory 附录 | 核心对象无双 Owner |
| Security domains | Personal/Work/Household/System | policy matrix | 每个现役数据源有域 |
| Classification | 六类分类及 storage/model/search/retention | classification matrix | 缺失值有保守默认 |
| Permission model | R0-R4、授权期限、不可永久授权 | policy RFC | 所有现有写工具有风险级别 |
| Minimum Core | 核心能力和 SLO | QA baseline | 可测量、可演练 |
| Migration governance | ledger/runbook/retirement | 三份文档 | 首批 slice 填完整 |
| Native inventory | Tauri/Capacitor/Health companion 能力/数据 | Apple migration appendix | 无未知数据目录/后台任务 |

### 操作步骤

1. 只读扫描所有 `apps/*/supabase/migrations`、本地 storage key、Tauri data path、外部 Connector 和写 API。
2. 对每个业务对象填写当前 Owner、真实写入端、读者、同步策略、备份和敏感等级。
3. 找出双 Owner、双完成状态、复制任务、没有 RLS、直接跨 app 写表等 P0。
4. 冻结内部 domain ID，不做目录或 SQL rename。
5. 给现有 MCP 和自动化工具标 R0-R4、security domain、是否对外、是否可撤销。
6. 将第一批 migration slices 填入 Ledger；每项必须有 rollback 和 retirement。
7. 只更新文档和 guard，不改大规模产品代码。

### 建议的首批 owner inventory 范围

- Planner tasks/schedules/projects。
- AIOS conversations/memories/action writes。
- Knowledge Vault documents/wikilinks。
- Finance transactions/purchases/items。
- Home project/scan/object 双层本地与云真源。
- Health/Focus local JSON/HealthKit/cloud summary。
- Fitness workouts/readiness。
- Portal settings/today summary/default app。
- `life_events` producer/consumer 和 MCP writes。

### Phase 0 出口

- 决策登记表 P0 项已冻结。
- 100% 核心对象有 owner/security domain/classification。
- 所有写能力有 risk/approval/activity 方案。
- 第一垂直切片的 before/after、writer、backfill、cutover、rollback、retirement 完整。
- 当前主航道和 Not doing 已写回 Roadmap Hub。

## 4. Phase 1 - 核心契约、垂直切片与 Web 收敛

### 目标

证明一个动作可从多个入口安全、幂等、可观察地写入唯一领域 Owner，并在离线/重试下不重复。

### 1A Contracts foundation

实现顺序:

1. `EntityRef` + owner/security/classification metadata。
2. `ActionRequest` / `ActionDecision` / `ActionResult`。
3. `ActivityRecord` 与 Approval envelope。
4. `MutationEnvelope` 与 Outbox 字段补强。
5. `CaptureEnvelope`。
6. Connector 和 Recommendation 最后做，有真实消费者再冻结。

每个 runtime envelope 使用同一 JSON fixture 在 TypeScript、SQL boundary 和 Swift Codable 测试中验证。

### 1B 首个垂直切片: create task

建议链路:

```text
Assistant/Web/native test client
  -> plan.create_task Action Request
  -> Policy/Risk
  -> Plan executor
  -> task + outbox same transaction
  -> Activity
  -> EntityRef returned to caller
```

验收:

- 相同 `idempotency_key` 重试只产生一个任务。
- 跨用户、跨安全域、过期请求、版本冲突被拒绝。
- 离线请求排队，恢复后一次生效。
- Activity 能显示来源、理由、影响和 Undo/补偿。
- Work 保存引用，不创建第二任务完成状态。

### 1C Policy / Approval / Activity 最小闭环

- R0/R1 自动。
- R2 至少支持预览或 Undo。
- R3 明确确认。
- R4 在本阶段只定义并拒绝未支持动作，不急于开放执行。
- System 提供最小 Activity/queued/failed view。

### 1D Capture 最小闭环

以 Share URL 或文本 Capture 为第一个使用者:

1. 本地/客户端先持久化。
2. 写 Capture Envelope。
3. 路由到 Library Source。
4. 可选提取 Plan action，但通过 Action Request 创建。
5. 保留 provenance 和原始链接。

不在首个切片加入相机、RoomPlan、OCR、收据和全量 AI 分类。

### 1E Web 平台收敛

这部分回应最初的“批量创建新 App”目标，但只做有证据的收敛:

| 范围 | 当前事实 | 处理 |
| --- | --- | --- |
| AppShell | Fitness/Home/Music/AIOS/Knowledge/Health 已采用 | 评估并迁 Planner/Finance；Portal 因退役不做无价值迁移 |
| Settings | Planner/Fitness/Home/Finance 大量共享；Music 部分共享 | 抽稳定 Appearance 行为；Music 补通用设置，品牌走 theme/variant |
| System states | loading/empty/error/offline 分散 | 先为 Action/Capture/System 真实场景建立共享 pattern |
| Navigation | AppBar 骨架已共享；nav content app-owned | 保持 schema/slots，不抽业务 IA |
| Generator | 已有 AppManifest 和能力模块 | 只修 drift/bug；新核心契约稳定前不扩模板 |

提取条件不是机械“3 app”，而是语义稳定、未来必需、API 清晰、有至少两个不同消费者且维护成本下降。

### Phase 1 出口

- 一个跨 Web/原生 fixture 的 Action 垂直切片通过。
- Entity/Action/Activity/Mutation v1 冻结；Capture 至少 beta。
- RLS、双用户拒绝、幂等、outbox、retry、dead-letter 可验证。
- Planner/Finance AppShell 形成明确 migrate/keep 决定；Music 设置不靠 fork。
- 未建立复杂主动 AI、全局搜索或通用 Connector 平台。

## 5. Phase 2 - Assistant / Today 与 Portal 迁移

### 目标

建立唯一默认入口，在功能等价和真实使用成立后退役 Portal。

### 2A Assistant product shell

交付:

- Today: 状态、真正重要事项、下一步、待决定、系统已处理。
- Assistant: 对话、来源、Action preview。
- Inbox: Capture/外部输入/待分类。
- Approvals: 风险、影响、范围、确认。
- Activity: 自动动作、失败、Undo。
- System issues: Connector/Sync/Runtime/Vault 阻塞。

### 2B Portal freeze

满足以下条件时立即冻结 Portal 新功能:

- Today 已能承接 Portal 的今日摘要和默认进入价值。
- App/Space 切换可从 Assistant/全局导航完成。
- Portal 独有写入与设置已列入 ledger。

冻结后只允许安全、数据正确性和迁移修复。

### 2C Cutover 顺序

```text
Assistant Today beta
-> Inbox/Approval/Activity ready
-> Portal writes frozen
-> default entry switches to Assistant
-> Portal read-only notice
-> domain/deep-link redirects
-> observe old traffic/writes
-> remove Portal-specific logic
-> remove Portal app
-> remove compatibility routing
```

### Phase 2 出口

- Assistant/Today 连续真实使用至少两个稳定周期。
- Portal 所有能力已迁移、明确取消或证明不再需要。
- 旧域名无写入，redirect 可观测，deep links 有兼容测试。
- Portal app、专属写入、构建/部署/注册表接线和兼容层全部删除。
- Roadmap/System Overview/ops 不再把 Portal 写成现役产品。

## 6. Phase 3 - Work 生产力闭环

### 目标

实现最有真实复利的跨领域链路，而不是先建设抽象 Coordination Engine。

```text
Web Lens / Figma / Jira / Calendar
                -> Work
              /         \
          Library       Plan
              \         /
               Assistant
```

### 交付顺序

1. 选择一个真实项目和一个 Connector；默认只读。
2. Capture 外部对象，保留 external ID、URL、权限和 provenance。
3. 在 Work 建项目上下文或引用，不复制外部原始真源。
4. Library 保存来源/决定，Plan 通过 Action 创建行动项。
5. Assistant 生成会议准备、风险、未决问题和下一步。
6. Activity 可解释每个对象如何产生。
7. 完成一次真实 review/meeting，从捕获到行动到回顾闭环。

### 约束

- Work confidential 默认不进个人云或 cloud AI。
- Connector 默认只读；写 Jira/邮件属于 R3。
- Teams/邮件不做全量镜像。
- 不能让 Work 自建第二任务系统。

### Phase 3 出口

- 一个真实 Work 项目闭环通过 Real-use 和 Compounding Gate。
- 同一信息只捕获一次，能被 Work/Library/Plan/Assistant 引用。
- Connector reauth/rate limit/schema change/disable 可观察。
- 手工复制和会前准备时间有下降证据。

## 7. Phase 4 - 统一 Apple 客户端

详细架构与 A0-A4 见 [`../architecture/kenos-apple-client-architecture.md`](../architecture/kenos-apple-client-architecture.md)。

### 顺序

1. A0 Foundation: 三 targets + shared models/auth/API/SQLite/outbox/actions/CI。
2. A1 iPhone: Today/Assistant/Capture/Inbox/Approval/Share/Widget/Notifications。
3. A2 Mac: Command Bar/Menu Bar/Work/Plan/Library/Runtime/Vault/System。
4. A3 Watch: Today/Capture/Act/Training/Focus/Health。
5. A4 按 native value 逐领域原生化。

### 旧壳退役

AIOS/Knowledge/Health Tauri、Health companion、Music Capacitor 分能力退役，不 wholesale 合并。旧壳数据目录、deep links、后台任务、权限和恢复流程都进入 ledger。

### Phase 4 出口

- 用户只需一个 Kenos 产品名和账户。
- 三端共享 Action/Sync/Permission/Activity，不共享强行相同 UI。
- 核心操作本地即时反馈，离线不丢，重试不重复。
- 旧壳只有在替代能力真实使用通过后删除。

## 8. Phase 5 - 主动协调和自动化

### 前置硬门

以下任一不满足就不得开始:

- 唯一数据 Owner 已稳定。
- Permission/Approval/Activity/Undo 可用。
- Sync/Conflict/Offline 已通过恢复演练。
- 至少一个 Work 和一个个人领域闭环真实使用。
- 自动化有退出、暂停和恢复通道。

### 交付顺序

1. 领域输出标准 Recommendation，不直接改其他领域。
2. 实现硬约束和少量确定性规则。
3. Assistant 只解释和协商，不临场决定安全约束。
4. 每个 capability 从 Observe → Suggest → Draft → Confirm 逐级升级。
5. Attention Budget、置信度校准、撤销率和维护成本进入月度审计。

### Phase 5 出口

- 无未解释的 AI 自动写入。
- 每项自动化有独立信任级别和退出条件。
- 重要协调建议能展示 evidence、constraint、trade-off。
- 维护时间和人工审核下降，而非增长。

## 9. 横向工作流

### Security

每阶段执行 threat model、RLS、密钥、数据分类、跨域和对外动作检查。安全不能留到 Phase 5。

### Observability

从 Phase 1 开始统一 Activity、job state、connector health、sync lag、dead letter 和 recovery evidence。

### Documentation

- 架构变化更新 architecture docs。
- 迁移状态只更新 Ledger 和 Roadmap Hub。
- 生产运维变化更新 ops。
- 测试与真实使用证据更新 qa。
- 已完成项进入 Shipped，删除过期计划语句。

### UI platform

继续 token/theme/AppShell/design-catalog 路线。Music 的差异通过 semantic tokens、theme、documented variant、slot/composition 表达；只有 Now Playing、lyrics、mini player、visualization 等真实音乐领域交互保留专属组件。

## 10. 复杂度预算

每个工作包进入 Now 前写:

- 开发与月度维护成本。
- 新增长期状态和外部依赖数。
- 用户理解和权限成本。
- 失败影响、降级和退出方案。
- 每月预计节省时间。

满足以下任一则默认不做:

- 维护成本高于节省时间。
- 需要第二真源。
- 需要用户持续审核大量 AI 结果。
- 无法降级或恢复。
- 没有长期 Owner。
- 无真实使用场景和验收指标。

## 11. 暂不执行清单

- 全仓 rename、目录 mass move、schema mass rename。
- 微服务化、多 Supabase 项目。
- 全局对象图谱一次建完。
- 无消费者的 events/connector/recommendation 抽象。
- 全量原生页面重写。
- File Provider。
- 复杂 Goal/OKR Dashboard。
- 自动对外发送和大规模浏览器操作。
- 新 branch/worktree/stash。
