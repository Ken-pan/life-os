# Growth 主线（G-_ / M-_ / F-\* / H-P1–H-P3）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Next · §推荐执行顺序。

**桶定义：** 在 Core/Infra 闭环后，用**极小改动**放大已有基建（`core_*`、`life_events`、Portal、各 app RPC/扩展），提升「六 app 一体」体感。不做全站 AI；**Home 保持实验 tier**（H-P1–H-P3 ✅ 2026-07-09）。

---

## 外部对标（2026-07-08 网络调研）

| 模式                    | 代表                                                                                                                | 对 Life OS 的启示                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **统一入口 + 边缘 SSO** | [brainbot](https://github.com/slaguardia/brainbot) `#apps` launcher                                                 | Portal 读 `core_*` + G-P4 摘要 + Home 实验入口 ✅（2026-07-09）    |
| **Today / 摘要 widget** | [Aura](https://github.com/kevinreber/aura)、[FluxOS](https://www.getfluxos.com/)、[MyCapsul](https://mycapsul.com/) | 只读聚合卡片（任务数、账单、训练）比「全能 AI 仪表盘」适合单人团队 |
| **跨模块信号联动**      | [alaivOS Capsules](https://www.alaivos.com/)、[Altair 实体关系](https://github.com/getaltair/altair)                | 用 **`life_events` 窄链路**，不做 14 模块大一统                    |
| **浏览器扩展作数据桥**  | [Runner](https://runner.now/) Chrome、Finance OS Sync                                                               | **Finance 扩展是独有能力**；优先打磨同步反馈，不急着加券商         |
| **Daily Brief / 角标**  | [Iddu](https://iddu.app/)、[BASE](https://www.base-ai.app/)                                                         | Portal 待办角标 + 可选只读摘要；**不做**自动打电话/Agent 编排      |
| **PWA 从入口引导**      | brainbot PWA + Scalekit multi-app session                                                                           | 六站 manifest 已有（含 Home）；Portal 链出「添加到主屏幕」         |

### 明确不采纳（写入 hub §Not doing）

- 全模块 AI Life OS（[PAI/LifeOS](https://github.com/danielmiessler/LifeOS)、alaivOS 14 维）
- 第三方 SaaS 聚合（FluxOS 式接 Todoist/Notion/Chase）
- 边缘 OAuth2 Proxy 替换现有 Supabase SSO（已投入 `setupCrossDomainSSO`）
- 无场景的第二条 `life_events` 或 I-P2 智能推荐

---

## G-P1: Portal「继续」读 `core_user_app_settings` {#g-p1}

| 项       | 说明                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| **状态** | ✅ 2026-07-08 — `applyRecentAppFromDb` DB 优先于 localStorage                                  |
| **目标** | 登录后 Portal 优先读 DB `last_opened_at` 最大值的 app，跨设备一致（含未来 Launcher 中的 Home） |
| **投入** | 0.5–1d                                                                                         |
| **依赖** | I-P1 DB constraint 含 `portal`                                                                 |
| **验收** | 设备 A 打开 Finance → 设备 B 登录 Portal →「继续」指向 Finance                                 |

**代码锚点：** `apps/portal/src/lib/recentApp.svelte.js` · `packages/sync/src/coreIdentity.js`

---

## G-P2: Portal 待办 / 事件角标 {#g-p2}

| 项       | 说明                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| **状态** | ✅ 代码 2026-07-08 — `PortalAppBar` 只读 pending 计数；✅ 生产角标验收 2026-07-09  |
| **目标** | Launcher 或 AppBar 显示只读计数：Planner inbox 待处理 + 可选 `life_events` pending |
| **投入** | 1–2d                                                                               |
| **依赖** | I-P0 SSO 验收；Supabase RPC 或复用 Planner 已有 poll 逻辑的只读端点                |
| **验收** | Finance 触发 `bill_due` 后 Portal 显示 ≥1 待处理（或链到 Planner inbox）           |

**对标：** Iddu/BASE 的 notification aggregation——**只读、无 AI**。

---

## G-P3: `default_app` 登录后自动跳转 {#g-p3}

| 项       | 说明                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| **状态** | ✅ 2026-07-08 — `PortalSettings` + `portalPreferences.svelte.js`               |
| **目标** | 用户设置默认站后，Portal 登录完成自动 `goto` 该 app（可「跳过 Launcher」选项） |
| **投入** | 0.5d                                                                           |
| **依赖** | G-P1 同批 DB 可读                                                              |
| **验收** | Settings 设 `planner` → 下次 Portal 登录直达 planner.kenos.space               |

---

## G-P4: Portal「今日摘要」只读卡片 {#g-p4}

| 项       | 说明                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| **状态** | ✅ 2026-07-09 — `portal_today_summary()` RPC + `PortalTodaySummary.svelte` 三卡（Planner / Finance / Fitness） |
| **目标** | 2–3 张卡片：Planner 今日任务数、Finance 本月结余（只读）、最近 Fitness 训练；**可选** Home 储藏区数            |
| **投入** | 3–5d                                                                                                           |
| **依赖** | 各站 Supabase RPC 或 hub SQL view；**无新 AI**                                                                 |
| **触发** | G-P1–G-P3 完成后；有明确「每天从 Portal 开始」习惯时                                                           |

**对标：** MyCapsul HTML tiles / Aura Today——**聚合视图，非聊天 Agent**。

---

## G-P5: 六站 PWA 安装引导（从 Portal，含 Home） {#g-p5}

| 项       | 说明                                                                 |
| -------- | -------------------------------------------------------------------- |
| **状态** | ✅ 2026-07-08 — `PortalPwaGuide.svelte` 链六 app install 说明        |
| **目标** | Portal 加「添加到主屏幕」说明 + 链到六 app；Home 标为实验            |
| **投入** | 1–2d                                                                 |
| **依赖** | 无；参考 [`../qa/pwa-ios.md`](../qa/pwa-ios.md)                      |
| **验收** | Portal 可见六站 install 指引；`npm run qa:pwa` 仍绿（Home 可选纳入） |

---

## H-P1: Portal Launcher 加 Home 实验入口 {#h-p1}

| 项       | 说明                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| **状态** | ✅ 2026-07-09 — `PORTAL_APPS` 含 Home；独立「实验」区 + badge；`default_app` 仍仅四生产站 |
| **目标** | Launcher 增加 Home 卡（实验标签）；`rememberApp` / G-P1 可跟踪 `home` 点击                |
| **投入** | 0.5–1d                                                                                    |
| **依赖** | `packages/theme` `LIFE_OS_SITE_META.home`；Portal 加 icon                                 |
| **验收** | Portal 可见 HOME.OS 卡 → 点击打开 `home.kenos.space`                                      |

**不做：** 把 Home 与四生产站同权重默认展示（除非 H-P0 升 tier）。

---

## H-P2 / H-P3: Home Integration（SSO + redirect）{#h-p2}

| 项       | 说明                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| **状态** | ✅ 2026-07-09 — `createLifeOsAuth('home')`；migration `20260708180000`；redirect 已加 |
| **目标** | `createCoreIdentityHandler('home')` + `setupCrossDomainSSO`；Supabase + DB 含 `home`  |
| **投入** | 1–2d（复用 I-P0 模式）                                                                |
| **依赖** | I-P0 四站 SSO 验收通过 ✅                                                             |
| **验收** | Portal 登录 → Home 设置页显示已登录 ✅；`core_user_app_settings` 有 `app_id=home` 行  |

云同步（H-P4）见 [`INTEGRATION.md`](./INTEGRATION.md#h-p0) §Parked。（**H-P5** 平面浏览/编辑 ✅ 2026-07-08）

## I-P1.5b: Fitness 完练 → Planner 打卡（候选第二条事件）{#i-p15b}

| 项       | 说明                                                                  |
| -------- | --------------------------------------------------------------------- |
| **目标** | `fitness.workout_logged`（contracts 测试名）→ Planner 幂等 habit 任务 |
| **投入** | 3–5d                                                                  |
| **依赖** | 产品规则定稿（自动 vs 确认）；I-P1.5 管道已通                         |
| **ROI**  | ○ 按需——**须有每天用 Fitness + Planner 的明确场景**                   |

**优于 I-P2：** 具体链路、可验收，复用 outbox 模式。

---

## M-P1: Music `play_events` 生产闭环 {#m-p1}

| 项       | 说明                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| **状态** | ✅ 2026-07-09 — 生产 `play_events` 167 行；`playEvents.js` + Queue reasons UI |
| **目标** | 生产登录播歌 → 写入 `play_events` → UI 展示推荐 reasons                       |
| **投入** | 1–1.5d                                                                        |
| **依赖** | 无                                                                            |
| **验收** | 生产账号播 3 首后 `play_events` 有行；推荐页显示 reason 字段                  |

详情：[`../../apps/music/docs/TAGGING-RECOMMENDATION-STATUS.md`](../../apps/music/docs/TAGGING-RECOMMENDATION-STATUS.md)

---

## F-P1: Finance 扩展同步反馈 UX {#f-p1}

| 项       | 说明                                                                 |
| -------- | -------------------------------------------------------------------- |
| **状态** | ✅ 主站 toast 2026-07-09；🟡 Chrome popup last sync 待人工点一次扩展 |
| **目标** | 同步成功 Toast、上次同步时间、失败可重试提示                         |
| **投入** | 1–2d                                                                 |
| **依赖** | 无                                                                   |
| **验收** | 扩展 popup 可见 last sync；主站收到扩展数据后有 toast                |

**对标：** Runner 浏览器自动化——我们已有扩展，差**可感知反馈**。

---

## Tier B — Backlog 按需

| ID          | 主题                                   | 何时开                              |
| ----------- | -------------------------------------- | ----------------------------------- |
| **G-P6**    | ⌘K 跨站深链 + 最近搜索                 | CommandPalette 稳定后               |
| **F-P2**    | 扩展增加 1 个券商/聚合源               | DOM 稳定且你实际在用                |
| **M-P3**    | LLM 批量补标剩余 partial 曲目          | 推荐质量卡住时                      |
| **P-P1**    | 跨站推送策略对齐（Planner SW 为 SSOT） | PWA 通知成为痛点时                  |
| **H-P4**    | Home spatial Supabase 云同步           | H-P2/3 后且每天用 Home              |
| **G-P4b-M** | Portal Music 摘要卡（优先）            | G-P4 ✅ · ~1d · 见 POTENTIAL Tier 3 |
| **G-P4b-H** | Portal Home 储藏卡                     | 阻塞 **H-P6a**                      |

---

## G-P4b: Portal 今日摘要扩卡 {#g-p4b}

研判 → [`POTENTIAL.md`](./POTENTIAL.md)。拆 **Music（先做）** 与 **Home（H-P6a 后）**。

### G-P4b-M {#g-p4b-m}

| 项       | 说明                                                        |
| -------- | ----------------------------------------------------------- |
| **状态** | ⏳ hub §Next · 潜力 **#3**                                  |
| **目标** | 扩 `portal_today_summary()` + Music 第四卡（`play_events`） |
| **投入** | ~1d                                                         |

### G-P4b-H {#g-p4b-h}

| 项       | 说明                        |
| -------- | --------------------------- |
| **状态** | ○ 搁置至 H-P6a              |
| **目标** | 储藏区数或仅深链 `/storage` |

---

## 推荐顺序（与 hub · POTENTIAL 同步）

```text
Phase 0 — 信任
  F-P3   Finance STS / Scenarios / Spend

Phase 1 — 快赢 + 防回归
  G-P4b-M  Portal Music 第四卡
  M-P2     Music UI E2E
  P-P2     Insight E2E

Phase 1b — CI 复利
  qa:ia-routes + Planner desktop → ci.yml

Phase 2 — 基础设施
  FT-P0  Fitness E2E 确认

Phase 3 — 条件跨站
  FT-P1 / I-P1.5b
  G-P4b-H（H-P6a 后）

已完成（2026-07-09）
  F-P0 route smoke 22/22 ✅ · QA-P2 desktop 21/22 ✅ · I-P0 · G-P4 · H-P1/H-P2/H-P3 · G-P2 · M-P1 · F-P1
```

**已完成（2026-07-08）：** G-P1 · G-P3 · G-P5 · CI-补 · QA-F0 — 见 [`SHIPPED.md`](./SHIPPED.md)。
