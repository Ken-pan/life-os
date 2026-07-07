# Finance OS 信息架构（Information Architecture）

> **版本**：2026-07-06
> **应用路径**：`apps/finance`
> **技术栈**：React + Vite SPA（非 SvelteKit 文件路由）
> **路由实现**：Hash 路由（`src/lib/appRoute.ts` + `AppShell.tsx`）

---

## 1. 产品定位与 IA 闭环

Finance OS 是个人财务驾驶舱，信息架构按用户心智分为五层：

| 层级         | 导航分组         | 核心问题                                          |
| ------------ | ---------------- | ------------------------------------------------- |
| **日常决策** | 日常             | 今天能花多少？本月现金怎么排？                    |
| **资产全景** | 资产             | 我有多少钱？投资配置如何？                        |
| **真实数据** | 收支             | 历史花了什么？固定/大额收支在哪登记？数据可信吗？ |
| **前瞻规划** | 前瞻             | 5–30 年后会怎样？重大选择怎么比？                 |
| **系统配置** | 设置（独立底栏） | 账户、假设参数、备份与设备                        |

数据流闭环：**设置（账户/假设）→ 记录/审查（真实数据）→ 今日/总览（短期决策）→ 预测/决策（长期规划）**。

---

## 2. 路由与导航机制

### 2.1 Hash 路由格式

| 类型         | 格式                | 示例                                          |
| ------------ | ------------------- | --------------------------------------------- |
| 一级 Tab     | `#/{tab}`           | `#/today`、`#/overview`                       |
| 二级 Section | `#/{tab}/{section}` | `#/history/insights`、`#/review/import`       |
| Query 参数   | `?snapshot={id}`    | 仅 **资产配置** 页，选中持仓快照（不进 hash） |
| 默认首页     | 空 hash             | 解析为 `#/today`                              |

**跨页跳转 API**（`AppShell.GoTab`）：

- `section`：直达 Hub 子页
- `ledgerSearch`：预填「记录·洞察」流水搜索词
- `focusEventId`：高亮「记录·大额收支」某条目

### 2.2 一级 Tab 清单（8 个）

| ID         | 中文名     | 默认 Section | 有 URL 二级 Tab                   |
| ---------- | ---------- | ------------ | --------------------------------- |
| `today`    | 今日       | —            | 否                                |
| `overview` | 总览       | —            | 否                                |
| `stocks`   | 资产配置   | —            | 否                                |
| `history`  | 记录       | `insights`   | 是（3 个）                        |
| `review`   | 审查       | `import`     | 是（5 个）                        |
| `forecast` | 预测       | `forecast`   | 是（2 个）                        |
| `decision` | 决策工作室 | —            | 否（组件内 3 Tab，**未进 hash**） |
| `settings` | 设置       | `accounts`   | 是（3 个）                        |

源码：`src/lib/appRoute.ts`

### 2.3 桌面侧栏分组

```
Finance OS
├── 【日常】
│   └── 今日
├── 【资产】
│   ├── 总览
│   └── 资产配置
├── 【收支】
│   ├── 记录
│   └── 审查
├── 【前瞻】
│   ├── 预测
│   └── 决策工作室
└── 【底部独立】
    └── 设置
```

### 2.4 移动端底栏（4 + 更多）

与 Planner OS 对齐：**4 个 Primary Tab +「更多」Sheet**。

| 底栏常驻（Primary） | 放入「更多」 |
| ------------------- | ------------ |
| 今日                | 资产配置     |
| 总览                | 审查         |
| 记录                | 决策工作室   |
| 预测                | 设置         |

当路由为 `stocks` / `review` / `decision` / `settings` 时，底栏 **「更多」** 高亮（`isMoreNavActive`）。

源码：`src/lib/nav.ts`、`AppShell.useNavConfig()`

---

## 3. 准入层（非 Tab 路由）

`AuthGate` 在 `AppShell` 之前渲染，控制是否进入主壳：

| Phase            | 场景                            | 用户可操作                          |
| ---------------- | ------------------------------- | ----------------------------------- |
| `loading`        | 会话/数据引导中                 | 等待                                |
| `config-missing` | 缺 Supabase 环境变量            | 查看配置说明                        |
| `signed-out`     | 未登录                          | 邮箱密码登录                        |
| `device-limit`   | 超出设备槽位（1 电脑 + 1 手机） | 管理/退出设备                       |
| `ready`          | 就绪                            | 进入 `FinanceProvider` → `AppShell` |

