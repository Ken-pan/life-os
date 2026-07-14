---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-12-paperos-device-gate
review_cadence: weekly
doc_role: status-hub
priority_model: 2026-07-12-single-branch
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → `[roadmap/](./roadmap/README.md)`
> **六 app 产品排期** → `[roadmap/apps/](./roadmap/apps/README.md)`
>
> **状态口径（2026-07-12 device gate）：** 对照生产 HTTP、迁移文件与两次 exact-binary PaperOS 真机 gate；PR #27/#28 当前均 BLOCKED，未 un-draft。Canonical ticket ID → [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)。

## 深度复核摘要（2026-07-11 · PLNR.SCHED.0）

| 项                                                              | 原记录                      | 复核结论                                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PAPR.DATA.verify**（legacy `P-MOVE.verify` · `P-MOVE-BLOCK`） | 生产 `/api/paper/today` 404 | **已关闭** — 2026-07-11 设备 `ApiClient` → **200**；schema、cache、UI、retry、401 last-good 行为 PASS                                                                                    |
| **PAPR.UI.1.1**                                                 | toolbar P0 blocker          | **PR #27 真机 BLOCKED** — launch/Drawer/Gallery/recovery PASS；`pmUTC/amUTC` FAIL；physical stylus tool/color gate 未完成。PR #28 亦因 locale + visual FAIL blocked。详情 → [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md) |
| **GYMS.PORTAL.2**                                               | §Next                       | **已发货** — migration `20260710203000` **远程已应用**（Supabase 复核）· Portal UI · verify PASS                                                                                         |
| **PLNR.SCHED.0.migrate** | legacy tags 崩溃            | **✅ Shipped** — #15 `migrateTask` 默认 `tags: []` + `migrate.integration.test.js`                                                                                       |
| **PLNR.SCHED.0** · `PLNR.SCHED.10.pwa`                          | mobile 无裁切               | **10a.sim** simulated ✅ · **migrate ✅ #15** · **10b.ios** 真机 iOS PWA 待 Ken                                                                                   |
| **PaperOS 生命周期**                                            | 仅 UI/sync                  | **Discovery ✅ · 2026-07-12 已迁出独立仓库** — 详情 → [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md) |

## PaperOS 系统生命周期

PaperOS（设备 Shell、系统生命周期状态机、真机 gate 全套）已于 2026-07-12 迁出至独立仓库 `/Users/kenpan/「Projects」/paperos` → 详情与执行分卷见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)。Hub 仅追踪 Planner 侧数据 provider API（`/api/paper/*`）状态。

## 一句话

Life OS 是 **六 app 个人生活平台**（Planner / Fitness / Finance / Music 四生产站 + Portal 启动器 + **Home 实验**），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）


| 序  | ID                  | 主题                                         | App         | 桶      | ROI | 验收                                                                                                                                                                      |
| --- | ------------------- | -------------------------------------------- | ----------- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PLNR.SCHED.0**    | 日程视图 debug + 可用性闭环                  | Planner     | Product | 🔥  | migrate ✅ #15 · 10.pwa ✅ #18 · **10b.ios** 待 Ken |
| 2   | **FINC.PURCHASE.6** | 支出审核（商品明细 + 后续处理）              | Finance     | Product | 🔥  | Discovery PASS；**`FINC.PURCHASE.6.a` 数据地基 slice 1 已落地**（决策引擎 14/14 + 迁移已成文，2026-07-13）；RPC 集成 / UI 待隔离 QA Supabase — [`apps/finance/docs/FP6_PURCHASE_REVIEW.md`](../apps/finance/docs/FP6_PURCHASE_REVIEW.md) |
| —   | **PAPR.\*** | PaperOS 设备 Shell（含 PAPR.UI · PAPR.WRITE.5） | **PaperOS** | Product | —   | 已迁出独立仓库 — 见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)                                                                                  |

**Agent 分线全文：** `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`

**PLNR.SCHED.0 进度：** Antigravity baseline ✅ · **PLNR.SCHED.0.migrate PASS** `cb11fbcc` · PWA harness `29f0c2ed` · Planner build/check/unit ✅ · **desktop + mobile E2E 全绿**（2026-07-13 复跑：84→修 2 处 stale selector 后全通过；`schedule-usability` standalone guard 4/4 PASS）· **无已确认产品 P0**。**唯一剩余：真机 iPhone Home Screen standalone 签收（待 Ken）** → 合并后解锁 FINC.PURCHASE.6.a / PLNR.UIUX.0。

