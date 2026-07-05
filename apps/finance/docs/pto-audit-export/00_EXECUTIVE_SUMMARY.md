# Finance OS — Current Product Snapshot

## Product purpose

Finance OS 是一款面向个人财务决策的 Web 应用（React + Supabase），帮助用户在单一界面回答三类问题：当前有多少可动用现金、按现有生活方式未来资产会如何演变、以及一笔消费对长期净资产与目标的影响。产品以**手动录入的账户余额**与**周期性收支假设**驱动月度/日级预测引擎，并以 Supabase 中已导入的历史交易提供花销回顾与「计划 vs 实际」对照。它并非银行聚合器，也不自动同步实时行情。

## Current maturity

**Functional prototype**

理由：核心预测引擎、今日仪表盘、消费试算、账户/收支 CRUD、历史交易分析与 Supabase 持久化均已实现并有单元测试；但交易导入、重复审查、数据导出/清除、场景并排对比、目标专款专用与预测引擎的联动等 PTO 清单能力大量缺失或仅存在于离线脚本/遗留代码。README 描述「local-first」与当前 Supabase 主路径不一致。

## What currently works

- **认证与数据持久化**：`AuthGate` + `lib/repo.ts` 经 Supabase Auth/RLS 读写 `accounts`、`cash_flows`、`scenario_events`、`goals`、`user_settings`、`transactions`（已验证：构建与 70 项单测通过）。
- **账户管理**：`AccountsView` 支持多类型账户手动录入/编辑/删除，含信用卡模式、应急储备标记、 stale 提示（`src/components/AccountsView.tsx`）。
- **周期性收支与情景事件**：`CashFlowsView`、`FutureCashflowView`、`ScenariosView` 经 `FinanceStore` 乐观更新并同步 Supabase（`src/store/store.tsx`）。
- **月度预测**：`engine/monthly.ts` `projectMonthly()` 三档回报区间（`useProjection.ts`）。
- **今日视图**：`TodayView` + `useDashboard` 展示流动现金、safe-to-spend、现金日历、行动收件箱（`engine/daily.ts`、`engine/actions.ts`）。
- **消费试算抽屉**：`SpendImpactDrawer` 一次性/每月支出模拟与目标延迟（`engine/metrics.ts` `computeSpendImpact`）。
- **历史交易分析**：`HistoryView` 读取 Supabase 交易，月度趋势/类别/商户/周期性候选、账本筛选与手动记账（`engine/transactions.ts`）。
- **预测图表**：`ForecastView` + `ForecastChart` 基准/保守/激进带与通胀展示模式（`format.ts` `adjustForDisplay`）。
- **设备槽位限制**：`DeviceManager` + `allowed_devices` 表（`src/auth/DeviceManager.tsx`）。

## What appears unfinished

- **应用内 CSV/JSON 交易导入、重复审查、商户规则 UI**：不存在；交易经 `scripts/gen-txn-sql.mjs` 离线写入 Supabase（`src/data/transactions.json` 不在仓库中）。
- **JSON 导出/导入/清除本地数据 UI**：`store/persistence.ts` 有 `exportJSON`/`parseImportedJSON`/`loadData`，但**未接入** `SettingsView`；主路径不使用 localStorage 财务数据。
- **历史交易 → 预测基线自动校准**：`HistoryView` 的 `PlanReality` 仅只读对比，不写入 `cashFlows`。
- **目标专款专用 `current` 未扣减 safe-to-spend**：UI 文案称已存金额会从「能放心花」扣除，但 `useDashboard` 仅扣 `monthlyAllocation`（`src/hooks/useDashboard.ts`）。
- **场景并排对比 / 保存试算**：`SpendImpactDrawer` 不持久化；无独立 Scenario 实体。
- **Side-by-side 生活决策**（租房/买房/职业中断）：仅有 `salary-change`/`expense-change`/`partner-contribution` 事件，无专用 home-purchase 逻辑。
- **HSA 账户类型、雇主 match、分期/融资对比**：类型枚举与引擎均未实现。
- **local-first 叙事 vs 云存储**：财务主数据必须登录 Supabase；未配置 env 时应用无法进入主界面。

