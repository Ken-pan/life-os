# 潜力研判（2026-07-17 ROI / 闭环复核）

> **状态：当前研判。** 排序真源仍是 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)；本文解释为什么。旧 2026-07-09 研判保留在下方「历史证据」，不得用于当前排期。

> **用途：** 回答「如果只做一两件事，哪里 ROI 最高？」
> **Hub 排期真源：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now · §Next · §推荐执行顺序
> **分卷细节：** [`apps/`](./apps/README.md)

## 结论（TL;DR）

```text
先恢复可交付，再收割已完成代码，再做每日体感：

P0  PLAT.CI.0 → HOME.RECOG.0
P1  FINC.PURCHASE.6.a closure → KNOW.EDITOR.7
P1  KNOW.VAULT.0 → HOME.RECOG.1 → AIOS.STABLE.26
P2  HOME.MCP.13 → PLNR.UIUX.0 → PLNR.ATTACH.0 决策
```

## 当前 Top ROI（代码与远程状态复核）

| 顺序 | 项 | 紧急度 | ROI | 投入 | 为什么现在 |
| --- | --- | --- | --- | --- | --- |
| 1 | **PLAT.CI.0** | P0 | 🔥 | <0.5d | master 最近 5 次 push 的 `integration-smoke` 红；本地修复不能替代远程绿 |
| 2 | **HOME.RECOG.0** | P0 | 🔥 | <0.5d | 生产已有 migration + 57 embeddings，git 却没有对应真源；这是灾备/复现风险 |
| 3 | **FINC.PURCHASE.6.a closure** | P1 | 🔥 | 0.5–1d | UI/RPC/matcher 已完成；极少 QA 即可把“代码完成”变成可信发货 |
| 4 | **KNOW.EDITOR.7** | P1 | ◆◆ | 0.5–1d | 20 文件大 WIP 已通过 unit/check，继续叠功能只会放大丢失与回归风险 |
| 5 | **KNOW.VAULT.0 watcher** | P1 | 🔥 | 0.5–1d | curator/Obsidian 每日写入当前需重启才能看到；直接影响 KnowledgeOS 核心承诺 |
| 6 | **HOME.RECOG.1** | P1 | 🔥 | 0.5–1d | 用户已明确“扫描安静、稳、可信”为最高产品方向；代码已接近装机验收 |
| 7 | **AIOS.STABLE.26** | P1 | ◆◆ | 1d | AIOS.1–25 两天铺开，但现有自动测试只有 4 个 profile case，回归暴露面过大 |
| 8 | **HOME.MCP.13** | P2 | ◆◆ | 1–2d | 现有 storage 搜索 + MCP 底座已齐；最短路径形成 Home→AIOS 实际消费 |

## 每个 App 未来 7 天只做一件事

| App | 首选目标 | 不做 / 后移 |
| --- | --- | --- |
| Planner | 用户同批签收 SCHED/CAPTURE；Agent 只做定向 UI 收口 | 不再让用户 gate 阻塞 Finance；附件先确认远程表/桶 |
| Fitness | maintenance，真实训练回归才修 | MEDIA.3 / SYNC.4 不抢主线 |
| Finance | 6.a closure QA 并收割 | 6b/6c 在 6.a 未正式关闭前不开 |
| Music | paused / maintenance | PIPE.4、25 条 partial 标签按需 |
| Portal | maintenance | 不为凑九 app 扩卡 |
| Home | RECOG.0 → RECOG.1 | PROJ.7 多项目、完整项目云同步、智能家居后移 |
| AIOS | STABLE.26 回归护栏 | 暂停新增 AIOS.26 功能面 |
| KnowledgeOS | EDITOR.7 → VAULT.0 | SYNC/GRAPH/XREF 扩面后移 |
| HealthOS | HLT-5 checkpoint + 用户真机 gate | Portal/Netlify/新连接器后移 |

## 不建议现在投入

- `HOME.PROJ.4` 完整项目云同步、`HOME.PROJ.7` 多项目：没有第二个真实项目需求，且会放大身份/冲突复杂度。
- `KNOW.SYNC.1` Vault 原文上云：隐私与冲突模型未闭环；先解决 watcher。
- Portal 第七/八/九卡：本地优先 app 尚无每日 Portal 消费价值。
- Music / Fitness 普通增量、共享图表告警大扫除：均低于当前交付完整性和高 ROI closure。

