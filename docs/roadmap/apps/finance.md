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
| 订单 enrichment | 🟡   | `purchase_enrichment` 三商家；History 可展示 line items；**168 笔待审核**（read model v1.1） |

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
| **FINC.PURCHASE.6**  | **支出审核**（商品明细 + 后续处理） | 🔥  | Product | 3–5d   | **Claude Fable** · Codex | 审核队列可操作；商品级主路径；退货链可见；**6.a 数据地基 slice 1 已落地（引擎 14/14 + 迁移成文，2026-07-13）** | §Now  |
| ~~**FINC.SYNC.1b**~~ | ~~扩展 popup last sync + 重试~~ ✅ 已发货 2026-07-13 | ◆ | Growth | — | Codex | popup timestamp + 失败原因 + retry；`extensionSyncHealth.test.js` 18/18 | ✅ |
| **FINC.GROWTH.4**    | 账单任务处理后 Portal 角标消减      | ◆   | Growth  | 1d     | Codex                    | pending 与 UI 一致                       | —     |
| **FINC.IMPORT.5**    | History CSV 最小导入                | ○   | Product | 3–5d   | Codex                    | `/review/import` 可上传                  | —     |

### FINC.PURCHASE.6 — 支出审核（分阶段）

**产品问题：** 信用卡只显示商家名（如 `AMAZON MARKETPLACE`），用户需要知道**买了什么**、**订单是否匹配正确**、**退货/退款后如何处理**。

**Discovery 收口（2026-07-11）：** 产品合同 **PASS** · 数据层 **BLOCKED** · section **CONDITIONAL PASS** — 详见 [`FP6_PURCHASE_REVIEW.md`](../../../apps/finance/docs/FP6_PURCHASE_REVIEW.md)。**不得在现有 `purchase_enrichment` JSONB 上直接实现 Confirm/Reject/Undo。**

| 子项      | 范围                                                                     | 验收                                                |
| --------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| **FINC.PURCHASE.6**  | Discovery：产品语义 · 数据审计 · QA 静态准备                               | **CONDITIONAL PASS** — 实现未授权                    |
| **FINC.PURCHASE.6.a** | Data foundation + History 确认/驳回/Undo UI                              | **BLOCKED** — 需 association/decision migration 先行 |
| **FINC.PURCHASE.6b** | 后续处理：`returnInfo` · 关联退款 txn · 用户备注/处理状态                | 退货订单显示关联负向交易                            |
| **FINC.PURCHASE.6c** | Amazon/BBY 策展批次（读 `review_queue_v1_1`，**非** broad apply）        | handoff v1.2/v1.3 增量 clean 行进 DB                |

**已完成：** FINC.CORE.3 STS / reserve / Spend 口径统一，`outlook.test.ts` 40 pass · FINC.PURCHASE.6 产品合同与数据 blocker 文档化。

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
```