**复杂度**：中等 — 涉及 Supabase Auth、设备授权 RPC、数据 bootstrap。

---

## 4. 一级 Tab 详解

### 4.1 今日 `today`

| 属性         | 值              |
| ------------ | --------------- |
| **路由**     | `#/today`       |
| **二级 Tab** | 无              |
| **主组件**   | `TodayView.tsx` |
| **复杂度**   | **复杂** ★★★★☆  |

**产品职责**：短期现金决策中心 — 「现在能花多少」+ 「本月现金怎么排」。

#### 功能模块

| 模块                     | 功能                                                     | 数据/引擎依赖                                     |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------- |
| **Safe-to-Spend 主 KPI** | 未来 30 天现金最低谷 − 缓冲 − 目标预留                   | `useDashboard`、`computeSafeToSpend`、`daily.ts`  |
| **储蓄计划卡**           | 展示每月可储蓄能力                                       | `MonthlySavingCapacity`                           |
| **AI 简报卡**            | 基于财务快照的 AI 摘要（Netlify Function）               | `AiBriefCard`                                     |
| **现金头寸卡**           | 账面/已清算/在途现金、对账状态、一键对齐余额             | `reconciliation.ts`、`resolveCashPositionUiState` |
| **待确认账单**           | Timeline 预期 occurrence 确认/跳过                       | `timeline` store、`ExpectedOccurrence`            |
| **现金日历**             | 议程视图 / 月历视图双模式；月分页；日余额曲线            | `projectDaily`、`DayEvent`                        |
| **本月账单侧栏**         | 当月待付项汇总                                           | timeline                                          |
| **应急储备回退提示**     | 储备不足时的引导                                         | goals + projection                                |
| **值得做的事**           | Dashboard 行动收件箱（按 severity 过滤，最多展示若干条） | `buildActions`、`actions.ts`                      |
| **快捷工具**             | 试算消费、跳转大额收支/总览                              | `GoTab`                                           |
| **FAB**                  | 「记一笔」→ `TxnEntryDrawer`                             | transactions store                                |

#### 交互与跳转

- 日历 occurrence 可跳转：大额收支 / 固定收支 / 审查导入
- 账户 stale（>30 天未更新）时全局 banner + 行动项提示
- 空状态引导：添加账户 → 设置；添加固定收支 → 记录·固定

#### 复杂度说明

聚合 daily projection、timeline、reconciliation、transactions、dashboard actions 等多引擎；日历双视图 + 多卡片联动；是产品核心决策面，状态与口径最多。

---

### 4.2 总览 `overview`

| 属性         | 值                 |
| ------------ | ------------------ |
| **路由**     | `#/overview`       |
| **二级 Tab** | 无                 |
| **主组件**   | `OverviewView.tsx` |
| **复杂度**   | **中等** ★★★☆☆     |

**产品职责**：净资产与长期目标的全景只读仪表盘。

#### 功能模块

| 模块              | 功能                                                     |
| ----------------- | -------------------------------------------------------- |
| **4 KPI 卡**      | 净资产、流动现金、投资资产、Safe-to-Spend                |
| **持仓摘要卡**    | 有快照时展示；点击跳转资产配置（`HoldingsOverviewCard`） |
| **STS 分解明细**  | 最低谷 / 缓冲 / 目标预留 / 应急储备等分项                |
| **变动驱动因素**  | 本月 vs 下月 baseline 对比（收入/支出/投资变化）         |
| **现金流瀑布**    | 月度现金流入流出可视化                                   |
| **目标 ETA 列表** | 各财务目标预计达成月份                                   |
| **近期大额收支**  | `UpcomingFlows` — 未来一次性事件预览                     |
| **试算消费**      | 按钮打开 `SpendImpactDrawer`                             |
| **FAB**           | 「记一笔」                                               |

#### 空状态

无账户且无固定收支时：引导添加账户（设置）或添加固定收支（记录·固定）。

#### 复杂度说明

以 projection/dashboard **只读展示**为主，CRUD 少；但 KPI 口径与 reconciliation、holdings 挂钩，卡片间有跨 Tab 跳转。

---

### 4.3 资产配置 `stocks`

| 属性         | 值                                   |
| ------------ | ------------------------------------ |
| **路由**     | `#/stocks`，可选 `?snapshot={id}`    |
| **二级 Tab** | 无（页面内 `<details>` 折叠区）      |
| **主组件**   | `StocksView.tsx` + `stocks/*` 子组件 |
| **复杂度**   | **复杂** ★★★★★                       |