---

## 2026-07-09 历史研判（仅保留证据）

**当时已完成（Phase 6）：** HOME.PROJ.6a · PORT.GROWTH.4b-H — 见 [`SHIPPED.md`](./SHIPPED.md)

**当时已完成：** FINC.CORE.0 route smoke 22/22 · MUSC.UI.2 qa-ui-flow 15/15 · PLNR.CORE.2 22/22

---

## 研判方法

| 维度       | 权重 | 说明                                      |
| ---------- | ---- | ----------------------------------------- |
| 日用触点   | 高   | 每天打开的 app 优先                       |
| 跨站放大   | 高   | Portal / life_events 读模型               |
| 实现就绪度 | 中   | 钩子、RPC、脚本是否已有                   |
| 投入       | 中   | 单人 0.5–3d 可闭环优先                    |
| CI 复利    | 高   | `.github/workflows/ci.yml` 无四生产站 E2E |

---

## Tier 1 — 信任锚点（Finance **FINC.CORE.3**）

**为什么潜力最大**

- Finance 是 Portal **PORT.GROWTH.4** 月结余数据源（`portal_today_summary` → `finance_transactions`）。
- Today 主路径已走 `selectSafeToSpendBreakdown` + `sumEarmarkedOperatingGoalCash(goal.current)`（`useDashboard.ts`）。
- 但 PTO audit 仍标 **Critical** 缺口且**无专项回归测试**：
  - `08_TEST_AND_QA_COVERAGE.md`：`STS uses goal.current` · `computeSpendImpact STS = main STS` → **No test**
  - `01_FEATURE_INVENTORY.md`：Scenarios 专款 `current` 未进引擎 · Spend 抽屉公式不一致
- **用户感知：** 「今日可花」与试算抽屉/场景页数字不一致 → 全平台信任崩塌，比少一张 Portal 卡更严重。

**建议最小闭环（2–3d）**

1. 新增 `metrics.test.ts` 或扩 `dashboard.test.ts`：earmarked `current` + SpendImpact 与 Today breakdown 一致
2. 对齐 `ScenariosView` 专款与 `selectSafeToSpendBreakdown`（`apps/finance/src/engine/goals.ts`）
3. 人工验收：Today KPI = Spend 抽屉 STS = Portal 月结余口径可解释

**证据路径：** `apps/finance/src/hooks/useDashboard.ts` · `engine/metrics.ts` · `docs/pto-audit-export/08_TEST_AND_QA_COVERAGE.md`

---

## Tier 2 — 快赢体感 + 防回归（**PORT.GROWTH.4b-M** · **MUSC.UI.2** · **CI**）

**相对初版研判的调整（2026-07-09 二次检索）**

- **FINC.CORE.0 ✅**：`ia-route-smoke.mjs` 已用 `ia-qa-auth.mjs` 登录 + `injectLifeOsSession`；本地 **22/22**（见 `e2e-issues.md` FN-1）。hub 待移入 Shipped；**剩余工作 = CI 接线**（可选 `FINC.CORE.0b`）。
- **PLNR.CORE.2 ✅**：Planner desktop **21/22** 已发货（`SHIPPED.md`）；遗留 **PLNR.CORE.2** = Insight P-1。

**为什么 PORT.GROWTH.4b-M 升至 Tier 2**

- PORT.GROWTH.4 三卡已在生产（`20260708190000` + `PortalTodaySummary.svelte`）。
- Music 扩卡无阻塞：`music.play_events` 在 v6 RPC 已消费（`has_recent_complete` / `has_replay`）。
- 投入 ~1d，用户打开 Portal 即可感知跨站价值。

**为什么 MUSC.UI.2 并列 Tier 2**

- Music 仅有 `test:sw:full`（21/21 SW）；**无 UI E2E** 保护 `play_events` 写入与推荐面。
- PORT.GROWTH.4b-M 读 `play_events` → Music 管道回归越重要。

**CI 复利（仍未做）**

- `.github/workflows/ci.yml` 仅 `design-catalog` 用 Playwright；**四生产站 UI E2E 未进 CI**。
- 建议：Finance `qa:ia-routes`（需 secrets）+ Planner desktop project + Music 新 script。

---