**GYMS.SUB.5 ✅ 已发货（2026-07-13 确认）：** 工程 gate PASS + 产品 UI/copy closure 全部落地于 #19 `67e72b81`（选中态 accent bg+border+checkmark+`aria-pressed`、`done`-分支文案、Summary `Replaced`、Focus `Switched from`）；`session-queue`+`substitution` specs **9/9 绿**。详见 [`apps/fitness/docs/FT-P5-substitution.md`](../apps/fitness/docs/FT-P5-substitution.md)。

**FINC.SYNC.1b ✅ 已发货（2026-07-13 确认）：** 扩展 popup `renderSyncHealth` 显示上次同步 timestamp + 脱敏失败原因（token/hash/URL/stack 全遮蔽）+ 重试按钮；`extensionSyncHealth.test.js` **18/18 绿**（含并发锁）。剩：Chrome 装载后 live retry 手动抽验（可选）。

**PLNR.CORE.4 ✅ 已发货（2026-07-13 确认）：** Portal `portal_today_summary` 与 Planner Today 计数口径对齐 —— tz + tombstone 迁移 `ce475c75`（`20260712200000`）；客户端 `selectTodayGroups` 与 RPC 谓词逐项一致（active=非完成非删除 · today=`dueDate==today` · overdue=`<today`），新增 `selectors.test.js` 跨应用 parity 契约锁定不漂移（**9/9 绿**）。

**FINC.PURCHASE.6.a 商品明细覆盖（2026-07-13）：** History 记录页原先只有 `clean_enriched`（105 笔）显示商品，`matched_review`/`return_refund` 只显示徽章、把已解析明细藏起来。改为凡有 `lineItems` 的 clean/review/refund 都显示商品条 + 可展开明细（含 Confirm/Reject）。实测生产 273 笔真实分类器：**显示商品 105 → 251（新增 146 笔）**。`HistoryLedgerRow.svelte`。

**FINC.PURCHASE.6.a 数据地基 slice 1（2026-07-13，已部署生产）：** 决策引擎 `purchaseReviewDecision.ts`（proposed/confirmed/rejected 状态机 + 乐观版本 + `action_key` 幂等 + 单步 Undo + 自动化优先级）**单测 14/14**；迁移 `20260713120000` **已部署生产** `iueozzuctstwvzbcxcyh`（两表 + RLS 5 策略 + 3 RPC；**273 笔回填为 proposed**），并在生产做**自清理 RPC 往返验证**（confirm/replay/not_proposed/version_conflict/undo 全部正确，数据净零变更）。**仍开放：** RLS 跨用户拒绝运行时证明（需两个真实 JWT 会话，超级用户 API 绕过 RLS）、matcher 优先级接线、Antigravity 基线、UI Confirm/Reject/Undo。详见 [`apps/finance/docs/FP6_PURCHASE_REVIEW.md`](../apps/finance/docs/FP6_PURCHASE_REVIEW.md)。

**PaperOS：** 设备 Shell、数据面 verify、系统生命周期、UI device gate 全部迁出独立仓库 — 详情见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)；Hub 只保留 Planner 侧 provider API 状态。

**2026-07-09 已验收（见 §Shipped）：** Phase 0–6 — **FINC.CORE.3** · **PORT.GROWTH.4b-M/H** · **PORT.GROWTH.6** · **PORT.GROWTH.8** · **PORT.GROWTH.9** · **MUSC.PIPE.5** · **HOME.PROJ.6a** · **PLNR.CORE.2** · **GYMS.CORE.0/GYMS.EVENTS.1** · **INTG.EVENTS.1b** · CI 接线。

### Next — 已排期


| ID                  | 主题                                | App     | 桶       | ROI | 触发 / 范围                                                                        |
| ------------------- | --------------------------------- | ------- | ------- | --- | ------------------------------------------------------------------------------ |
| **PLNR.UIUX.0**     | Planner 全站 UI/UX 走查（非日程）          | Planner | Product | ◆   | **禁止开始** — 须 PLNR.SCHED.0 合并关闭后；Today/Inbox/Projects 截图走查                     |
| **PLNR.ATTACH.0**   | Task / Project 附件底座               | Planner | Core    | ◆◆  | Supabase Storage + metadata；在线上传/删除/预览                                         |
| **HOME.PROJ.7**     | Home 多项目 localStorage 切换          | Home    | Product | ◆   | HOME.SPATIAL.0–5 发货后的下一项                                                       |

**PaperOS（`PAPR.*`）后续排期已迁出独立仓库** — 见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)。

分 app 细节 → `[roadmap/apps/](./roadmap/apps/README.md)` · Growth / Home Integration → `[roadmap/GROWTH.md](./roadmap/GROWTH.md)` · `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

### 推荐执行顺序（2026-07-10 状态复核 · 单人）

研判全文 → `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`

```text
Phase 7 — 日程 + 训练 + 审核（本周 🔥）
  PLNR.SCHED.0 standalone guard + 真机 iPhone 签收（PLNR.SCHED.0.migrate ✅）· GYMS.SUB.5 · FINC.PURCHASE.6 待 PLNR.SCHED.0 关单

