---
title: Kenos 平台重构计划 - 导航与执行边界
owner: kenpan
last_verified: 2026-07-21
doc_role: refactor-program-hub
status: controlled-production-canary-legacy-cutover-open
review_cadence: every-migration-slice
---

# Kenos 平台重构计划

> 这是本次 Life OS → Kenos 重构的专用导航页。它把最新平台审核中的产品、数据、AI、原生客户端和治理决策转成可执行文档。
>
> **当前诚实状态（2026-07-21）：** 正式基线已经包含 Phase 1–6 的多项实现，生产 migration 到 `20260720230000`，Owner cohort 的 Plan command、Capture/Approval 与 Portal `/today` soft redirect 已进入受控生产 canary；Apple 多端与 Phase 5 Contextual Intelligence 仍主要是 foundation/local verification。**Mac Web Daily Beta：READY**（`http://127.0.0.1:5219/`）。**iOS Personal Daily Beta：READY**（LAN-DEPENDENT；Continuity Plan/Training=in-app WKWebView；Assistant=IN-APP WEB；Flow A/B + isolation PASS；Phase 4 仍 `EXIT_OPEN`）。证据 `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/`。全量 writer cutover、legacy revoke、outbox delivery、ProductionExecutor、离线队列、Portal retirement、完整 Spaces 和 Apple 分发仍未完成。详见 [`kenos-implementation-status.md`](./kenos-implementation-status.md) 与证据目录 `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/`。当前生产事实与 Now/Next 仍以 [`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) 和 production baseline 报告为准。
>
> **阶段标签保留：** Phase 4A 指 Apple native daily-loop foundation；Phase 4B 指 watchOS / handoff / notifications 等 cross-device daily-loop foundation。两者已有正式实现与本地/设备证据，但仍是 `EXIT_OPEN`，不得解释为分发、跨端持久状态或旧壳退役完成。

## 一句话

Kenos 将从“多个互相打通的 OS App”渐进收敛为: **用户感受到一套系统，每个领域只有一个数据 Owner，Assistant 通过稳定契约协调，Web 保留深度与快速演进，Apple 三端提供原生日常入口。**

## 这次重构同时改什么

| 维度 | 从 | 到 |
| --- | --- | --- |
| 产品架构 | 多个 OS 和 Portal 启动器 | Kenos 品牌、Assistant/Today 默认入口、领域 Spaces |
| 信息架构 | app 各自保存相似对象 | 全局 Entity ID，一个 Owner，其他域只引用/投影 |
| 平台架构 | SSO、events、MCP、wikilink 的联邦式互通 | Entity / Action / Capture / Activity / Approval / Connector 契约 |
| AI 架构 | LLM 可直接给建议，部分写入路径分散 | Policy → Risk → Approval → Executor → Activity/Undo |
| 客户端 | 多个 Web/Tauri/Capacitor/companion 形态 | 一个 Kenos 产品；iOS/iPadOS、macOS、watchOS 三个原生角色 |
| 运行架构 | 云端、本地、Vault、Connector 能力分散 | 明确的在线要求、离线队列、降级、冲突与恢复契约 |
| 治理架构 | 功能/页面验收为主 | Constitution、9 Gates、Migration Ledger、cutover/rollback/retirement |

## 文档地图

| 先读 | 文档 | 回答什么问题 |
| --- | --- | --- |
| 0 | [`kenos-implementation-status.md`](./kenos-implementation-status.md) | 现在实际做到哪里？哪些已提交、已生产验证、仍是 WIP 或尚未收口？ |
| 1 | [`kenos-constitution.md`](./kenos-constitution.md) | 冲突时按什么原则取舍？什么不能做？ |
| 2 | [`kenos-decision-register.md`](./kenos-decision-register.md) | 哪些是已确认目标、哪些仍待 owner 冻结？ |
| 3 | [`kenos-target-architecture.md`](./kenos-target-architecture.md) | 最终产品、领域、数据、AI 和运行架构是什么？ |
| 4 | [`kenos-platform-contracts-rfc.md`](./kenos-platform-contracts-rfc.md) | Entity/Action/Capture 等契约的边界、字段和版本策略是什么？ |
| 5 | [`kenos-apple-client-architecture.md`](./kenos-apple-client-architecture.md) | 一个 Kenos 如何在 iPhone/iPad、Mac、Watch 上分工？ |
| 6 | [`../roadmap/KENOS_REFACTOR_PLAN.md`](../roadmap/KENOS_REFACTOR_PLAN.md) | 按什么顺序做？每阶段的出口条件是什么？ |
| 7 | [`../roadmap/KENOS_MIGRATION_LEDGER.md`](../roadmap/KENOS_MIGRATION_LEDGER.md) | 每一项迁移的 Owner、单一写入端、cutover 和退役日期是什么？ |
| 8 | [`../ops/kenos-migration-runbook.md`](../ops/kenos-migration-runbook.md) | 具体怎么操作、对账、切换、回滚和删除旧实现？ |
| 9 | [`../qa/kenos-refactor-gates.md`](../qa/kenos-refactor-gates.md) | 怎样证明不只是“代码完成”？ |
| 10 | [`../ops/kenos-codex-cloud.md`](../ops/kenos-codex-cloud.md) | 怎样安全配置和启动无人值守 Cloud 任务？ |
| 11 | [`../roadmap/KENOS_REFACTOR_EXECUTION_STATE.md`](../roadmap/KENOS_REFACTOR_EXECUTION_STATE.md) | Cloud 任务当前推进到哪里、最后一次验证是什么？ |
| 12 | [`../ops/kenos-phase1-privilege-model.md`](../ops/kenos-phase1-privilege-model.md) | 生产评审中 client/worker/function owner/RLS 权限如何收紧？ |
| 13 | [`../ops/kenos-phase1-writer-cutover.md`](../ops/kenos-phase1-writer-cutover.md) | writer 盘点、shadow、阈值、abort 和回滚如何审批？ |
| 14 | [`../ops/kenos-phase2-assistant-portal.md`](../ops/kenos-phase2-assistant-portal.md) | Assistant/Today 本地 beta、Portal strangler 和生产锁如何推进？ |
| 15 | [`../ops/kenos-phase3-work-loop.md`](../ops/kenos-phase3-work-loop.md) | Work 生产力闭环 foundation、ownership 与 simulation 边界 |
| 16 | [`../qa/kenos-phase3-work-loop.md`](../qa/kenos-phase3-work-loop.md) | Phase 3 Work desktop/mobile QA 与非声明 |
| 17 | [`./kenos-phase3-work-domain-inventory.md`](./kenos-phase3-work-domain-inventory.md) | Work 域现有来源盘点与命名冲突 |

## 权威和状态优先级

1. **安全/仓库操作规则:** 根 `AGENTS.md`。当前是 `master` 单分支、无 worktree/stash，它高于 review 中早期的 feature branch 建议。
2. **当前生产事实与排期:** [`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)、[`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md)、`docs/ops/*`。
3. **重构目标与迁移方法:** 本文档集。
4. **实现契约:** `packages/*/src`、SQL migration、测试。
5. **背景讨论:** [Life OS 平台审核共享会话](https://chatgpt.com/share/6a5bdc1e-d048-83e8-a2bc-2624933ec085)，仅作决策来源，不是运维真源。

## 当前已有的底座（不要重做）

| 能力 | 仓库事实 | 重构中的处理 |
| --- | --- | --- |
| 身份 | `@life-os/sync`、`core_profiles` | 扩展安全域/授权，不重写登录 |
| 事件 | `life_events` + Outbox trigger | 演进为明确的 Action/Activity 边界，不新建第二总线 |
| Web 契约 | `@life-os/contracts` | 增量添加核心契约，保持无 DOM/CSS |
| Web shell | `LifeOsAppShell` v1/v1.1 | 继续收敛 Planner/Finance；Portal 不做无意义重迁 |
| 视觉 | design tokens + theme + design-catalog | Music 走 theme/variant/slot，普通系统控件不 fork |
| App 生成 | AppManifest + create/promote/add-capability | 保留并维护；在新契约稳定前不扩张 generator |
| MCP | `@life-os/mcp-server` + 多 app 工具面 | 纳入 Connector/Permission/Activity，不允许绕过 Policy |
| PWA/QA | 各 app shell tests、PWA suite、catalog gates | 作为迁移回归基线，不以“新架构”之名降级 |

## 目标命名与稳定 ID

| 当前用户名称 | 目标用户名称 | 拟冻结内部 ID | 备注 |
| --- | --- | --- | --- |
| Life OS | Kenos | `kenos` | 品牌迁移不等于同日改全部路径 |
| AIOS | Assistant | `assistant` | 统一协调入口，不拥有其他领域数据 |
| Portal | Assistant / Today | 无独立长期 ID | 达到退役 gate 后删除独立 Portal |
| Planner | Plan | `plan` | 任务与时间唯一 Owner |
| KnowledgeOS | Library | `library` | 知识资产，不等同 Assistant Memory |
| Fitness | Training | `training` | 训练模型与记录 Owner |
| Finance | Money | `money` | 财务事实 Owner |
| HealthOS | Health | `health` | Status/Focus 是能力还是命名待冻结 |
| Home | Home | `home` | 空间与物品 Owner |
| Music | Music | `music` | 允许受控品牌表达 |
| PaperOS | Paper | `paper` | 设备实现在独立仓库，通过契约接入 |
| 平台设置 | System | `system` | 管理/恢复控制面，不是日常 Dashboard |

## 原始正式启动条件（历史门）

> 重构已经进入受控生产 canary；本节保留为治理审计基线，不再表示“实施尚未启动”。尚未满足或后来重新打开的条件统一进入 [`kenos-implementation-status.md`](./kenos-implementation-status.md) 的收口清单和 Migration Ledger，不得用后续实现倒推早期 gate 自动通过。

当且仅当以下条件齐备，才把 `KENOS_REFACTOR_PLAN.md` Phase 0 移入正式 Now:

- `kenos-decision-register.md` 中 P0 决策被 owner 冻结。
- Domain Ownership、Security Domains、Data Classification、Permission Model 无未决的高风险孔洞。
- `KENOS_MIGRATION_LEDGER.md` 每个首批 slice 都有旧 Owner、新 Owner、单一 writer、cutover、rollback、retirement。
- 当前工作树所有无关 WIP 已被各自 owner 提交；能安全执行 `git pull --rebase`。
- 首个垂直切片被限定为可回滚范围，不同时改品牌、路由、表结构、UI 和 repo 路径。

## 全程不可违反的七条

1. 一个数据对象只有一个长期写入 Owner。
2. 兼容层可短期存在，长期双写不可存在。
3. LLM 不能绕过 Policy/Approval/Executor 直接执行高风险动作。
4. 安全域不因为“在自己的 Mac 上”就隐式互通。
5. 系统不能用模糊错误、静默丢数或永久兼容层换取开发速度。
6. 新原生客户端调用同一组契约，不创建第二数据真源。
7. 每个迁移都必须有删除旧实现的日期和证据，不能以“以后再删”结束。

## 程序终局

这次重构只在以下事实同时成立时才算成功:

- 默认进入 Assistant / Today，不再经过第二个 Portal 首页。
- 任意核心数据都能在一分钟内说清 Owner、安全域和分类。
- 所有自动写入都能回答做了什么、为什么、用了什么权限、怎么撤销。
- 离线、Mac/Vault/Connector 不可用时，核心行为可排队或清晰降级，不丢数。
- iPhone/iPad、Mac、Watch 是同一产品的三个原生角色，而不是三套模型与同步。
- 上线后每周维护时间、重复输入和人工审核量呈下降趋势。