**产品职责**：证券持仓监控、组合分析、快照管理与扩展同步。

#### 功能模块

| 模块               | 子组件                                  | 功能                                                         |
| ------------------ | --------------------------------------- | ------------------------------------------------------------ |
| **组合 KPI**       | `StocksSummaryKpis`                     | 总市值、当日涨跌、未实现盈亏等                               |
| **资产配置**       | `PortfolioAllocationSection`            | 资产类别饼图、目标 vs 实际偏离                               |
| **主题集中度**     | —                                       | 按行业/主题聚合集中度分析                                    |
| **配置趋势**       | —                                       | 跨快照的资产配置变化                                         |
| **投资顾问**       | `InvestmentAdvisor`                     | 基于持仓 + 储蓄能力的再平衡建议                              |
| **持仓监视列表**   | `HoldingsWatchlist`                     | 排序、迷你价格路径、点击打开详情                             |
| **实时报价**       | `useHoldingsLive` + `LiveStatusBar`     | 轮询报价；可暂停/手动刷新                                    |
| **单股详情**       | `PositionDrawer`                        | 单只股票详情、历史价格                                       |
| **快照管理**       | `SnapshotPicker`                        | 选择/删除历史快照                                            |
| **快照对比**       | `SnapshotComparePanel`                  | 两期快照 diff                                                |
| **Robinhood 种子** | `createBundledRobinhoodSnapshot`        | 内置静默种子快照                                             |
| **扩展同步**       | `ExtensionSyncBridge`                   | Chrome 扩展 postMessage：Robinhood / Fidelity / Rocket Money |
| **快照导入**       | `ImportSnapshotCard`（设置·账户也可达） | 从扩展或文件导入持仓                                         |

#### 数据模型

- 独立 holdings 引擎（`engine/holdings*.ts`、`holdingsPortfolio.ts`）
- Supabase 表：`holdings_snapshots`、`holdings_positions`、价格 trail / daily candle
- 快照与 live 价格 trail 合并展示

#### 复杂度说明

实时行情、快照版本管理、组合分析、浏览器扩展同步、多 drawer；是 Finance OS 中**独立子域**最重的页面之一。

---

### 4.4 记录 `history`

| 属性       | 值                                               |
| ---------- | ------------------------------------------------ |
| **路由**   | `#/history/{section}`，默认 `#/history/insights` |
| **容器**   | `RecordsView.tsx` → `HorizontalTabs`             |
| **复杂度** | **复杂** ★★★★★（三个子页数据模型各异）           |

**产品职责**：真实交易洞察 + 未来现金流的结构化录入。

#### 二级 Tab 总览

| 二级 Tab | Section ID | 路由                 | 子组件               | 复杂度 |
| -------- | ---------- | -------------------- | -------------------- | ------ |
| 洞察     | `insights` | `#/history/insights` | `HistoryView`        | 复杂   |
| 固定收支 | `fixed`    | `#/history/fixed`    | `CashFlowsView`      | 中等   |
| 大额收支 | `oneoff`   | `#/history/oneoff`   | `FutureCashflowView` | 复杂   |

---

#### 4.4.1 洞察 `insights`

**复杂度**：**复杂** ★★★★☆

| 功能域                     | 具体功能                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| **交易账本（Ledger）**     | 全量交易列表；搜索；多维筛选（日期窗、类别、flow 类型、账户）；分页；行内编辑/删除 |
| **Amazon 订单 enrichment** | 检测 Amazon 交易；一键跳转筛选；Banner 提示                                        |
| **预算脉冲 KPI**           | 窗口内支出汇总、笔数、日均等                                                       |
| **分析层（可折叠）**       | 默认折叠，移动端友好                                                               |
| ↳ 趋势图                   | 月度支出时间序列                                                                   |
| ↳ 类别分析                 | 类别占比 + 进度条                                                                  |
| ↳ 商户 Top N               | 按商户聚合排名                                                                     |
| ↳ 周期性检测               | 启发式识别 recurring 商户                                                          |
| ↳ 计划 vs 真实             | `PlanReality` — 固定计划月支出 vs 实际消费对比                                     |
| **跨页搜索**               | 支持 `GoTab(..., { ledgerSearch })` 预填搜索                                       |
| **FAB**                    | 「记一笔」→ `TxnEntryDrawer`                                                       |

