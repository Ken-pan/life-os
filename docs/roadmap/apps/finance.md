# Finance Roadmap

**URL：** [finance.kenos.space](https://finance.kenos.space) · **Workspace：** `finance-os`
**扩展：** `apps/finance/extension` · **Audit：** `apps/finance/docs/pto-audit-export/`
**订单审核 handoff：** [`../../../apps/finance/docs/merchant-order-audit/DOWNSTREAM_HANDOFF_v1_1.md`](../../../apps/finance/docs/merchant-order-audit/DOWNSTREAM_HANDOFF_v1_1.md)

## 一句话

月度推演 + 历史交易；**`life_events` 生产端**（`finance.bill_due`）；**Amazon / Best Buy / Target 商品级 enrichment** 已有管道，下一步是 **支出审核产品化（FINC.PURCHASE.6）**。

## 当前能力（生产）

| 域              | 状态 | 要点                                                                                         |
| --------------- | ---- | -------------------------------------------------------------------------------------------- |
| 月度引擎        | ✅   | STS / Spend — `buildAugmentedDailyOutlook()` 统一口径（**FINC.CORE.3**）                     |
| 历史/预测/决策  | ✅   | 交易 · 图表 · Decision Studio                                                                |
| Chrome 扩展     | ✅   | DOM → `ExtensionSyncBridge`                                                                  |
| Integration     | ✅   | SSO · outbox · Portal PORT.GROWTH.4                                                          |
| FINC.GROWTH.1   | ✅   | 主站 toast；**FINC.SYNC.1b** popup last sync + retry ✅（2026-07-13, 18/18）                  |
| E2E             | ✅   | `qa:ia-nav` 31/31 · `qa:ia-routes` 22/22 ✅（FINC.CORE.0）                                   |
| 订单 enrichment | 🟡   | `purchase_enrichment` 三商家；History 可展示 line items；**168 笔待审核**（read model v1.1）；新购买检测→定向抓单→匹配标注一键脚本（`55749137c`，2026-07-16） |

### 订单 enrichment 现状（2026-07-07 handoff）

| source      | DB enriched | clean 子集 | review queue | 说明                           |
| ----------- | ----------: | ---------: | -----------: | ------------------------------ |
| **target**  |          82 |         81 |            1 | 主数据集；in_store Circle Card |
| **amazon**  |         141 |         20 |          121 | 仅高置信策展子集可进产品       |
| **bestbuy** |          50 |          4 |           46 | 小样本；v1.3 cleanup 未批准    |

**UI 组件：** `HistoryLedgerRow` · `PurchaseEnrichmentBlock` · `PurchaseCoverageCard` · `MerchantOrderCatalogSection`

**显示状态：** `clean_enriched` · `matched_review` · `return_refund` · `merchant_only` — `purchaseEnrichmentDisplay.ts`

## Next（按 ROI）

| ID              | 主题                                | ROI | 桶      | 投入   | Agent                    | 验收                                     | Hub   |
| --------------- | ----------------------------------- | --- | ------- | ------ | ------------------------ | ---------------------------------------- | ----- |
| **FINC.PURCHASE.6.a**  | **支出审核 closure QA**（Confirm/Reject/Undo） | 🔥  | Product | 0.2d（仅 owner） | **Ken 登录态** | anon revoke ✅ · Review 过滤拆分 ✅ · **agent 侧 closure 护栏 ✅**（stale/timeout 反馈修复 + Confirm→Undo 边界 10/10 · 单测 **127**）；**剩纯 owner gate**：真机 Confirm→Undo · 双 JWT RLS 拒绝 · 视觉基线 | §Now |
| **FINC.PURCHASE.6b** | 退款闭环：`returnInfo` · 关联负向 txn · 处理状态 | ◆ | Product | 1–2d | Codex | 退货订单显示关联退款交易；纯 finance 域，6.a 之后加深每日账本真源 | — |
| ~~**FINC.SYNC.1b**~~ | ~~扩展 popup last sync + 重试~~ ✅ 已发货 2026-07-13 | ◆ | Growth | — | Codex | popup timestamp + 失败原因 + retry；`extensionSyncHealth.test.js` 18/18 | ✅ |
| **FINC.GROWTH.4**    | 账单任务处理后 Portal 角标消减      | ◆   | Growth  | 1d     | Codex                    | pending 与 UI 一致                       | —     |
| **FINC.IMPORT.5**    | History CSV 最小导入                | ○   | Product | 3–5d   | Codex                    | `/review/import` 可上传                  | —     |

### 复利视角 · 接下来 ROI 排序（2026-07-17）

> 透镜：[`../COMPOUND.md`](../COMPOUND.md)（使用 × 开发 × 决策）。Finance 在框架里是**使用侧「信任数字」曲线的起点**，也是 finance 跨 OS 消费（MCP「查结余/本月支出」）的**源头可信度**。

| 序 | 事项 | 复利依据 | 归属 |
| -- | ---- | -------- | ---- |
| **1** | **FINC.PURCHASE.6.a owner 真机 closure**（Confirm→Undo · 双 JWT · 视觉） | 使用复利最高：解锁 finance 作为可信跨 OS 源头。**agent 增量已封顶**（逻辑+护栏落地），剩下**只有 Ken 能做**的 0.2d 真机 gate | **Ken** |
| **2** | **PLAT.MCP.0** 抽共享 MCP 鉴权 | 开发复利满分：Home/Planner 两消费者已达提取门槛，抽完 Finance/Fitness MCP 近零成本。**全局最高复利下一步**（见 hub POTENTIAL） | 跨 app（非本卷；共享包） |
| **3** | **FINC.PURCHASE.6b** 退款闭环 | 使用复利：让「退货/退款后怎么处理」在账本闭环；纯 finance 域，**agent 可推进的最高 ROI finance 工作** | Codex |
| **4** | **FINC.GROWTH.4** Portal 角标一致 | 使用复利：Portal 是每日放大器，角标一致强化「信任数字一致」信号；依赖 Planner↔Portal 接线 | Codex |
| 后移 | FINC.IMPORT.5（加表面积、日用触点弱）· FINC.PURCHASE.6c（review 负担已降 71%，边际递减） | 线性/边际递减 | — |

**一句话：** ROI 最高的 6.a 已只剩 **Ken 的真机 gate**（agent 做不了）；**agent 侧下一刀 = FINC.PURCHASE.6b 退款闭环**；全局最高复利仍是 **PLAT.MCP.0**（跨 app）。

### FINC.PURCHASE.6 — 支出审核（分阶段）

**产品问题：** 信用卡只显示商家名（如 `AMAZON MARKETPLACE`），用户需要知道**买了什么**、**订单是否匹配正确**、**退货/退款后如何处理**。

**2026-07-17 复核：** 产品合同已 PASS；数据层不再 BLOCKED——association/decision migration 已部署生产、3 RPC 已往返验证、matcher precedence 与 UI Confirm/Reject/Undo 均已提交。仍禁止直接修改 `purchase_enrichment` JSONB；开放范围只剩登录态/RLS/视觉 closure QA。详见 [`FP6_PURCHASE_REVIEW.md`](../../../apps/finance/docs/FP6_PURCHASE_REVIEW.md)。

| 子项      | 范围                                                                     | 验收                                                |
| --------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| **FINC.PURCHASE.6**  | Discovery：产品语义 · 数据审计 · QA 静态准备                               | ✅ PASS |
| **FINC.PURCHASE.6.a** | Data foundation + History 确认/驳回/Undo UI                              | 🟡 engine/RPC/matcher/UI ✅ · anon revoke ✅ · Review=`matched_review` only ✅ · **closure 护栏 ✅**（stale/timeout 反馈修复 + owner Confirm→Undo 边界 10/10）；剩 owner 真机、双 JWT、视觉 |
| **FINC.PURCHASE.6b** | 后续处理：`returnInfo` · 关联退款 txn · 用户备注/处理状态                | 退货订单显示关联负向交易                            |
| **FINC.PURCHASE.6c** | Amazon/BBY 策展批次（读 `review_queue_v1_1`，**非** broad apply）        | handoff v1.2/v1.3 增量 clean 行进 DB                |

**已完成：** FINC.CORE.3 STS / reserve / Spend 口径统一 · FINC.PURCHASE.6 产品合同 · 6.a 数据地基 / matcher / UI 实现 · **6.a closure 护栏**（2026-07-17：修复 409 stale / 超时反馈从不渲染的缺陷，把 owner Confirm→Undo 编排抽进可测的 `purchaseReviewClient`，边界测试 10/10 —— [`FP6_CLOSURE_QA_2026-07-17.md`](../../../apps/finance/docs/FP6_CLOSURE_QA_2026-07-17.md)）。Finance app 当前单测 **127/127**；purchase decision engine 在共享 `finance-core` 有独立 18/18。

### 实现锚点

| ID   | 文件 / 位置                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FINC.CORE.3 | `src/engine/metrics.ts` · `computeSafeToSpend`                                                                                                                            |
| FINC.GROWTH.4 | Planner `mark processed` ↔ Portal `PortalAppBar` pending 计数                                                                                                           |
| FINC.PURCHASE.6 | `packages/finance-core/src/engine/purchaseEnrichment*.ts` · `HistoryView.svelte` · `HistoryLedgerRow.svelte` · `scripts/link-purchase-orders.mjs` · `docs/merchant-order-audit/` |

## 验收命令

```bash
cd apps/finance
npm run dev -- --port 5180
npm run qa:ia-nav          # 需 .env.local session
npm run qa:ia-routes        # 22/22 authenticated（FINC.CORE.0 ✅）
npm run test                # vitest（含 purchaseEnrichmentDisplay.test.ts）
npm run qa:amazon-enrichment  # 截图 QA（有 enrichment 时）
node scripts/audit-purchase-data.mjs --source all
```

## Parked / Not doing

**FINC.CORE.2** 第二扩展源 · Review queue 全量 UI（已并入 **FINC.PURCHASE.6**）· `ui-react`（hub ✗）· broad apply 全量订单（handoff 明确禁止）

## 集成

```text
finance_expected_occurrences ──trigger──► finance.bill_due ──► Planner
portal_today_summary ──read──► finance_transactions 月收支
extension / link-purchase-orders ──► purchase_enrichment ──► History 支出审核 (FINC.PURCHASE.6)
enrich-latest-purchases（检测新购买 → WST 定向抓单 → 最优匹配 → 标注）──► 同上，一条命令闭环
```
