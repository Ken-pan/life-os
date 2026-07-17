---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-17-roi-closure-audit
review_cadence: weekly
doc_role: status-hub
priority_model: 2026-07-12-single-branch
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → `[roadmap/](./roadmap/README.md)`
> **App 产品排期** → `[roadmap/apps/](./roadmap/apps/README.md)`
> **愿景 / 体系快照** → [`architecture/NORTH_STAR.md`](./architecture/NORTH_STAR.md) · [`architecture/SYSTEM_OVERVIEW.md`](./architecture/SYSTEM_OVERVIEW.md)
>
> **状态口径（2026-07-17）：** 以提交历史、当前工作区、测试、远程 migration/schema/data 与 GitHub Actions 共同判断；代码存在不等于发货，远程已变更但仓库未提交视为 P0 漂移。Canonical ticket ID → [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)。
>
> **PaperOS：** 设备 Shell / 真机 gate 已迁出独立仓库 `/Users/kenpan/「Projects」/paperos`；本 hub 只追踪 Planner `/api/paper/*` provider。历史 device gate 见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)，不再占本仓库 Now/Next。

## 一句话

Life OS 是 **个人生活平台**：仓库注册表共有九个产品 app——Planner / Fitness / Finance / Music 四生产站、Portal 启动器、Home 实验站，以及本地优先的 AIOS、KnowledgeOS、HealthOS。六个 canonical web surface 部署在 Netlify；AIOS / KnowledgeOS 另有实验云端 surface，HealthOS 当前只做本地 Mac + Watch/iPhone companion。PaperOS 是北极星中的第十个 OS，但设备 Shell 已迁出独立仓库。

**代码状态快照（2026-07-17）：**

- **HealthOS 已从模板晋升为第九 app：** HLT-0–4（Focus agent、六维状态引擎、自适应专注、健康趋势）已提交；companion 真机签名与持续交付仍待用户 gate。
- **Home 不再是“完全无云”：** 扫描 / 私有照片 / append-only 事件三条 migration 已在远程生产链；物体识别 migration `20260717120000` 也已在生产注册，`home.object_embeddings` 已有 57 行。**但 migration、embedding 服务、iOS 安静扫描/证据链仍在未提交工作区**，构成当前最高交付完整性风险；可编辑 spatial 项目仍以本地为真源。
- **Knowledge↔Planner 已有第一条跨 OS 引用：** KnowledgeOS 读 Planner 快照，Planner 项目详情可反向语义检索 Vault；Vault 正文仍不上传。
- **Design Catalog 已覆盖九品牌：** 当前代码收集 922 smoke / 147 a11y / 524 visual（`--list`；实际通过状态以当次 CI 为准）。
- **master CI 长红（🔴 待推送修复）：** 最近 5 次 push 全挂在 `integration-smoke` 的 `check:lifeos-styles`——`7260c52da` 等已提交的 Home 提交带入 raw-hex/raw-font-size/reserved-ds-class 超基线；`check:app-manifests` 也曾因生成 `appRegistry.js` 落后 manifest 失败。两者已在工作区修复（`build:app-registry` 重生成 + 样式基线 `--update` 收编 773 处存量），推送后应恢复绿；Home 新增违规的实质治理仍欠账。
- **本轮本地验证（2026-07-17）：** 全仓 `npm run check` 10/10 零错误（finance 40 / fitness 8 / planner 4 warning 留档）；`check:lifeos-boundaries` / `validate:tokens` / `check:app-manifests`（修后）/ `check:lifeos-styles`（修后）全绿；knowledge 单测 167/167、home viewpoint+localize 104/104。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）

| 序 | ID | 主题 | App | 紧急度 | ROI | 投入 | 闭环验收 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **PLAT.CI.0** | 恢复 master 交付可信度 | Platform | **P0** | 🔥 | <0.5d | 提交已生成 `appRegistry.js` + 样式基线修复；push 后 `integration-smoke` 绿；不得只以本地 gate 绿代替远程 CI |
| 2 | **HOME.RECOG.0** | 生产 schema ↔ git 真源闭环 | Home | **P0** | 🔥 | <0.5d | 已应用生产的 object recognition migration、57 条 embedding 对应服务/契约和 iOS 改动全部进入版本史；RLS/幂等/续跑证据留档 |
| 3 | **FINC.PURCHASE.6.a** | 支出审核最后一公里 | Finance | **P1** | 🔥 | 0.5–1d | 代码/RPC/matcher 已完成；只做 owner 登录实测 Confirm→Undo、双 JWT RLS 拒绝证明、desktop/mobile 基线，随后从 Now 收割 |
| 4 | **KNOW.EDITOR.7** | 块编辑器 WIP 稳定化 | KnowledgeOS | **P1** | ◆◆ | 0.5–1d | 当前工作区 20 文件 +1284/−485；167/167 unit + svelte-check 绿后补 library/editor browser smoke，拆清删除/替代组件并进入版本史 |

