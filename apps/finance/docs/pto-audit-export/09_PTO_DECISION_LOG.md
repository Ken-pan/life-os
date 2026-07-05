# PTO Decision Log

| Rank | Decision | Why it matters | User impact | Technical impact | Effort | Dependency | Recommended choice |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 专款专用如何扣 STS：`current` vs `monthlyAllocation` vs 两者 | 直接决定「能花多少」 | 高 | metrics+useDashboard | S | PTO 口径 | **Workshop 后统一；倾向扣 `current`+未来 allocation** |
| 2 | 统一 safe-to-spend 与 spend-impact 公式 | 避免矛盾建议 | 高 | metrics.ts refactor | M | #1 | **必须做** |
| 3 | 是否实现 Supabase JSON 导出/全量删除 | 隐私合规与用户信任 | 高 | repo aggregate query | M | — | **Build export+wipe** |
| 4 | 历史月均 → 规划支出 一键同步 | 预测可信度 | 高 | History+store | M | — | **Build with confirm diff** |
| 5 | 产品定位：personal cloud vs local-first | 架构方向 | 高 | 文档+maybe offline | L | — | **Honest cloud-backed personal tool** |
| 6 | 应用内 CSV 交易导入 MVP | 自助 onboarding | 高 | new pipeline | L | schema | **Defer full; ship runbook first** |
| 7 | 目标 allocation 是否进入 monthly 引擎 | 里程碑准确性 | 中 | monthly.ts | L | #1 | **Phase 2 after STS fix** |
| 8 | Named scenario 对比 | 人生决策 | 中 | new model/UI | L | — | **Defer** |
| 9 | Review queue for duplicates | 数据质量 | 中 | new UI+rules | L | import | **Defer until import MVP** |
| 10 | Bank API | 自动化 | 低短期 | 极大 | XL | — | **Defer deliberately** |

## Fix before any further feature work

Maximum 5:

1. **统一 safe-to-spend 计算**（Today + SpendImpactDrawer + 专款口径 PTO 决策）。
2. **修正或对齐专款专用 UI 文案与数学**（`goal.current` 是否扣减）。
3. **README/空状态：明确 Supabase 云存储 + 余额手动更新**。
4. **移除或隔离 gen-txn-sql 硬编码 USER_ID**（改用 env，batch SQL gitignore）。
5. **Regression tests for STS consistency**（#1/#2 的测试锁）。

## Build next

Maximum 5:

1. Settings：**JSON 导出**（accounts+cashFlows+events+goals+settings）+ **确认式清除**。
2. History：**「用近 12 月月均更新规划支出」** 带 diff 预览。
3. **PlanReality → action** 而不仅是文字。
4. **SpendImpact**：展示 30 天最低现金（复用 projectDaily）。
5. Optional：**hash routing** 保留 Tab 状态。

## Defer deliberately

| Capability | Reason to defer |
| --- | --- |
| Bank API integration | 合规/成本/与手动 SoT 冲突 |
| Real-time stock quotes | 余额手动；scope creep |
| AI chat primary UI | 核心是可解释公式 |
| Granular txn categorization ML | 先解决 import+review MVP |
| Complex tax calculation | 非当前产品承诺 |
| Social comparison | 隐私与定位不符 |
| Cloud sync 作为新功能 | **已有 Supabase**；需的是 export/portability |
| Full household asset merging | 仅 partner-contribution 够用先 |
| Home purchase dedicated module | 可用 events 组合；专用引擎 ROI 低 |
| Financing vs cash comparison | 无法律/利率输入模型 |
