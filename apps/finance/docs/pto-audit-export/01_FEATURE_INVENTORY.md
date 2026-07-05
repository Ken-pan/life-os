# Feature Inventory

> 状态说明：`WORKING` | `PARTIAL` | `UI_ONLY` | `MOCKED` | `HARDCODED` | `BROKEN` | `DOCUMENTED_NOT_IMPLEMENTED` | `UNVERIFIED`

## Today / Overview

| Area | Feature | User value | Entry point | Implementation status | Status evidence | Data source | Calculation dependency | Known limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today | 净资产 | 全景财富 | 总览 Tab `OverviewView` | WORKING | `useProjection` → `summarize()` `metrics.ts` | 账户余额 | `monthly.ts` `netWorth` | 余额手动；不含交易重建 | Medium |
| Today | 流动现金 | 短期可用 | 今日/总览 KPI | WORKING | `MonthSnapshot.liquidCash` | checking+savings liquid | `buildSimState` | 合并 checking+savings 池 | Low |
| Today | Safe to spend | 现在能花多少 | 今日 KPI | PARTIAL | `useDashboard` + `computeSafeToSpend` | 账户+cashFlows+goals | `daily.ts` 低谷法 | 专款 `current` 未扣；与试算抽屉公式不同 | **Critical** |
| Today | 每月结余 | 储蓄能力 | 总览 KPI | WORKING | `summarize` months 2–13 均值 | cashFlows | `precomputeFlows` | 跳过首月；不含历史交易 | Medium |
| Today | 近 30 天义务 | 账单压力 | `DailyOutlook` | WORKING | `projectDaily` | cashFlows+卡账单 | `daily.ts` | 年度 cashFlow 在 35 天窗忽略 | Medium |
| Today | 下一里程碑 | 目标进度 | `useDashboard` `nextMilestone` | WORKING | `goalReachMonth` | goals+projection | `metrics.ts` | 非 reserve 目标优先 | Low |
| Today | 行动收件箱 | 今日该做什么 | `TodayView` actions | WORKING | `buildActions` max 3 | outlook+accounts | `actions.ts` | 无 deep link 到修复页 | Medium |
| Today | 账户新鲜度 | 数据可信 | stale banner + actions | WORKING | `daysSince(updatedAt)>30` | `Account.updatedAt` | `AppShell`/`actions.ts` | 仅提示，不阻断 | Low |
| Today | 数据质量警告 | 导入/假设问题 | — | DOCUMENTED_NOT_IMPLEMENTED | 无 dedicated warnings 组件 | — | — | 仅有 PlanReality 软性提示 | Medium |

## Accounts

| Area | Feature | User value | Entry point | Status | Evidence | Data source | Calculation | Limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Accounts | 资产账户 | 录入余额 | 设置→账户 `AccountsView` | WORKING | CRUD `store.tsx`/`repo.ts` | Supabase `accounts` | `buildSimState` | 无聚合行 double-count 测试在生产数据 UNVERIFIED | Medium |
| Accounts | Checking/Savings | 流动现金 | 同上 | WORKING | type `checking`/`savings` | 手动 | `isLiquid` | — | Low |
| Accounts | Brokerage | 长期投资 | 同上 | WORKING | type `brokerage` | 手动 | 计入 invested | 默认 excluded from STS | Low |
| Accounts | 401(k)/Retirement | 退休 | 同上 | WORKING | type `retirement` | 手动 | invested 桶 | 无 HSA 类型 | Low |
| Accounts | HSA | 医疗储蓄 | — | DOCUMENTED_NOT_IMPLEMENTED | `AccountType` 无 hsa | — | — | 可用 other 凑合 | Low |
| Accounts | 信用卡 | 负债/账单 | 同上 | WORKING | creditMode/apr/statement | 手动 | `daily.ts`+`monthly.ts` | paid-in-full vs revolving 需用户正确标记 | High |
| Accounts | 贷款 | 月供 | mortgage/auto-loan | WORKING | monthlyPayment/apr | 手动 | `stepLoanMonth` | — | Medium |
| Accounts | 手动编辑 | 更新余额 | AccountRow inline | WORKING | `upsertAccount` | 用户输入 | — | 无批量更新 | Medium |
| Accounts | 聚合 vs 个体 | 避免重复 | — | PARTIAL | 引擎按账户列表加总 | 用户责任 | `buildSimState` | 无 UI 警告重复账户 | Medium |
| Accounts |  stale 处理 | 提醒更新 | stale tag/filter | WORKING | `daysSince>30` | updatedAt | — | 不自动降级指标 | Low |