**Agent 分线全文：** `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`

### User Gate — 不占 Agent 主航道

| ID | Gate | 状态 | Gate 后动作 |
| --- | --- | --- | --- |
| **PLNR.SCHED.10b.ios** | 真机 iPhone Home Screen standalone 签收 | 代码/E2E/PWA 已绿，待 Ken | 通过即关闭 PLNR.SCHED.0；失败只修复已复现问题 |
| **PLNR.CAPTURE.0** | 真机 IME + 键盘 | 代码/unit/E2E/截图已绿，待 Ken | 与 SCHED 真机验收同批执行 |
| **HLT-5** | companion 真机签名 + HealthKit/iCloud/LAN 连续交付 | 源码/Xcode 工程仍有未提交部分；先 checkpoint，再待用户设备 | 通过后再研判状态摘要跨 OS 契约；不上传健康明细 |

**PLNR.SCHED.0 进度：** Antigravity baseline ✅ · migrate ✅ · Planner build/check/unit ✅ · desktop + mobile E2E ✅ · `schedule-usability` 4/4 ✅。唯一剩余为 `PLNR.SCHED.10b.ios` 用户 gate，因此不再阻塞 Finance 或 Planner 的 agent 工作。

**GYMS.SUB.5 ✅ 已发货（2026-07-13 确认）：** 工程 gate PASS + 产品 UI/copy closure 全部落地于 #19 `67e72b81`（选中态 accent bg+border+checkmark+`aria-pressed`、`done`-分支文案、Summary `Replaced`、Focus `Switched from`）；`session-queue`+`substitution` specs **9/9 绿**。详见 [`apps/fitness/docs/FT-P5-substitution.md`](../apps/fitness/docs/FT-P5-substitution.md)。

**FINC.SYNC.1b ✅ 已发货（2026-07-13 确认）：** 扩展 popup `renderSyncHealth` 显示上次同步 timestamp + 脱敏失败原因（token/hash/URL/stack 全遮蔽）+ 重试按钮；`extensionSyncHealth.test.js` **18/18 绿**（含并发锁）。剩：Chrome 装载后 live retry 手动抽验（可选）。

**PLNR.CORE.4 ✅ 已发货（2026-07-13 确认）：** Portal `portal_today_summary` 与 Planner Today 计数口径对齐 —— tz + tombstone 迁移 `ce475c75`（`20260712200000`）；客户端 `selectTodayGroups` 与 RPC 谓词逐项一致（active=非完成非删除 · today=`dueDate==today` · overdue=`<today`），新增 `selectors.test.js` 跨应用 parity 契约锁定不漂移（**9/9 绿**）。

**FINC.PURCHASE.6.a 商品明细覆盖（2026-07-13）：** History 记录页原先只有 `clean_enriched`（105 笔）显示商品，`matched_review`/`return_refund` 只显示徽章、把已解析明细藏起来。改为凡有 `lineItems` 的 clean/review/refund 都显示商品条 + 可展开明细（含 Confirm/Reject）。实测生产 273 笔真实分类器：**显示商品 105 → 251（新增 146 笔）**。`HistoryLedgerRow.svelte`。

**FINC.PURCHASE.6.a matching 质量优化（2026-07-13）：** 诊断发现不确定匹配主因是 `non_clean_status`（87/100）—— Amazon 导出常无 status（99 笔 null→字面量 'unknown' 被误判非 clean）+ "Picked Up"(空格) 漏配 `picked_up`。修 `isCleanPurchaseStatus`（SSOT，UI+read-model 共用）：unknown/缺失视为中性 clean、放宽履约措辞、退款仍非 clean。实测 **clean 105→176 · matched_review 100→29 · refund 68 不变**（71 笔升为可信 clean，审核负担降 71%）。纯客户端分类，无需重跑 matcher/改 DB。`classify.mjs`；`isCleanPurchaseStatus` 3 组断言。剩 29 笔 review 主因 low_confidence(20)/unknown_account(8)，属合理审核，边际递减。