## Tier 3 — 条件跨站（**GYMS.EVENTS.1** / **INTG.EVENTS.1b**）

（原 Tier 4；PORT.GROWTH.4b-M 已升至 Tier 2）

**天花板高，但触发条件严**

| 就绪                                                                 | 缺口                                               |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| `markSessionEnded()` 在 `FocusSession.svelte` / `SummaryView.svelte` | `events.ts` 仅 `finance.bill_due`                  |
| Planner `lifeEventsInbox.js` 消费模式可复用                          | 需 migration 触发器 + Zod `fitness.workout_logged` |
| outbox smoke 脚本可扩                                                | **须每天用 Fitness + Planner**                     |

契约测试已用 `fitness.workout_logged`（`packages/contracts/scripts/events.test.mjs`），runtime 未接。

---

## 各 App「若只做一件事」

| App         | 首选        | 次选         | 原因                              |
| ----------- | ----------- | ------------ | --------------------------------- |
| **Finance** | **FINC.CORE.3**    | CI 接线 FINC.CORE.0 | 信任 > 自动化                     |
| **Planner** | **PLNR.CORE.2**    | PLNR.CORE.3 GoTrue  | PLNR.CORE.2 ✅；Insight 为剩余项        |
| **Portal**  | **PORT.GROWTH.4b-M** | PORT.GROWTH.8         | 复制已验证 RPC                    |
| **Music**   | **MUSC.UI.2**    | MUSC.PIPE.5         | E2E 护 play_events 管道           |
| **Fitness** | **GYMS.CORE.0**   | GYMS.EVENTS.1        | 先稳住 E2E；事件链等有场景        |
| **Home**    | **HOME.PROJ.7**    | HOME.EXPER.0 README  | 多项目 local 日用价值 > Portal 卡 |

---

## 修订执行顺序（相对 hub Wave A/B）

```text
Phase 0 — 信任（~2–3d）
  FINC.CORE.3  Safe-to-spend / Scenarios / Spend 抽屉对齐 + 回归测试

Phase 1 — 快赢 + 防回归（可并行，~2–3d）
  PORT.GROWTH.4b-M  Portal Music 第四卡
  MUSC.UI.2     Music UI E2E
  PLNR.CORE.2     Planner Insight E2E（P-1）

Phase 1b — CI 复利（~1d，可与 Phase 1 并行）
  Finance qa:ia-routes + Planner desktop 进 ci.yml（secrets 文档化）

Phase 2 — 基础设施收尾
  GYMS.CORE.0  Fitness E2E 配置（端口 5190 已修，确认 CI 路径）

Phase 3 — 条件跨站（~3–5d，有场景再开）
  GYMS.EVENTS.1 + PLNR.CORE.5 + contracts 扩 schema
  PORT.GROWTH.4b-H（先 HOME.PROJ.6a）

已完成（2026-07-09）
  FINC.CORE.0 route smoke 22/22 ✅ · PLNR.CORE.2 desktop 21/22 ✅
```

---

## 明确降级 / 纠正（相对初版脑暴）

| 项             | 修正                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **MUSC.PIPE.4**       | `recommendations.js` 已在 production 展示有 `reasons` 的 pick；debug 仅控制「是否显示全部候选」。优先 **MUSC.PIPE.5** 验证 v6 行为分效果。 |
| **DSGN.CATALOG.6**       | design-catalog a11y ✅ 已发货；后续为 **DSGN.CATALOG.7** production primitive（hub §Parked）。                                                |
| **PORT.GROWTH.4b 整包** | Music 与 Home 拆开；Home 依赖 HOME.PROJ.6a，勿与 Music 同批估时。                                                                          |
| **FINC.CORE.0**       | 代码已落地（`ia-qa-auth.mjs`）；勿重复估 0.5–1d 开发，仅 CI/文档收尾。                                                              |
| **PLNR.CORE.2**      | ✅ 已发货；Planner 下一项为 **PLNR.CORE.2**（P-1）。                                                                                       |

---

## 相关文档

- [`apps/finance.md`](./apps/finance.md) · [`apps/portal.md`](./apps/portal.md)
- [`GROWTH.md`](./GROWTH.md) · [`qa/e2e-issues.md`](../qa/e2e-issues.md)
- Finance audit：`apps/finance/docs/pto-audit-export/`