Phase 8 — PaperOS
  设备生命周期 + 写路径已迁出独立仓库，见 [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)

Phase 9 — 半天级跨站快赢 ✅ 已发货（2026-07-13）
  FINC.SYNC.1b（popup last sync + retry, 18/18）· PLNR.CORE.4（Today↔Portal 计数对齐, parity 9/9）

Phase 10 — 产品增量
  PLNR.UIUX.0 Planner 走查 · PLNR.ATTACH.0 附件 · HOME.PROJ.7 Home 多项目

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
| Core        | **FINC.CORE.3** Finance STS 口径统一 · **PLNR.CORE.2** Planner Insight E2E 22/22       | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-09                |
| Growth      | **GYMS.PORTAL.2** Portal Fitness `workedOutToday` · **PORT.GROWTH.4b-H** · **PORT.GROWTH.8/9** · **MUSC.PIPE.5** | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` · `todaySummaryFormat.js` |
| Design      | Portal UI 走查 **P-1–P-12** ✅ · **P-5b/P-12**                                        | `[qa/portal-screenshot-audit.md](./qa/portal-screenshot-audit.md)`     |
| Integration | **GYMS.EVENTS.1** / **INTG.EVENTS.1b** 完练 → Planner 打卡                             | `fitness_workout_event_trigger` migration                              |
| Infra       | CI `planner-e2e-desktop` · `finance-ia-routes` · `portal-qa-smoke`；GYMS.CORE.0 **20/20** | `.github/workflows/ci.yml`                                        |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅                        | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md)`                   |
| Platform    | PLAT.CONTRACTS.0–PLAT.CONTRACTS.1 ✅；PLAT.CORE.2 Wave 1–3 P1+ ✅                      | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                         |
| Design      | DSGN.CATALOG.0–DSGN.CATALOG.5 ✅（tokens + catalog 172 smoke / 80 snapshots）          | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                             |
| Integration | INTG.IDENTITY.0 生产 SSO E2E ✅；HOME.SSO.2/HOME.SSO.3 Home SSO + redirect ✅            | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`                           |
| Growth      | PORT.GROWTH.4 Portal 今日摘要 ✅；PORT.GROWTH.2/FINC.GROWTH.1/MUSC.CORE.1 生产验收 ✅        | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                             |
| Integration | INTG.EVENTS.1 Portal DB + redirect · PLAT.CORE.2 `schema.sql` · PORT.GROWTH.1–PORT.GROWTH.3 · PORT.GROWTH.5 · CI-补 · QA-GYMS-0 | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`             |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/今日摘要/PWA 引导）                            | `apps/portal`                                                          |
| Platform    | AppBrandSwitcher 六站侧栏跨 app 切换（Svelte）                                              | `packages/platform-web` · `packages/theme/launcher.js`                 |
| Home        | `home.kenos.space` 生产；SSO + PWA + 平面 UX ✅（HOME.UIUX.5）；HOME.SYNC.4 云同步搁置          | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`              |
| CI          | build + design-catalog（smoke/a11y/snapshots）+ integration-smoke 进 GHA              | `.github/workflows/ci.yml`                                             |


完整发货记录与 commit 锚点 → `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`

### Parked — 搁置 / 实验


| ID                 | 说明                                             |
| ------------------ | ---------------------------------------------- |
| **INTG.EVENTS.2** 跨应用智能     | 依赖更多 `life_events` 消费端                         |
| **HOME.SYNC.4** Home 云同步  | spatial 项目 Supabase 持久化（现 `localStorage` only） |


---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：


| 类别       | 不做的事                                                                  | 原因                                                  |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| 工具链      | Jira / ProductPlan / 重型 PM SaaS                                       | 单人团队；repo 内 Markdown 即真源                            |
| 设计流程     | Storybook-first / **Figma / Figma-first**                             | 无 Figma；已定 token-first + design-catalog             |
| 架构       | 合并各 app 业务表；app 互引                                                    | 边界硬规则                                               |
| 抽象       | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                    | 见 `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)` §不提取 |
| 产品       | Home 升四站同级（云同步、默认 Launcher、life_events）                               | Home 实验性；HOME.SYNC.4 搁置；HOME.UIUX.5 平面 UX ✅；HOME.SSO.2/3 ✅ |
| 产品       | INTG.EVENTS.2 智能推荐；无场景的 `life_events` 扩展                              | INTG.EVENTS.2 无消费者                                  |
| 产品       | 全模块 AI Life OS；第三方 SaaS 聚合（Todoist/Notion/Chase）；自动打电话 Agent          | 对标 FluxOS/PAI/Iddu；单人不可维护                           |
| 页面       | production app 页面 token 迁移；六 app 全量 a11y audit                        | D 线只做共享 primitive + catalog                         |
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
| **HOME.EXPER.0** Home 实验 | 🟡 已部署；SSO + PWA + HOME.UIUX.5 平面 UX ✅；HOME.SYNC.4 云同步搁置 | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`                  |
| **HOME.SPATIAL** 空间编辑 | ✅ **HOME.SPATIAL.0–5** · Wave A/B/C UX · `test:plan-edit` 13 checks | `[roadmap/apps/home-spatial-editor.md](./roadmap/apps/home-spatial-editor.md)` |
| **PLAT.CORE.2+** 平台扩容 | 🟡 Finance 部分接入；低优先                                     | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                                 |
| **DSGN.CATALOG.6** 设计系统 | ✅ catalog a11y gates（2026-07-08）                        | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                                     |