**FINC.PURCHASE.6.a（2026-07-17 再核）：** 决策引擎 14/14、生产 migration + 3 RPC、273 笔回填、RPC 往返、matcher precedence **18/18**、UI Confirm/Reject/Undo **均已完成**（`0913a4daa` · `10886a8ae`）。**仅剩 closure QA：** 双真实 JWT 的 RLS 跨用户拒绝证明、owner 登录 History 实测 Confirm→Undo、desktop/mobile 视觉基线。不要再按「UI/RPC 未实现」估 3–5 天。

**PaperOS：** 设备 Shell、数据面 verify、系统生命周期、UI device gate 全部迁出独立仓库 — 详情见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)；Hub 只保留 Planner 侧 provider API 状态。

**2026-07-09 已验收（见 §Shipped）：** Phase 0–6 — **FINC.CORE.3** · **PORT.GROWTH.4b-M/H** · **PORT.GROWTH.6** · **PORT.GROWTH.8** · **PORT.GROWTH.9** · **MUSC.PIPE.5** · **HOME.PROJ.6a** · **PLNR.CORE.2** · **GYMS.CORE.0/GYMS.EVENTS.1** · **INTG.EVENTS.1b** · CI 接线。

### Next — 已排期

| 顺序 | ID | 主题 | App | 紧急度 | ROI | 投入 | 触发 / 最小范围 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **KNOW.VAULT.0** | 外部文件变更监听 | KnowledgeOS | P1 | 🔥 | 0.5–1d | curator/Obsidian 写回无需重启即出现；先做固定 Vault watcher，路径可配置可后置 |
| 2 | **HOME.RECOG.1** | Quick Scan 安静模式闭环 | Home/iOS | P1 | 🔥 | 0.5–1d | 装机复验 + 扫后质量摘要；每房间主动提示 ≤2，保持离线可扫 |
| 3 | **AIOS.STABLE.26** | 核心链路回归护栏 | AIOS | P1 | ◆◆ | 1d | 当前仅 4 个 profile 单测；补 chat/tool loop、云 LWW/墓碑、AIOS.20/21 读写 smoke，停止只靠高速手测 |
| 4 | **HOME.MCP.13** | `where_is` 接入 AIOS | Home | P2 | ◆◆ | 1–2d | 薄封装已落地 `searchStorageItems()` + 现成 MCP server；形成 Home 第一条真实跨 OS 消费链 |
| 5 | **PLNR.UIUX.0** | Planner 定向 UI 收口 | Planner | P2 | ◆ | 1d | PageShell/核心页已收敛；只扫未覆盖页面与 4 条现存 warning，不再做无边界“全站重做” |
| 6 | **PLNR.ATTACH.0** | 附件 WIP 决策与落地 | Planner | P2 | ◆ | 1d | UI/服务代码已有但远程表/桶不存在且无专项测试；要么补 migration+测试+上传/删除/预览验收，要么移除死入口 |

**后移：** `HOME.PROJ.7`（未出现第二个真实可编辑项目需求前不造多项目抽象）、`KNOW.SYNC.1`（Vault 原文上云涉及隐私/冲突，先把 watcher 做稳）、`MUSC.PIPE.4` / `GYMS.MEDIA.3` / `GYMS.SYNC.4`（维护级）。

**PaperOS（`PAPR.*`）后续排期已迁出独立仓库** — 见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)。

分 app 细节 → `[roadmap/apps/](./roadmap/apps/README.md)` · Growth / Home Integration → `[roadmap/GROWTH.md](./roadmap/GROWTH.md)` · `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

### 推荐执行顺序（2026-07-17 ROI / 闭环复核 · 单人）

研判全文 → `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`

```text
Phase 0 — 交付完整性（今天，串行）
  PLAT.CI.0 → HOME.RECOG.0

Phase 1 — 收割已完成代码（0.5–1d）
  FINC.PURCHASE.6.a closure QA → KNOW.EDITOR.7 稳定化