**数据依赖**：Supabase `transactions`；客户端统计引擎（`computeStatistics`、`computeRecurring` 等）。

---

#### 4.4.2 固定收支 `fixed`

**复杂度**：**中等** ★★★☆☆

| 功能               | 说明                                            |
| ------------------ | ----------------------------------------------- |
| **收入/支出 CRUD** | 名称、金额、频率（月/年）、类别、起止月         |
| **发薪周期**       | 收入项支持 biweekly 等发薪模式                  |
| **排序**           | 列表排序与批量展开                              |
| **与引擎联动**     | 驱动 `precomputeFlows`、Safe-to-Spend、预测曲线 |

---

#### 4.4.3 大额收支 `oneoff`

**复杂度**：**复杂** ★★★★☆

| 功能                   | 说明                                               |
| ---------------------- | -------------------------------------------------- |
| **一次性未来事件登记** | 名称、金额、月份、类别、备注                       |
| **Timeline 关联**      | 事件进入 cash calendar / occurrence 流             |
| **归档**               | 已完成/取消事件归档                                |
| **交易匹配确认**       | 实际交易发生时确认 occurrence                      |
| **跨页聚焦**           | `GoTab(..., { focusEventId })` 高亮条目            |
| **FAB**                | 「大额收支」→ `CashflowQuickAddDrawer`（非记一笔） |

---

### 4.5 审查 `review`

| 属性       | 值                                           |
| ---------- | -------------------------------------------- |
| **路由**   | `#/review/{section}`，默认 `#/review/import` |
| **主组件** | `ReviewView.tsx`（~1000+ 行）                |
| **复杂度** | **复杂** ★★★★★                               |

**产品职责**：数据质量流水线 — 从 CSV 导入到基线校准再到账户对账。

#### 二级 Tab 总览

| 二级 Tab | Section ID  | 路由                 | 复杂度 |
| -------- | ----------- | -------------------- | ------ |
| 导入交易 | `import`    | `#/review/import`    | 复杂   |
| 审查队列 | `queue`     | `#/review/queue`     | 复杂   |
| 消费基线 | `baseline`  | `#/review/baseline`  | 中等   |
| 更新计划 | `calibrate` | `#/review/calibrate` | 复杂   |
| 账户对账 | `reconcile` | `#/review/reconcile` | 复杂   |

---

#### 4.5.1 导入交易 `import`

**复杂度**：**复杂** ★★★★★

**6 步 CSV 向导**（`WizardStep` 1–6）：

| 步骤 | 功能                                             |
| ---- | ------------------------------------------------ |
| 1    | 文件选择与校验（`validateImportFile`）           |
| 2    | CSV 解析（`parseCsv`）                           |
| 3    | 列映射建议与手动调整（`suggestColumnMapping`）   |
| 4    | 预览规范化草稿                                   |
| 5    | 规则应用与审查项生成（`normalizeAndReviewRows`） |
| 6    | 确认写入（`finalizeTransactionImport`）          |

**引擎**：`engine/realityLoop.ts`

---

#### 4.5.2 审查队列 `queue`

**复杂度**：**复杂** ★★★★☆

| 功能           | 说明                                                     |
| -------------- | -------------------------------------------------------- |
| **过滤器**     | 全部 / 高优先级 / 重复 / 转账 / 未分类 / 周期性 / 已解决 |
| **审查项类型** | `ReviewType` — 重复、转账、未分类、周期性候选等          |
| **状态更新**   | `updateReviewItemStatus` — 确认/忽略/重分类              |
| **数据源**     | `loadReviewItems` from Supabase                          |

---

#### 4.5.3 消费基线 `baseline`

**复杂度**：**中等** ★★★☆☆

| 功能           | 说明                                             |
| -------------- | ------------------------------------------------ |
| **基线窗口**   | 多时间窗（如 3/6/12 月）消费均值                 |
| **分类均值**   | `baselineCategoryAverages` 按类别聚合            |
| **可信度标签** | `getBaselineConfidenceLabels` — 数据量不足时降信 |

---

#### 4.5.4 更新计划 `calibrate`

**复杂度**：**复杂** ★★★★☆

