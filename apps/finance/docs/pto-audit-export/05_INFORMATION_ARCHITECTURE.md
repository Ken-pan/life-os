# Information Architecture

## Current navigation tree

```
Finance OS (AppShell — tab state, no URL router)
├── 今日 (today) — TodayView
├── 记录 (history) — HistoryView
├── 总览 (overview) — OverviewView
├── 规划 (plan) — PlanView
│   ├── 一次性收支 — FutureCashflowView
│   ├── 长期规划 — ScenariosView
│   └── 固定收支 — CashFlowsView
├── 预测 (forecast) — ForecastView
└── 设置 (settings) — SettingsView
    ├── 账户 — AccountsView
    ├── 预测参数 — assumptions form
    └── 应用偏好 — theme, privacy, DeviceManager

Global overlays (not tabs):
├── SpendImpactDrawer (FAB on 今日)
├── TxnEntryDrawer (FAB on 记录)
└── CashflowQuickAddDrawer (FAB on 规划)
```

**Note**：无 React Router；Tab 为 `useState`，刷新丢失 Tab（UNVERIFIED deep link）。

## Route inventory

| Route | Page name | Primary job | Entry | Key actions | Data dependency | Empty state | Loading | Error | Mobile | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tab:today | 今日 | 短期现金决策 | 默认 Tab | 试算消费、跳转 | accounts+cashFlows+goals | 引导设置/规划 | — | — | tabbar+折叠 | WORKING |
| tab:history | 记录 | 历史花销洞察 | Tab/FAB | 记一笔、筛选 | transactions | loading card | loading | error card | 折叠 insights | WORKING |
| tab:overview | 总览 | 净资产全景 | Tab | 试算、跳转预测 | projection | 同 today | — | — | kpi grid | WORKING |
| tab:plan | 规划 | 录入未来假设 | Tab | 三子 Tab CRUD | cashFlows+events+goals | section empty | — | — | HorizontalTabs | WORKING |
| tab:forecast | 预测 | 长期曲线 | Tab |  horizon/metric | projection | 引导录入 | — | — | chart | WORKING |
| tab:settings | 设置 | 账户与参数 | Tab/sidebar | CRUD, theme, logout | all entities | — | device loading | device err | 3 sections | WORKING |
| overlay:spend | 试算抽屉 | 消费影响 | FAB | 输入金额 | projection | 提示输入 | — | — | drawer | PARTIAL |
| auth:login | 登录 | 准入 | 未登录 | signIn | Supabase | — | verifying | err | centered | WORKING |

## PTO review (proposed nav: Today / Forecast / Timeline / Accounts / Review / Settings)

| # | Question | Answer |
| --- | --- | --- |
| 1 | 冗余章节？ | **是**：「总览」与「今日+预测」重叠；「规划」内混一次性/长期/固定收支 |
| 2 |  essential 任务被埋没？ | **是**：账户更新藏在设置；交易清洗无 Review Tab；导入不存在 |
| 3 | Simulate purchase 全局？ | **部分**：FAB 仅在 today；overview 有按钮；history/forecast 无 |
| 4 | Mobile 策略？ | **有** bottom tabbar 6 项；history insights 可折叠；ledger 筛选 drawer |
| 5 | 用户知在哪更新余额？ | **弱**：Today 行动可提示；主路径「设置→账户」 |
| 6 | 用户知在哪清理导入？ | **否**：无 Review；History 仅编辑单笔 |
| 7 | Forecast vs Timeline 清晰？ | **否**：无 Timeline Tab；一次性在「规划」 |
| 8 | Today 信息过多？ | **中等**：4 KPI + 2 卡 + 日历 + 说明；可接受 |
| 9 | 死胡同？ | device-limit、config-missing 仅退出/配置 |
| 10 | 应改为 drawer？ | 试算已是 drawer ✓；账户编辑适合保持 inline；规划三子 Tab 可考虑 wizard |