Phase 2 — 每日体感最高的两个闭环（1–2d）
  KNOW.VAULT.0 → HOME.RECOG.1

Phase 3 — 防高速迭代回归（1d）
  AIOS.STABLE.26

Phase 4 — 跨 OS 快赢（1–2d）
  HOME.MCP.13 where_is → AIOS

Phase 5 — 生产 app 定向收口（按需）
  PLNR.UIUX.0 → PLNR.ATTACH.0 决策

并行用户 gate（不阻塞上述 Phase）
  PLNR.SCHED.10b.ios + PLNR.CAPTURE.0 · HLT-5

已完成（2026-07-10）
  GYMS.PORTAL.2 Portal Fitness「今日是否已练」代码 + migration · PaperOS Slice 1.1 commits

已完成（2026-07-08 Home 墙图）
  HOME.SPATIAL.0–2c · Wave A/B/C UX — 见 `[qa/home-spatial-uiux-audit-2026-07-08.md](./qa/home-spatial-uiux-audit-2026-07-08.md)`

已完成（2026-07-09 Phase 6）
  HOME.PROJ.6a Home 储藏元数据 → core_*
  PORT.GROWTH.4b-H Portal 第五卡（储藏审计 · 实验）

已完成（2026-07-09 Phase 5）
  MUSC.PIPE.5 qa:rec-behavior 6/6 ✅
  PORT.GROWTH.8 · PORT.GROWTH.9 · P-1 遮罩 ✅
```

**已完成（2026-07-08 四轮计划）：** INTG.EVENTS.1 redirect/DB · PLAT.CORE.2 `schema.sql` · CI-补 · QA-GYMS-0 · PORT.GROWTH.1–PORT.GROWTH.3 · PORT.GROWTH.5 · MUSC.CORE.1/FINC.GROWTH.1 代码 · AppBrandSwitcher — 详情 `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`。

### Shipped — 近期已落地（摘要）


| 主线          | 摘要                                                                                 | 详情                                                                     |
| ----------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| HealthOS    | **HLT-0–4** 第九 app：Focus agent · 六维 State Engine · 自适应专注 · 健康趋势 · Watch/iPhone companion 源码 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-16 · `[apps/health.md](./roadmap/apps/health.md)` |
| Knowledge   | Vault 原生后端 / RAG / 项目感知；Knowledge↔Planner 双向引用试点 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-16 |
| Home        | RoomPlan 扫描/照片/追加事件生产链 + 空间/整理智能；可编辑项目仍为本地真源 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-16 |
| Design      | 九品牌 categorical 色板与树状图可读性；Catalog 覆盖九品牌 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-17 |
| Design      | **07-15/07-16 DS 平台化**：品牌 7 站 · Overlay/Form/Nav/Status 骨架 · Toast 重做 · 像素基线扩容 · `qa:prod-a11y` | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-15 · 2026-07-16 |
| AIOS        | **AIOS.20–25** 第七 app 接入 Life OS：读 `core_*` · 经 `life_events` 写 Planner · 早晨简报 · MCP 客户端 · 可编辑 Canvas · 自动记忆萃取 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-14 · `[apps/aios.md](./roadmap/apps/aios.md)` |
| Fitness     | **GYMS.VOL.6/6a** 肌群容量仪表盘（分数容量）· **GYMS.READY.8/WARMUP.9** Readiness 自动调节 + 热身坡道 · **GYMS.BW.7** 体重趋势 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-14                |
| Finance     | **payment_day** 信用卡实际扣款日 / 提前还款建模 · 页头迁共享 `LifeOsAppBar` · 全页面终检 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-14                |
| Music       | 推荐行为闭环通电（`recommendation_events` 在线学习）· 沉浸覆盖式 overlay · 歌词全自动化 · mini player 吸底 dock | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-14                |
| Design      | 中性激活态共享原语 `.seg-tone-calm`/`.nav-tone-calm` · 浮层边缘定位 + 内联展开共享原语 · 滚动条基线上升共享层 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-14                |
| Core        | **FINC.CORE.3** Finance STS 口径统一 · **PLNR.CORE.2** Planner Insight E2E 22/22       | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-09                |
| Growth      | **GYMS.PORTAL.2** Portal Fitness `workedOutToday` · **PORT.GROWTH.4b-H** · **PORT.GROWTH.8/9** · **MUSC.PIPE.5** | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` · `todaySummaryFormat.js` |
| Design      | Portal UI 走查 **P-1–P-12** ✅ · **P-5b/P-12**                                        | `[qa/portal-screenshot-audit.md](./qa/portal-screenshot-audit.md)`     |
| Integration | **GYMS.EVENTS.1** / **INTG.EVENTS.1b** 完练 → Planner 打卡                             | `fitness_workout_event_trigger` migration                              |
| Infra       | CI `planner-e2e-desktop` · `finance-ia-routes` · `portal-qa-smoke`；GYMS.CORE.0 **20/20** | `.github/workflows/ci.yml`                                        |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅                        | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md)`                   |
| Platform    | PLAT.CONTRACTS.0–PLAT.CONTRACTS.1 ✅；PLAT.CORE.2 Wave 1–3 P1+ ✅                      | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                         |
| Design      | DSGN.CATALOG.0–7 ✅；九品牌矩阵（当前收集 922 smoke / 147 a11y / 524 visual）          | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                             |
| Integration | INTG.IDENTITY.0 生产 SSO E2E ✅；HOME.SSO.2/HOME.SSO.3 Home SSO + redirect ✅            | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`                           |
| Growth      | PORT.GROWTH.4 Portal 今日摘要 ✅；PORT.GROWTH.2/FINC.GROWTH.1/MUSC.CORE.1 生产验收 ✅        | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                             |
| Integration | INTG.EVENTS.1 Portal DB + redirect · PLAT.CORE.2 `schema.sql` · PORT.GROWTH.1–PORT.GROWTH.3 · PORT.GROWTH.5 · CI-补 · QA-GYMS-0 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`             |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/今日摘要/PWA 引导）                            | `apps/portal`                                                          |
| Platform    | AppBrandSwitcher 当前含八个可切换 app（Portal 为 hub 不列入）                                | `packages/platform-web` · generated app registry                       |
| Home        | `home.kenos.space` 生产；SSO/PWA/空间 UX ✅；扫描/照片/事件三条 migration 远程已 apply（07-17 实测），完整项目同步未完成 | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)` |
| CI          | build + design-catalog（smoke/a11y/snapshots）+ integration-smoke 进 GHA              | `.github/workflows/ci.yml`                                             |