| 功能               | 说明                                                      |
| ------------------ | --------------------------------------------------------- |
| **校准行生成**     | `buildCalibrationRows` / `buildItemCalibrationRows`       |
| **建议动作**       | 增/减/保持 — 将真实消费反馈到 `cashFlows` / `assumptions` |
| **可投资结余变化** | 展示校准对 monthly surplus 的影响                         |
| **与 Today 联动**  | 基线数据也用于 Today 的部分提示                           |

---

#### 4.5.5 账户对账 `reconcile`

**复杂度**：**复杂** ★★★★☆

| 功能         | 说明                                        |
| ------------ | ------------------------------------------- |
| **子组件**   | `AccountReconcileView`                      |
| **断言余额** | 用户声明实际银行余额                        |
| **补差**     | 生成调整分录或更新账户                      |
| **持久化**   | 写入 Supabase；影响 `liquidCash` / STS 口径 |

---

### 4.6 预测 `forecast`

| 属性       | 值                                                 |
| ---------- | -------------------------------------------------- |
| **路由**   | `#/forecast/{section}`，默认 `#/forecast/forecast` |
| **容器**   | `ForecastHubView.tsx`                              |
| **复杂度** | **复杂** ★★★★☆                                     |

**产品职责**：长期财务曲线 + 驱动曲线的场景与目标配置。

#### 二级 Tab 总览

| 二级 Tab | Section ID  | 路由                   | 子组件          | 复杂度 |
| -------- | ----------- | ---------------------- | --------------- | ------ |
| 预测曲线 | `forecast`  | `#/forecast/forecast`  | `ForecastView`  | 复杂   |
| 长期规划 | `scenarios` | `#/forecast/scenarios` | `ScenariosView` | 复杂   |

---

#### 4.6.1 预测曲线 `forecast`

**复杂度**：**复杂** ★★★★☆

| 控制维度             | 选项                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Horizon**          | 1 / 5 / 10 / 20 / 30 年（受 `assumptions.horizonYears` 上限约束）                                                     |
| **Metric（5 种）**   | `accessible`（能动的钱）、`liquid`（流动现金）、`net-worth`（净资产）、`invested`（投资资产）、`locked`（不能动的钱） |
| **Chart 模式**       | 轨迹图（trajectory）/ 构成图（composition）                                                                           |
| **情景带**           | 保守 / 基准 / 激进（改投资回报假设）                                                                                  |
| **目标里程碑**       | 窗口内可达目标列表 + ETA                                                                                              |
| **Brokerage 税估算** | accessible 口径下资本利得税扣减说明                                                                                   |
| **对账锚点**         | 有 anchored 账户时展示 cleared/book 对照                                                                              |

**引擎**：`useProjection` → `projectMonthly` / `summarize`

---

#### 4.6.2 长期规划 `scenarios`

**复杂度**：**复杂** ★★★★☆

| 功能                | 说明                                                     |
| ------------------- | -------------------------------------------------------- |
| **情景 CRUD**       | 多情景并行管理（draft / saved / chosen / archived）      |
| **长期事件**        | 薪资变化、支出变化、伴侣分摊（`partner-contribution`）等 |
| **财务目标**        | 应急储备、专款专用 reserve、旅行/宠物/科技等自定义目标   |
| **储备策略**        | 目标分配与 monthly allocation UI                         |
| **储蓄预算 Slider** | `assumptions.savingsBudget` 调节                         |
| **与预测联动**      | 事件进入 `precomputeFlows`，改变 baseline 曲线           |

---

### 4.7 决策工作室 `decision`

| 属性             | 值                                                             |
| ---------------- | -------------------------------------------------------------- |
| **路由**         | `#/decision`                                                   |
| **URL 二级 Tab** | **无**（仅 React 组件内 state，刷新丢失子 Tab — 已知 IA 缺口） |
| **主组件**       | `DecisionStudioView.tsx`（~1400+ 行）                          |
| **复杂度**       | **复杂** ★★★★★                                                 |

**产品职责**：结构化重大财务决策 — 对比方案、保存、记录与回顾。

#### 组件内二级 Tab（未进 hash）

| Tab ID    | 中文       | 复杂度 |
| --------- | ---------- | ------ |
| `compare` | 对比       | 复杂   |
| `saved`   | 已保存方案 | 中等   |
| `log`     | 决策日志   | 中等   |

---

#### 4.7.1 对比 `compare`

**复杂度**：**复杂** ★★★★★

**8 种决策模板**（`TemplateType`）：

