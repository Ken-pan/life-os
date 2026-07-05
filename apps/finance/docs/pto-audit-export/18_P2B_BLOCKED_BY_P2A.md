# Finance OS — P2B Blocked By P2A

> 状态更新（PTO 已批准继续）：本文件记录最初阻塞判定；当前分支已开始补齐 P2A 最小前置，详见代码变更与 migration。

## Gate result

`BLOCKED`

P2B Decision Studio 依赖检查未通过。根据 PTO 规则，不在 P2B 内静默补做 P2A 能力。

## Dependency audit summary

### P0 dependencies

- `selectSafeToSpendBreakdown(...)`：存在（`src/engine/metrics.ts`）。
- 30 天日级现金预测：存在且有测试（`src/engine/daily.ts`、`src/engine/dashboard.test.ts`）。
- operating cash buffer：存在（`assumptions.checkingBuffer`，引擎已使用）。
- goal reserve policies 三态：存在（`milestone_only` / `earmarked_operating_cash` / `protected_account`）。
- protected reserve 不静默兜底：存在（默认不动用，且有显式 fallback 开关与测试）。

### P1 dependencies

- accepted normalized transactions：存在（Review Import 流 + `finalize_transaction_import_v1`）。
- 3/6/12 month spending baselines：存在（`computeBaselineWindows`）。
- Reality Loop source-of-truth boundaries：存在（Import/Review/Calibration 明确“不会修改当前余额”边界）。
- explicit plan calibration behavior：存在（仅应用勾选项，`CalibrationView`）。
- current account balances manually maintained snapshots：存在（导入流程不改余额，余额为手工维护口径）。

### P2A dependencies

- scenario-event entity 或等价：存在（`public.scenario_events` + `ScenarioEvent`）。
- baseline forecast：存在（`projectMonthly` baseline）。
- scenario forecast：部分存在（事件注入可模拟）。
- event injection into daily/monthly：存在（`projectDaily` / `projectMonthly`）。
- basic scenario timeline/event list：存在（`ScenariosView`）。
- **缺失：scenario entity 或等价（命名场景容器）**
- **缺失：named scenario persistence（可持久化多个场景）**
- **缺失：scenario save/rename/duplicate/delete（按场景维度 CRUD）**

## Blocking gaps and impact

| Missing dependency | Affected P2B feature | Smallest prerequisite implementation | Recommended sequencing |
| --- | --- | --- | --- |
| `scenarios` 场景容器实体（每个场景独立 id/name/status） | Compare 中 baseline + 多变体稳定对比；Saved scenarios；Decision log 关联 | 新增 `public.scenarios`（含 `user_id`、`name`、`status`、`scenario_type`、时间戳）+ RLS + 索引 | P2A-1：先建容器，再迁移现有“全局 events”模型 |
| `scenario_events` 对场景归属（`scenario_id`） | 一个用户可同时维护多个场景与变体；回放稳定结果 | 给事件加 `scenario_id` 并建立外键；补迁移脚本与回填策略 | P2A-2：完成数据模型重构与读写路径切换 |
| 场景级仓储与 API（save/rename/duplicate/delete） | Saved scenarios Tab；Compare Step 5/6 的“保存/复制/记录决策” | 在 DAL 与 store 增加场景 CRUD（最小先不做 apply-to-plan） | P2A-3：先做后端 + 数据访问，再接 UI |
| 场景级快照（至少 comparison preview 可复现） | “saved scenario reopening produces stable results” 与“inputs changed”提示 | 最小实现：保存场景时持久化当时 assumptions hash + 关键输出摘要 | P2A-4：在 Compare UI 前完成 |

## Why P2B must stop here

当前实现是“全局事件列表”模型，不具备“多个命名场景并行持久化与对比”的最小结构。若继续在 P2B 直接开发 Compare/Saved/Decision log，将不可避免把 P2A 基础隐式补进 P2B，违反 gate 约束。

## PTO approval needed

请先批准 P2A 最小补齐（建议按上文 P2A-1 ~ P2A-4），通过后再进入 `18_P2B_DECISION_STUDIO.md` 的正式实现与验收。