完整发货记录与 commit 锚点 → `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`

### Parked — 搁置 / 实验


| ID                 | 说明                                             |
| ------------------ | ---------------------------------------------- |
| **INTG.EVENTS.2** 跨应用智能     | 依赖更多 `life_events` 消费端                         |
| **HOME.PROJ.4** 完整项目同步 | 扫描/照片/事件 migration 远程已 apply（07-17 实测）；完整可编辑 spatial 项目同步仍未完成 |


---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：


| 类别       | 不做的事                                                                  | 原因                                                  |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| 工具链      | Jira / ProductPlan / 重型 PM SaaS                                       | 单人团队；repo 内 Markdown 即真源                            |
| 设计流程     | Storybook-first / **Figma / Figma-first**                             | 无 Figma；已定 token-first + design-catalog             |
| 架构       | 合并各 app 业务表；app 互引                                                    | 边界硬规则                                               |
| 抽象       | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                    | 见 `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)` §不提取 |
| 产品       | Home 升四站同级（默认 Launcher、直接写共享 `life_events`）                         | Home 仍是实验 tier；现有云链路是自有 `home` schema，不等于完整平台晋升 |
| 产品       | INTG.EVENTS.2 智能推荐；无场景的 `life_events` 扩展                              | INTG.EVENTS.2 无消费者                                  |
| 产品       | 全模块 AI Life OS；第三方 SaaS 聚合（Todoist/Notion/Chase）；自动打电话 Agent          | 对标 FluxOS/PAI/Iddu；单人不可维护                           |
| 页面       | production web surfaces 页面级 token 迁移 / 全量 a11y audit                  | D 线只做共享 primitive + catalog                         |
| Platform | ~~Finance `ui-react` / nav mirror / i18n 统一~~ Finance SvelteKit 迁移已完成 | 见 Finance SvelteKit 分支 ✓                            |


---

## 架构不变量（Present）

```text
严格边界 · 统一身份 · 事件驱动 · 受控互通
```