## Top 10 PTO concerns

| Rank | Severity | Concern | User impact | Technical impact | Evidence | Recommended next action |
| ---: | -------- | ------- | ----------- | ---------------- | -------- | ----------------------- |
| 1 | **Critical** | Safe-to-spend 与专款专用目标语义不一致 | 用户可能高估可花金额 | 指标口径分裂 | `ScenariosView` GoalRow 文案 vs `useDashboard` `plannedSavings30` 仅用 `monthlyAllocation`；未使用 `goal.current` | PTO 定稿口径；统一 `computeSafeToSpend` 输入 |
| 2 | **Critical** | Spend Impact 第一层 safe-to-spend 与主仪表盘公式不同 | 试算结论与「今日」页矛盾 | 重复/冲突逻辑 | `computeSpendImpact` L147–148 用 `emergencyTarget + upcoming30`；主路径用 `projectDaily` 低谷法（`engine/metrics.ts`） | 复用同一 `computeSafeToSpend` + `projectDaily` |
| 3 | **High** | 历史交易与预测假设双轨，无自动调和 | 长期预测可能系统性偏乐观/保守 | 双数据源 | `HistoryView` `PlanReality` 只展示；`monthly.ts` 不读 `Txn[]` | 提供「用历史均值更新月支出」显式动作 |
| 4 | **High** | 无应用内数据导出/删除 | 隐私与可移植性不足 | 遗留 `persistence.ts` 未接线 | `SettingsView` 无 export/clear；`persistence.ts` `exportJSON` 无引用 | 实现 Supabase 数据 JSON 导出与账户级清除 |
| 5 | **High** | 交易导入仅离线 SQL，无用户自助路径 | 新用户无法自行导入银行 CSV | 运维依赖 | `scripts/gen-txn-sql.mjs`；无 CSV 路由/组件 | 定义 MVP 导入管道或文档化运维流程 |
| 6 | **High** | README「local-first」与架构不符 | 错误隐私预期 | 文档漂移 | `README.md` vs `AuthGate`/`repo.ts` Supabase 主路径 | 更新产品定位或实现真正离线模式 |
| 7 | **Medium** | 目标 `monthlyAllocation` 不影响月度引擎分配 | 里程碑延迟可能被低估 | 模型缺口 | `monthly.ts` 无 goals 参数；分配仅 `emergencyReserveTarget` + `investRatio` | 将专款分配纳入月引擎或文档标注「仅 UI 预留」 |
| 8 | **Medium** | 无重复/商户规则审查队列 | 导入脏数据无法自助修复 | 功能缺失 | 全库 grep 无 duplicate review / merchant rule 组件 | 推迟或做最小「标记 flow 类型」批量编辑 |
| 9 | **Medium** | 信用卡 statement 与 balance 语义易混 | 短期现金日历可能偏差 | 建模假设 | `daily.ts` L187–207 statement/variableMonthly 逻辑复杂 | 增加账户级「数据质量」提示 |
| 10 | **Low** | 无 E2E/可访问性自动化验证 | 回归风险 | 测试缺口 | 仅 Vitest 单元测试；a11y UNVERIFIED | 补关键路径 smoke test |

## Recommended next milestone

**Milestone：Trustworthy cash decisions（可信现金决策基线）**

1. 统一 safe-to-spend 与 spend-impact 计算口径（含专款专用 `current` vs `monthlyAllocation` 的 PTO 决策）。
2. 在设置页提供 Supabase 财务数据 JSON 导出 + 确认式清除。
3. 「记录」页增加一键「用近 12 月真实月均更新规划支出」。
4. 文档化交易导入运维流程，或实现最小 CSV→Txn 导入。
5. 修正 README/空状态文案，明确云存储与余额手工更新要求。
