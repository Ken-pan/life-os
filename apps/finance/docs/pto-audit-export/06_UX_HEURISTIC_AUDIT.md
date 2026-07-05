# UX Heuristic Audit

| Finding | Screen | Heuristic | Severity | User impact | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Safe-to-spend 说明与专款 UI 文案矛盾 | 今日 / 规划 | #11 可解释性 | **Critical** | 误花专款 | `TodayView` SafeToSpendNote vs `ScenariosView` reserve 文案；`useDashboard` 只用 allocation | PTO 定口径后统一 copy+math |
| 试算抽屉 STS 与今日 KPI 可能不一致 | SpendImpactDrawer vs Today | #11 / #4 一致性 | **Critical** | 信任崩溃 | `computeSpendImpact` L147–148 vs `computeSafeToSpend` | 共用 daily 低谷 |
| README 称 local-first 实际需登录云 | 登录/全局 | #2 世界模型 | **High** | 隐私预期错误 | README vs AuthGate | 更新产品承诺 |
| 无数据导出/删除入口 | 设置 | #3 控制与自由 | **High** | 无法掌控数据 | SettingsView 无 export | 增加 export/wipe |
| 历史 vs 规划偏差仅文字提示 | 记录 | #11 | **High** | 不知要改规划 | `PlanReality` 无 CTA | 加「更新规划支出」按钮 |
| Stale 账户仅 banner 不阻断 | 全局 header | #1 系统状态 | Medium | 用过期数据决策 | `AppShell` stale banner | 可选「最后校准」强调 |
| Tab 无 URL，刷新回默认 | 全局 | #3 | Medium | 丢失上下文 | AppShell useState tab | 可选 hash router |
| 规划默认子 Tab「一次性」而非「固定收支」 | 规划 | #6 识别 | Medium | 新用户先录入顺序反直觉 | PlanView default `future` | 默认 cashflows 或 onboarding |
| History ledger 编辑网格移动端拥挤 | 记录 | #15 移动 | Medium | 难编辑 | LedgerRow grid columns | 移动 stack 布局 UNVERIFIED |
| 预测点估计精确到美元 | 预测 | #11 | Medium | 过度自信 | ForecastView pr-value | 强调区间带为主 |
| 行动 inbox 无跳转修复 | 今日 | #7 效率 | Medium | 多看一步 | actions 无 links | deep link → settings/plan |
| 隐私模式仅掩码金额 | 全局 | #14 | Low | 商户名仍可见 | money() privacy flag | 可选 blur merchant |
| 图表无 SR 表格回退 | 预测/记录 | a11y #18 | Medium | 屏幕阅读器 | Recharts only | 加 data table UNVERIFIED |
| Focus trap 抽屉 | 试算/记账 | a11y | UNVERIFIED | 键盘用户 | drawer 无 aria audit | manual test |
| 颜色红绿表意 | KPI/日历 | a11y #17 | PARTIAL | 色盲 | depositDeltaClass + dot | 已有符号/文字部分 |