| 模板 ID                | 中文             | 映射 ScenarioType    |
| ---------------------- | ---------------- | -------------------- |
| `purchase`             | 一次性购买       | purchase             |
| `recurring_cost`       | 固定支出变化     | recurring_cost       |
| `cash_vs_finance`      | 全款 vs 分期     | cash_vs_finance      |
| `rent_change`          | 房租调整         | rent_change          |
| `travel`               | 旅行             | travel               |
| `career_break`         | 暂停工作         | career_break         |
| `partner_contribution` | 伴侣分摊         | partner_contribution |
| `wait_buy_later`       | 现在买 vs 以后买 | purchase             |

**工作流**：

1. 选择模板 → 填写字段（含高级字段折叠）
2. 生成临时 scenario → 预览投影 diff
3. 多方案并排对比（STS、净资产、目标延迟等）
4. 保存 / 应用 / 放弃

**引擎**：`engine/decision.ts`

---

#### 4.7.2 已保存方案 `saved`

**复杂度**：**中等** ★★★☆☆

| 功能      | 说明                                       |
| --------- | ------------------------------------------ |
| 方案列表  | 按状态筛选（草稿/已保存/已选择/已归档）    |
| 选择/应用 | 将 scenario 应用到主数据（`apply` 副作用） |
| 删除/归档 | 生命周期管理                               |

---

#### 4.7.3 决策日志 `log`

**复杂度**：**中等** ★★★☆☆

| 功能          | 说明                                         |
| ------------- | -------------------------------------------- |
| 决策记录 CRUD | 标题、状态、回顾日期、关联 scenario          |
| 状态机        | 仍在考虑 / 已选择 / 已放弃 / 已推迟 / 已回顾 |
| 搜索过滤      | 文本搜索 + 状态过滤                          |

---

### 4.8 设置 `settings`

| 属性       | 值                                                 |
| ---------- | -------------------------------------------------- |
| **路由**   | `#/settings/{section}`，默认 `#/settings/accounts` |
| **主组件** | `SettingsView.tsx`                                 |
| **复杂度** | **复杂** ★★★★☆                                     |

#### 二级 Tab 总览

| 二级 Tab | Section ID    | 路由                     | 子组件/区域    | 复杂度 |
| -------- | ------------- | ------------------------ | -------------- | ------ |
| 账户     | `accounts`    | `#/settings/accounts`    | `AccountsView` | 复杂   |
| 预测参数 | `assumptions` | `#/settings/assumptions` | 内联表单       | 中等   |
| 应用偏好 | `app`         | `#/settings/app`         | 多区块         | 复杂   |

---

#### 4.8.1 账户 `accounts`

**复杂度**：**复杂** ★★★★☆

**支持的账户类型**（`AccountType`）：

| 资产类                   | 负债类                |
| ------------------------ | --------------------- |
| checking（活期）         | credit-card（信用卡） |
| savings（储蓄）          | mortgage（房贷）      |
| hsa（HSA 医疗储蓄）      | auto-loan（车贷）     |
| brokerage（券商）        |                       |
| retirement（401k / IRA） |                       |
| property（房产）         |                       |
| other（其他）            |                       |

| 功能              | 说明                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| **CRUD**          | 增删改账户；行内编辑余额                                             |
| **机构 Logo**     | `InstitutionLogo` 自动识别                                           |
| **信用卡 Portal** | `CardPortalLink` 跳转发卡行                                          |
| **信用卡字段**    | APR、账单日、还款模式（paid-in-full / revolving）、statement balance |
| **贷款字段**      | 月供、利率、剩余期数                                                 |
| **应急储备标记**  | reserve checkbox — 不计入 STS                                        |
| **排序**          | 逻辑序 / 余额 / 名称                                                 |
| **持仓快照导入**  | `ImportSnapshotCard` → 跳转 stocks                                   |
| **Stale 标记**    | >30 天未更新提示                                                     |

---

#### 4.8.2 预测参数 `assumptions`

**复杂度**：**中等** ★★★☆☆

参数分三层折叠：**基础 / 高级 / 专家**

| 参数类别   | 示例字段                          |
| ---------- | --------------------------------- |
| 收入与增长 | 薪资年增长率                      |
| 应急与缓冲 | 应急储备目标、活期安全垫          |
| 投资       | 投资比例、基准回报、现金收益      |
| 宏观       | 通胀率、资本利得税率              |
| 显示       | 名义 vs 购买力（today's dollars） |
| horizon    | 最大预测年数                      |

所有参数通过 `setAssumptions` 实时影响 projection 引擎。