## Historical transactions

| Area | Feature | Entry point | Status | Evidence | Data source | Calculation | Limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| History | CSV 导入 | — | DOCUMENTED_NOT_IMPLEMENTED | 无 UI/解析器 | — | — | 离线 SQL only | **High** |
| History | JSON 导入 | — | DOCUMENTED_NOT_IMPLEMENTED | `gen-txn-sql.mjs` 读 `src/data/transactions.json`（不在 repo） | 离线 | — | 含硬编码 USER_ID | **High** |
| History | 规范化 | — | PARTIAL | 导入时预处理；`Txn` 已规范化字段 | Supabase | `txnFromRow` | 应用内无 pipeline | High |
| History | 类别映射 | History 筛选 | WORKING | `categoryBreakdown` | Txn.category | 导入时赋值 | 无规则编辑器 | Medium |
| History | 商户规则 | — | DOCUMENTED_NOT_IMPLEMENTED | — | — | — | — | Low |
| History | 重复检测 | — | DOCUMENTED_NOT_IMPLEMENTED | 仅统计 `mirrorDuplicateRowsExcludedFromAnalytics` | excludeReason 预置 | `computeStatistics` | 无 review queue | Medium |
| History | 转账处理 | 账本 flow 筛选 | WORKING | flow=`internal_transfer` inSpending=false | 导入标记 | `spendingOf` | 用户不可批量重分类 | Medium |
| History | 退款 | 手动记账 | PARTIAL | `toTxnPayload` refund flow | manual | budgetImpact 正 | 导入依赖预处理 | Medium |
| History | 信用卡还款 | 统计说明 | WORKING | inSpending=false | 导入 | excluded from spending | — | Low |
| History | Review queue | — | DOCUMENTED_NOT_IMPLEMENTED | — | — | — | — | High |
| History | 周期性检测 | History 卡片 | WORKING | `computeRecurring` | Txn[] | 客户端启发式 | 非 ML；无确认流 | Low |
| History | 月度分析 | 趋势图 | WORKING | `monthlySeries` | Txn[] | 引擎 | — | Low |
| History | 类别分析 | 类别列表 | WORKING | `categoryBreakdown` | Txn[] | — | — | Low |
| History | 手动记账 | FAB 记一笔 | WORKING | `TxnEntryDrawer`→`insertTxn` | Supabase | `toTxnPayload` | 无 CSV 批量 | Medium |

## Forecast

| Area | Feature | Entry point | Status | Evidence | Data | Calculation | Limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Forecast | 基准投影 | 预测 Tab | WORKING | `projectMonthly` | accounts+cashFlows+events | baselineReturn | — | Medium |
| Forecast | 保守/激进 | ForecastChart 带 | WORKING | `useProjection` returnOverride | assumptions | 三序列 | 仅改投资回报 | Low |
| Forecast | 通胀 | displayMode | WORKING | `toTodayDollars`/`adjustForDisplay` | assumptions.inflation | 月通胀复利 | UI 标签依赖用户理解 | Medium |
| Forecast | 现金收益 | assumptions | WORKING | `mCash` in monthly | cashYield | 月复利 | — | Low |
| Forecast | 券商回报 | assumptions | WORKING | mReturn on invested | baselineReturn | — | 统一 rate 所有 invested | Medium |
| Forecast | 退休账户回报 | 同上 | WORKING | brokerage+retirement 同桶 | — | 无单独 rate | Low |
| Forecast | 每月贡献 | cashFlows+分配 | PARTIAL | surplus 自动投资 | cashFlows | investRatio | 无 employer match | Medium |
| Forecast | Employer match | — | DOCUMENTED_NOT_IMPLEMENTED | — | — | — | — | Low |
| Forecast | 目标里程碑 | Forecast 列表 | WORKING | `goalReachMonth` | goals | metric 读 snapshot | allocation 不进引擎 | Medium |
| Forecast | 事件时间线 | 规划→一次性收支 | WORKING | `FutureCashflowView` | scenario_events | signed month | 无独立 Timeline Tab | Low |
| Forecast | Household | partner-contribution | PARTIAL | `ScenariosView` event | events | precomputeFlows | 仅按 category 减免 | Medium |
| Forecast | 购买力 vs 名义 | settings assumptions | WORKING | displayMode | assumptions | format layer | — | Low |

