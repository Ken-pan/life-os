# 潜力研判（2026-07-09 历史快照）

> **状态：已归档研判。** 本文保留当时的 ROI 证据与决策过程，不再代表当前排序。当前 Now / Next 只看 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)；**2026-07-10 复核**后产品优先级为 **P-SCHED-0 → P-MOVE-BLOCK/UI → FT-P5**；Agent 路由见 [`AGENT_WORKSTREAMS.md`](./AGENT_WORKSTREAMS.md)。

> **用途：** 回答「如果只做一两件事，哪里 ROI 最高？」
> **Hub 排期真源：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now · §Next · §推荐执行顺序
> **分卷细节：** [`apps/`](./apps/README.md)

## 结论（TL;DR）

```text
① ~~G-P4b-H~~        ✅ 2026-07-09
```

**已完成（2026-07-09 Phase 6）：** H-P6a · G-P4b-H — 见 [`SHIPPED.md`](./SHIPPED.md)

**已完成（早前 2026-07-09）：** F-P0 route smoke 22/22 · M-P2 qa-ui-flow 15/15 · QA-P2 → P-P2 22/22

**不建议现在投入：** Home H-P4 全量云同步 · G-P4b-H（需 H-P6a）· M-P4 单独做（优先 **M-P5**）

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

## Tier 1 — 信任锚点（Finance **F-P3**）

**为什么潜力最大**

- Finance 是 Portal **G-P4** 月结余数据源（`portal_today_summary` → `finance_transactions`）。
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

## Tier 2 — 快赢体感 + 防回归（**G-P4b-M** · **M-P2** · **CI**）

**相对初版研判的调整（2026-07-09 二次检索）**

- **F-P0 ✅**：`ia-route-smoke.mjs` 已用 `ia-qa-auth.mjs` 登录 + `injectLifeOsSession`；本地 **22/22**（见 `e2e-issues.md` FN-1）。hub 待移入 Shipped；**剩余工作 = CI 接线**（可选 `F-P0b`）。
- **QA-P2 ✅**：Planner desktop **21/22** 已发货（`SHIPPED.md`）；遗留 **P-P2** = Insight P-1。

**为什么 G-P4b-M 升至 Tier 2**

- G-P4 三卡已在生产（`20260708190000` + `PortalTodaySummary.svelte`）。
- Music 扩卡无阻塞：`music.play_events` 在 v6 RPC 已消费（`has_recent_complete` / `has_replay`）。
- 投入 ~1d，用户打开 Portal 即可感知跨站价值。

**为什么 M-P2 并列 Tier 2**

- Music 仅有 `test:sw:full`（21/21 SW）；**无 UI E2E** 保护 `play_events` 写入与推荐面。
- G-P4b-M 读 `play_events` → Music 管道回归越重要。

**CI 复利（仍未做）**

- `.github/workflows/ci.yml` 仅 `design-catalog` 用 Playwright；**四生产站 UI E2E 未进 CI**。
- 建议：Finance `qa:ia-routes`（需 secrets）+ Planner desktop project + Music 新 script。

---

## Tier 3 — 条件跨站（**FT-P1** / **I-P1.5b**）

（原 Tier 4；G-P4b-M 已升至 Tier 2）

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
| **Finance** | **F-P3**    | CI 接线 F-P0 | 信任 > 自动化                     |
| **Planner** | **P-P2**    | P-P3 GoTrue  | QA-P2 ✅；Insight 为剩余项        |
| **Portal**  | **G-P4b-M** | G-P8         | 复制已验证 RPC                    |
| **Music**   | **M-P2**    | M-P5         | E2E 护 play_events 管道           |
| **Fitness** | **FT-P0**   | FT-P1        | 先稳住 E2E；事件链等有场景        |
| **Home**    | **H-P7**    | H-P0 README  | 多项目 local 日用价值 > Portal 卡 |

---

## 修订执行顺序（相对 hub Wave A/B）

```text
Phase 0 — 信任（~2–3d）
  F-P3  Safe-to-spend / Scenarios / Spend 抽屉对齐 + 回归测试

Phase 1 — 快赢 + 防回归（可并行，~2–3d）
  G-P4b-M  Portal Music 第四卡
  M-P2     Music UI E2E
  P-P2     Planner Insight E2E（P-1）

Phase 1b — CI 复利（~1d，可与 Phase 1 并行）
  Finance qa:ia-routes + Planner desktop 进 ci.yml（secrets 文档化）

Phase 2 — 基础设施收尾
  FT-P0  Fitness E2E 配置（端口 5190 已修，确认 CI 路径）

Phase 3 — 条件跨站（~3–5d，有场景再开）
  FT-P1 + P-P5 + contracts 扩 schema
  G-P4b-H（先 H-P6a）

已完成（2026-07-09）
  F-P0 route smoke 22/22 ✅ · QA-P2 desktop 21/22 ✅
```

---

## 明确降级 / 纠正（相对初版脑暴）

| 项             | 修正                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **M-P4**       | `recommendations.js` 已在 production 展示有 `reasons` 的 pick；debug 仅控制「是否显示全部候选」。优先 **M-P5** 验证 v6 行为分效果。 |
| **D-P6**       | design-catalog a11y ✅ 已发货；后续为 **D-P7** production primitive（hub §Parked）。                                                |
| **G-P4b 整包** | Music 与 Home 拆开；Home 依赖 H-P6a，勿与 Music 同批估时。                                                                          |
| **F-P0**       | 代码已落地（`ia-qa-auth.mjs`）；勿重复估 0.5–1d 开发，仅 CI/文档收尾。                                                              |
| **QA-P2**      | ✅ 已发货；Planner 下一项为 **P-P2**（P-1）。                                                                                       |

---

## 相关文档

- [`apps/finance.md`](./apps/finance.md) · [`apps/portal.md`](./apps/portal.md)
- [`GROWTH.md`](./GROWTH.md) · [`qa/e2e-issues.md`](../qa/e2e-issues.md)
- Finance audit：`apps/finance/docs/pto-audit-export/`