---

#### 4.8.3 应用偏好 `app`

**复杂度**：**复杂** ★★★★☆

| 区块             | 功能                                                    |
| ---------------- | ------------------------------------------------------- |
| **外观**         | `SettingsAppearanceSection` — 主题（light/dark/system） |
| **PWA**          | 手机竖屏锁定（`PortraitGate` 联动）                     |
| **隐私**         | 金额掩码 toggle（Eye/EyeOff）                           |
| **数据生命周期** | 导出备份 JSON、恢复备份（双重确认）、删除全部财务数据   |
| **Legacy 迁移**  | 检测并迁移旧版 localStorage 数据到云端                  |
| **设备管理**     | `DeviceManager` — 授权设备槽位（1 电脑 + 1 手机）       |

---

## 5. 全局 Overlay（非导航 Tab）

这些 Drawer / Bridge 跨 Tab 存在，不改变 hash 路由：

| Overlay                  | 触发入口               | 功能                                         | 复杂度 |
| ------------------------ | ---------------------- | -------------------------------------------- | ------ |
| `SpendImpactDrawer`      | 今日/总览「试算消费」  | 模拟单笔消费对 STS / 净资产 / 目标延迟的影响 | 中等   |
| `TxnEntryDrawer`         | FAB「记一笔」          | 手动录入交易                                 | 中等   |
| `CashflowQuickAddDrawer` | 记录·大额收支 FAB      | 快速登记未来大额事件                         | 中等   |
| `PositionDrawer`         | 点击持仓行             | 单只股票详情与价格历史                       | 中等   |
| `ExtensionSyncBridge`    | 浏览器扩展 postMessage | 账户/持仓/交易自动同步                       | 复杂   |
| `SyncErrorBanner`        | 云端同步失败           | 全局告警                                     | 简单   |
| `PortraitGate`           | PWA 横屏               | 提示旋转至竖屏                               | 简单   |

### FAB 行为矩阵

| 当前 Tab / Section    | FAB 文案          | 打开                     |
| --------------------- | ----------------- | ------------------------ |
| 今日、总览、记录·洞察 | 记一笔            | `TxnEntryDrawer`         |
| 记录·大额收支         | 大额收支          | `CashflowQuickAddDrawer` |
| 其他                  | 无 FAB 或同上规则 | —                        |

---

## 6. 完整 Tab 层级树

```
Finance OS
│
├── [准入] AuthGate（非 Tab）
│   ├── loading / config-missing / signed-out / device-limit / ready
│
├── 今日 ───────────────────────── #/today ──────────────────── [复杂]
│
├── 总览 ───────────────────────── #/overview ───────────────── [中等]
│
├── 资产配置 ───────────────────── #/stocks[?snapshot=] ──────── [复杂]
│
├── 记录 ───────────────────────── #/history/{section} ─────── [复杂]
│   ├── 洞察 ──────────────────── #/history/insights ────────── [复杂]
│   ├── 固定收支 ───────────────── #/history/fixed ──────────── [中等]
│   └── 大额收支 ───────────────── #/history/oneoff ─────────── [复杂]
│
├── 审查 ───────────────────────── #/review/{section} ──────── [复杂]
│   ├── 导入交易 ───────────────── #/review/import ─────────── [复杂]
│   ├── 审查队列 ───────────────── #/review/queue ──────────── [复杂]
│   ├── 消费基线 ───────────────── #/review/baseline ───────── [中等]
│   ├── 更新计划 ───────────────── #/review/calibrate ──────── [复杂]
│   └── 账户对账 ───────────────── #/review/reconcile ──────── [复杂]
│
├── 预测 ───────────────────────── #/forecast/{section} ─────── [复杂]
│   ├── 预测曲线 ───────────────── #/forecast/forecast ─────── [复杂]
│   └── 长期规划 ───────────────── #/forecast/scenarios ───── [复杂]
│
├── 决策工作室 ─────────────────── #/decision ───────────────── [复杂]
│   ├── 对比 ───────────────────── (UI state only) ─────────── [复杂]
│   ├── 已保存方案 ─────────────── (UI state only) ─────────── [中等]
│   └── 决策日志 ───────────────── (UI state only) ─────────── [中等]
│
└── 设置 ───────────────────────── #/settings/{section} ────── [复杂]
    ├── 账户 ───────────────────── #/settings/accounts ─────── [复杂]
    ├── 预测参数 ───────────────── #/settings/assumptions ──── [中等]
    └── 应用偏好 ───────────────── #/settings/app ─────────── [复杂]
```