## Spending simulator

| Area | Feature | Entry point | Status | Evidence | Limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Simulator | 一次性购买 | FAB/抽屉 `SpendImpactDrawer` | WORKING | `one-time-purchase` event month 1 | 不保存 | Medium |
| Simulator |  recurring 升级 | 抽屉 monthly | WORKING | `expense-change` | — | Medium |
| Simulator | 付款来源 | checking/savings/invested | WORKING | fundingSource | 无 financing | Low |
| Simulator | Buy today vs wait | — | DOCUMENTED_NOT_IMPLEMENTED | — | — | Low |
| Simulator | 应急金影响 | 抽屉层 1 | PARTIAL | `emergencyProtected` 简化 | 与主 STS 不一致 | **High** |
| Simulator | 30 天最低现金 | — | PARTIAL | 抽屉未展示 daily 低谷 | 仅 cashAfter | Medium |
| Simulator | 5/10/20 年影响 | 抽屉层 2 | WORKING | diffByYear netWorth | horizonYears 过滤 | Low |
| Simulator | 里程碑延迟 | 抽屉层 3 | WORKING | `goalDelays` | — | Medium |
| Simulator | 保存场景 | — | DOCUMENTED_NOT_IMPLEMENTED | 临时 `__sim_spend__` id | — | Medium |

## Goals

| Area | Feature | Entry point | Status | Evidence | Limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Goals | 应急储备目标 | 默认 goal-emergency | WORKING | `defaults.ts` | target 12000 HARDCODED 默认 | Medium |
| Goals | 专款专用 reserve | ScenariosView | PARTIAL | UI+monthlyAllocation | `current` 未进 STS/引擎 | **Critical** |
| Goals | 每月分配 | SavingsBudgetCard | PARTIAL | assumptions.savingsBudget | 不影响 monthly 模拟 | High |
| Goals | 目标日期 | Goal.targetDate | UI_ONLY | 字段存在 | 未用于 reach 计算 | Low |
| Goals | 旅行/宠物/科技等 | 用户自定义 | WORKING | upsertGoal | 通用 Goal 模型 | Low |

## Settings and privacy

| Area | Feature | Entry point | Status | Evidence | Limitations | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Settings | Local-first | — | BROKEN（相对 README） | Supabase 主路径 | 非 local-only | **High** |
| Settings | Import JSON 财务 | — | DOCUMENTED_NOT_IMPLEMENTED | persistence 未接线 | — | High |
| Settings | Export | — | DOCUMENTED_NOT_IMPLEMENTED | `exportJSON` 无 UI | — | High |
| Settings | Backup/Restore | — | DOCUMENTED_NOT_IMPLEMENTED | — | — | High |
| Settings | Clear data | — | DOCUMENTED_NOT_IMPLEMENTED | — | — | High |
| Settings | Dark mode | 设置→应用 | WORKING | `useTheme` localStorage fos-theme | — | Low |
| Settings | 假设参数 | 设置→预测参数 | WORKING | `setAssumptions` | — | Low |
| Settings | 隐私隐藏金额 | Eye toggle | WORKING | `data.privacy` | 仅 UI 掩码 | Low |
| Settings | 设备管理 | DeviceManager | WORKING | allowed_devices | 最多 2 槽 | Medium |

## Additional areas found

| Area | Feature | Entry point | Status | Evidence |
| --- | --- | --- | --- | --- |
| Auth | 邮箱密码登录 | `AuthGate` | WORKING | supabase.auth |
| Auth | 设备上限 | device-limit phase | WORKING | `ensureDeviceAuthorized` |
| Legacy | /legacy 旧工具 | README | UNVERIFIED | `public/legacy/` 未在本次审计逐文件验证 |
| Dev | 横向溢出 guard | dev only `overflowGuard.ts` | WORKING | test pass |
| Netlify | 部署 | netlify.toml | UNVERIFIED | 未跑 deploy |
