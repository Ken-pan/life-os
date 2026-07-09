# Finance Roadmap

**URL：** [finance.kenos.space](https://finance.kenos.space) · **Workspace：** `finance-os`
**扩展：** `apps/finance/extension` · **Audit：** `apps/finance/docs/pto-audit-export/`

## 一句话

月度推演 + 历史交易；**`life_events` 生产端**（`finance.bill_due`）；Safe-to-spend 有 **Critical** 公式债。

## 当前能力（生产）

| 域             | 状态 | 要点                                                     |
| -------------- | ---- | -------------------------------------------------------- |
| 月度引擎       | ✅   | STS / Spend — `buildAugmentedDailyOutlook()` 统一口径（**F-P3**） |
| 历史/预测/决策 | ✅   | 交易 · 图表 · Decision Studio                            |
| Chrome 扩展    | ✅   | DOM → `ExtensionSyncBridge`                              |
| Integration    | ✅   | SSO · outbox · Portal G-P4                               |
| F-P1           | ✅   | 主站 toast；popup last sync 🟡                           |
| E2E            | ✅   | `qa:ia-nav` 31/31 · `qa:ia-routes` 22/22 ✅（F-P0）      |

## Next（按 ROI）

| ID               | 主题                                | ROI | 桶      | 投入   | 验收                      | Hub      |
| ---------------- | ----------------------------------- | --- | ------- | ------ | ------------------------- | -------- |
| **F-P3** {#f-p3} | STS 与专款 reserve / Spend 抽屉对齐 | ✅  | Core    | —      | `outlook.test.ts` 40 pass | §Shipped |
| **F-P1b**        | 扩展 popup last sync + 重试         | ◆   | Growth  | 0.5–1d | popup 可见 timestamp      | —        |
| **F-P4**         | 账单任务处理后 Portal 角标消减      | ◆   | Growth  | 1d     | pending 与 UI 一致        | —        |
| **F-P5**         | History CSV 最小导入                | ○   | Product | 3–5d   | `/review/import` 可上传   | —        |

### 实现锚点

| ID   | 文件 / 位置                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F-P3 | `src/engine/metrics.ts` · `computeSafeToSpend`；证据 `docs/pto-audit-export/08_TEST_AND_QA_COVERAGE.md`（STS / Spend Impact Critical） |
| F-P4 | Planner `mark processed` ↔ Portal `PortalAppBar` pending 计数                                                                          |

## 验收命令

```bash
cd apps/finance
npm run dev -- --port 5180
npm run qa:ia-nav          # 需 .env.local session
npm run qa:ia-routes        # 22/22 authenticated（F-P0 ✅）
npm run test                # vitest（含 engine 单测）
```

## Parked / Not doing

**F-P2** 第二扩展源 · **F-P8** Review queue 全量 UI · `ui-react`（hub ✗）

## 集成

```text
finance_expected_occurrences ──trigger──► finance.bill_due ──► Planner
portal_today_summary ──read──► finance_transactions 月收支
```