### 六 app 一览


| App     | 层级  | URL                                                | Workspace    | SSO | Portal | Top Next（→ 分卷）                               |
| ------- | --- | -------------------------------------------------- | ------------ | --- | ------ | -------------------------------------------- |
| Planner | 生产  | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | ✅   | ✅      | **PLNR.SCHED.0** · Paper 数据 provider 维护   |
| Fitness | 生产  | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | ✅   | ✅      | **GYMS.SUB.5** · GYMS.PORTAL.2 ✅             |
| Finance | 生产  | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | ✅   | ✅      | **FINC.PURCHASE.6** 支出审核 · FINC.SYNC.1b 按需 |
| Music   | 生产  | [music.kenos.space](https://music.kenos.space)     | `music-os`   | ✅   | ✅      | MUSC.PIPE.5 ✅ · 维护推荐管道                      |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space)   | `portal`     | ✅   | —      | 当前无阻塞项；维护 smoke                              |
| Home    | 实验  | [home.kenos.space](https://home.kenos.space)       | `home-os`    | ✅   | ✅      | **HOME.PROJ.7** 多项目切换                        |


**分卷：** `[roadmap/apps/](./roadmap/apps/README.md)` · 插件：Finance OS Sync — `apps/finance/extension`

部署与 Site ID → `[ops/netlify.md](./ops/netlify.md)` · Portal → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)` · Home → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

## 验收命令

```bash
./scripts/verify-life-os-identity-p0.sh    # INTG.IDENTITY.0
./scripts/test-outbox-trigger.sh --smoke   # INTG.EVENTS.1.5
npm run check:lifeos-boundaries            # PLAT.CONTRACTS.0
npm run test:viewport -w home-os           # HOME.PROJ.5 平面定位（需 dev/preview）
npm run test:plan-edit -w home-os          # HOME.SPATIAL 墙图 smoke（13 checks）
npm run validate:tokens                    # D 线 token 完整性
npm run test:design-catalog                # 172 smoke
npm run test:design-catalog:snapshots    # 80 pixel baselines
```

**CI（`.github/workflows/ci.yml`）：** build · design-catalog · integration-smoke · planner-e2e-desktop · finance-ia-routes · **portal-qa-smoke** · **music-qa-rec-behavior**（secrets 缺则 skip）。

## 运维索引


| 主题                         | 文档                                                                    |
| -------------------------- | --------------------------------------------------------------------- |
| Supabase 迁移 / `schema.sql` | `[ops/supabase.md](./ops/supabase.md)`                                |
| Netlify 六站                 | `[ops/netlify.md](./ops/netlify.md)`                                  |
| 契约                         | `[architecture/contracts.md](./architecture/contracts.md)`            |
| 事件 RFC                     | `[architecture/events-rfc.md](./architecture/events-rfc.md)`          |
| PWA / iOS                  | `[qa/pwa-ios.md](./qa/pwa-ios.md)`                                    |
| 文档地图                       | `[README.md](./README.md)` · `[MAINTENANCE.md](./MAINTENANCE.md)`     |
| Growth / Portal / 单 App 闭环 | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                            |
| **六 app 产品排期**             | `[roadmap/apps/](./roadmap/apps/README.md)`                           |
| **潜力研判（ROI 排序）**           | `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`                      |
| **Agent 执行分线**             | `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`      |
| 历史归档 / 分卷                  | `[roadmap/](./roadmap/README.md)` · `[archive/](./archive/README.md)` |


## 维护约定

详见 `[MAINTENANCE.md](./MAINTENANCE.md)`。Hub 只维护 §Now / §Next / §Shipped / §Not doing；阶段史与证据写入 `roadmap/` 分卷。

*旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。*