| 规则         | 要点                                                              |
| ---------- | --------------------------------------------------------------- |
| 依赖         | `@life-os/contracts` 为根；`apps/*` **禁止**互引                       |
| 数据         | 业务表各 app 自有；跨 app 走 `core_*` 或 `life_events`                    |
| 身份         | `auth.uid()` + `.kenos.space` 跨子域 Cookie（`setupCrossDomainSSO`） |
| 设计         | `packages/design-tokens` → generated CSS；catalog 只做 preview     |
| Package 方向 | `contracts` ← `platform-web` ← `apps`；`theme` / `sync` 侧向共享     |


Package 依赖表、提取决策矩阵、do-not-abstract 全表 → `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)`

契约白名单 → `[architecture/contracts.md](./architecture/contracts.md)`

---

## 主线速览

命名：**v2 APP3** — **`PAPR.*` PaperOS** · `PLNR.*` Planner · `FINC.*` Finance · `GYMS.*` Fitness · `MUSC.*` Music · `PORT.*` Portal/Growth · `HOME.*` Home · `INTG.*` Integration · `DSGN.*` Design · `PLAT.*` Platform · E2E **`QA-GYMS-0`**。对照 [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)


| 主线                   | 当前状态                                                       | 深度文档                                                                           |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **INTG.IDENTITY.0** 统一身份 | ✅ 生产 E2E（2026-07-09）                                   | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p0)`                      |
| **INTG.EVENTS.1** Portal | ✅ 已上线；Growth PORT.GROWTH.1–PORT.GROWTH.5 已接              | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)`                      |
| **INTG.EVENTS.1.5** 事件中心 | ✅ 管道通；**INTG.EVENTS.1b** Fitness 完练打卡 ✅（2026-07-09） | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p15)`                     |
| **PORT.GROWTH.1–5** Growth | ✅ 生产验收完成（含 FINC.GROWTH.1/PORT.GROWTH.2）              | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                                     |
| **HOME.EXPER.0** Home 实验 | 🟡 已部署；扫描/照片/事件 + object recognition schema 已生产（57 embeddings）；完整项目同步未完成，RECOG 工作区待版本史闭环 | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)` |
| **HOME.SPATIAL** 空间编辑 | ✅ **HOME.SPATIAL.0–5** · Wave A/B/C UX · `test:plan-edit` 13 checks | `[roadmap/apps/home-spatial-editor.md](./roadmap/apps/home-spatial-editor.md)` |
| **HLT-0–4** HealthOS | ✅ 本地 app / Focus / State Engine / 自适应 / 趋势；companion 真机 gate 待用户 | `[roadmap/apps/health.md](./roadmap/apps/health.md)` |
| **PLAT.CORE.2+** 平台扩容 | 🟡 Finance 部分接入；低优先                                     | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                                 |
| **DSGN.CATALOG.6** 设计系统 | ✅ catalog a11y gates（2026-07-08）                        | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                                     |


### App 一览（九个仓库产品 app；PaperOS 独立仓库）