---

## 7. 复杂度评级标准

| 等级   | 符号  | 定义                                      |
| ------ | ----- | ----------------------------------------- |
| 简单   | ★☆☆☆☆ | 只读展示、字段少、无引擎耦合              |
| 中等   | ★★★☆☆ | 有限 CRUD 或只读聚合；单一引擎            |
| 复杂   | ★★★★☆ | 多模块联动、wizard/流水线、或大型表单矩阵 |
| 极复杂 | ★★★★★ | 独立子域引擎 + 实时数据 + 多步骤 pipeline |

### 汇总表

| 复杂度     | 页面 / 分区                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- |
| **中等**   | 总览；记录·固定收支；审查·消费基线；决策·已保存/日志；设置·预测参数                           |
| **复杂**   | 今日；资产配置；记录·洞察/大额；审查（除基线外全部）；预测（全部）；决策·对比；设置·账户/应用 |
| **极复杂** | 记录 Hub（三子页异构）；审查 Hub（五段 pipeline）；决策工作室 Hub                             |

---

## 8. 与旧版 IA 的主要差异

仓库内 `docs/pto-audit-export/05_INFORMATION_ARCHITECTURE.md` **已过时**，当前版本变化：

| 旧版                             | 当前                                        |
| -------------------------------- | ------------------------------------------- |
| 无 URL 路由，`useState` 刷新丢失 | Hash 深链，刷新保留 Tab/Section             |
| 「规划 plan」Tab 含三子页        | 拆入 **记录·固定/大额** + **预测·长期规划** |
| 无「审查」Tab                    | 新增完整 **Review 流水线**（CSV 导入等）    |
| 无「资产配置」Tab                | 新增 **stocks** + holdings 引擎             |
| 无「决策工作室」                 | 新增 **decision** + 8 模板                  |
| 移动端 6 项底栏                  | **4 + 更多**（与 Planner 对齐）             |
| 试算 FAB 仅今日                  | 今日 + 总览均有入口                         |

---

## 9. 已知 IA 缺口与改进方向

| 缺口                                 | 影响                 | 建议                                         |
| ------------------------------------ | -------------------- | -------------------------------------------- |
| 决策工作室 3 子 Tab 未进 hash        | 刷新/分享丢失子页    | 扩展 `appRoute.ts` 支持 `decision/{section}` |
| 「总览」与「今日+预测」部分 KPI 重叠 | 用户可能困惑入口     | 保持今日=行动、总览=全景的定位强化           |
| 账户更新主路径在设置                 | 新用户不知在哪改余额 | Today 行动项 + 对账流已部分缓解              |
| 审查流水线较长                       | 新用户学习成本高     | 可考虑首次导入 wizard 或进度指示             |

---

## 10. 关键源文件索引

| 用途                 | 路径                                                  |
| -------------------- | ----------------------------------------------------- |
| Hash 路由类型与解析  | `src/lib/appRoute.ts`                                 |
| 移动底栏 Primary Tab | `src/lib/nav.ts`                                      |
| 主导航壳 + Tab 渲染  | `src/components/AppShell.tsx`                         |
| 二级 Tab UI          | `src/components/HorizontalTabs.tsx`                   |
| 中文导航文案         | `src/i18n/messages/index.ts` → `nav.*`                |
| 今日                 | `src/components/TodayView.tsx`                        |
| 总览                 | `src/components/OverviewView.tsx`                     |
| 记录 Hub             | `src/components/RecordsView.tsx`                      |
| 审查                 | `src/components/ReviewView.tsx`                       |
| 预测 Hub             | `src/components/ForecastHubView.tsx`                  |
| 决策工作室           | `src/components/DecisionStudioView.tsx`               |
| 设置                 | `src/components/SettingsView.tsx`                     |
| 资产配置             | `src/components/StocksView.tsx`                       |
| 投影引擎             | `src/hooks/useProjection.ts`、`src/engine/monthly.ts` |
| 数据质量引擎         | `src/engine/realityLoop.ts`                           |
| 决策引擎             | `src/engine/decision.ts`                              |
| 功能清单（审计）     | `docs/pto-audit-export/01_FEATURE_INVENTORY.md`       |

---

_本文档基于源码静态分析生成，如有路由或 Tab 变更请同步更新 `appRoute.ts` 与本文件。_