| App     | 层级  | URL                                                | Workspace    | SSO | Portal | Top Next（→ 分卷）                               |
| ------- | --- | -------------------------------------------------- | ------------ | --- | ------ | -------------------------------------------- |
| Planner | 生产  | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | ✅ | ✅ | 用户 gate：SCHED/CAPTURE 真机；Agent：定向 UI → 附件 WIP 决策 |
| Fitness | 生产  | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | ✅ | ✅ | maintenance；MEDIA.3 / SYNC.4 均 P2 |
| Finance | 生产  | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | ✅ | ✅ | **FINC.PURCHASE.6.a closure QA** |
| Music   | 生产  | [music.kenos.space](https://music.kenos.space) | `music-os` | ✅ | ✅ | paused / maintenance |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space) | `portal` | ✅ | — | maintenance；不为凑 app 数扩卡 |
| Home    | 实验  | [home.kenos.space](https://home.kenos.space) | `home-os` | ✅ | ✅ | **HOME.RECOG.0 → RECOG.1 → RECOG.2** |
| AIOS    | 实验/本地优先 | [aios-kenos.netlify.app](https://aios-kenos.netlify.app)（云端只读） | `aios-os` | ✅ | ❌ 待研判 | **AIOS.STABLE.26** 回归护栏 |
| KnowledgeOS | 实验/本地优先 | [knowledgeos-ken.netlify.app](https://knowledgeos-ken.netlify.app)（云端 localStorage 模式） | `knowledge-os` | ✅ | ❌ 待研判 | **KNOW.EDITOR.7 → KNOW.VAULT.0** |
| HealthOS | 实验/本地优先 | 未部署（manifest `production: false`） | `health-os` | 本地 | ❌ | **HLT-5** checkpoint → 用户真机 gate |


> **AIOS（第七 app，2026-07-13 新建）：** 原生 Mac app（Tauri）+ 本机 LocalAI 推理，本地优先;已接共享 SSO/同步、读 `core_*`、经 `life_events` 写 Planner。Netlify 仅登录后只读查看器。**尚未接入 Portal。**

> **KnowledgeOS（第八 app，2026-07-16 新建）：** 原生 Mac app（Tauri）取代 Obsidian，Vault .md 即数据库，本地优先。已接语义 RAG 问答（消费 local-ai 服务端）+ Planner 只读联动（Life OS 统一 Supabase）；Vault 内容本身**尚未接云同步**，网页端退回 localStorage 模式。**尚未接入 Portal。**

> **HealthOS（第九 app，2026-07-16 从模板晋升）：** 原生 Mac app + Focus agent + Watch/iPhone HealthKit companion；HLT-0–4 已提交。原始健康数据只在本地，尚未部署 Netlify、未接 Portal。

**分卷：** `[roadmap/apps/](./roadmap/apps/README.md)` · 插件：Finance OS Sync — `apps/finance/extension`

部署与 Site ID → `[ops/netlify.md](./ops/netlify.md)` · Portal → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)` · Home → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

## 验收命令

```bash
./scripts/verify-life-os-identity-p0.sh    # INTG.IDENTITY.0
./scripts/test-outbox-trigger.sh --smoke   # INTG.EVENTS.1.5
npm run check:lifeos-boundaries            # PLAT.CONTRACTS.0
npm run check:app-manifests                # 九 app manifest → 生成注册表 staleness
npm run test:viewport -w home-os           # HOME.PROJ.5 平面定位（需 dev/preview）
npm run test:plan-edit -w home-os          # HOME.SPATIAL 墙图 smoke（13 checks）
npm run validate:tokens                    # D 线 token 完整性
npm run test:design-catalog                # 当前代码收集 922 smoke
npm run test:design-catalog:a11y           # 当前代码收集 147 a11y
npm run test:design-catalog:snapshots      # 当前代码收集 524 visual
```

**CI（`.github/workflows/ci.yml`）：** build · design-catalog · integration-smoke · planner-e2e-desktop · finance-ia-routes · **portal-qa-smoke** · **music-qa-rec-behavior**（secrets 缺则 skip）。

## 运维索引


| 主题                         | 文档                                                                    |
| -------------------------- | --------------------------------------------------------------------- |
| Supabase 迁移 / `schema.sql` | `[ops/supabase.md](./ops/supabase.md)`                                |
| Netlify 六站                 | `[ops/netlify.md](./ops/netlify.md)`                                  |
| 契约                         | `[architecture/contracts.md](./architecture/contracts.md)`            |
| 事件 RFC                     | `[architecture/events-rfc.md](./architecture/events-rfc.md)`          |
| 愿景 / 体系快照                  | `[architecture/NORTH_STAR.md](./architecture/NORTH_STAR.md)` · `[architecture/SYSTEM_OVERVIEW.md](./architecture/SYSTEM_OVERVIEW.md)` |
| PWA / iOS                  | `[qa/pwa-ios.md](./qa/pwa-ios.md)`                                    |
| 文档地图                       | `[README.md](./README.md)` · `[MAINTENANCE.md](./MAINTENANCE.md)`     |
| Growth / Portal / 单 App 闭环 | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                            |
| **App 产品排期**               | `[roadmap/apps/](./roadmap/apps/README.md)`                           |
| **潜力研判（ROI 排序）**           | `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`                      |
| **Agent 执行分线**             | `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`      |
| 历史归档 / 分卷                  | `[roadmap/](./roadmap/README.md)` · `[archive/](./archive/README.md)` |


## 维护约定

详见 `[MAINTENANCE.md](./MAINTENANCE.md)`。Hub 只维护 §Now / §Next / §Shipped / §Not doing；阶段史与证据写入 `roadmap/` 分卷。

*旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。*
