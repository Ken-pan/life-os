# Finance OS — P2B Decision Studio

## Executive result

`P2B CONDITIONAL PASS`

## Dependency-gate result

- P0/P1 依赖保持可用（单一路径 STS、30 天日级现金、Reality Loop 与基线窗口、手工余额快照边界）。
- P2A 关键前置已具备最小可用版本（命名场景容器、事件归属、场景 CRUD、RLS 基础）。
- 进入 P2B 实装，不再处于 `BLOCKED`。

## Product outcome

- 用户现在可在 `Decision Studio` 中：
  - 选择问题模板并输入核心假设。
  - 预览 baseline vs scenario 的短期与长期差异。
  - 保存场景、管理已保存场景、记录决策。
  - 在 Decision log 里查看并删除记录。
- 系统仍保持“默认不自动应用计划、不自动改余额/交易/目标”。

## Scope delivered

- 新增 `Decision Studio` 顶级入口与三标签：`Compare` / `Saved scenarios` / `Decision log`。
- 新增共享 selector：`selectDecisionComparison(...)`（复用 `projectDaily` + `projectMonthly` + `selectSafeToSpendBreakdown`）。
- 新增 P2B migration：`supabase/migration_p2b_decision_studio.sql`。
- 新增 `decision_records` 持久化与 repo API（load/upsert/delete）。
- 新增 apply/undo RPC 与审计：`apply_scenario_to_plan_v1` / `undo_latest_scenario_apply_v1` / `scenario_apply_audits`。
- Compare 中新增 apply safety 流程：变更预览表、勾选确认、stale acknowledgment、仅应用勾选项、撤销按钮。
- 新增 Decision selector 回归测试：`src/engine/decision.test.ts`。

## Deferred intentionally

- 手工 QA 截图清单未完成。
- 移动端 `More` 聚合导航未实现（当前为直接 tab 暴露）。
- live Supabase migration / A/B 隔离 / Security Advisor 在线跑数未执行（本地会话无 live 执行凭据）。

## Information architecture

- 顶级新增 `Decision Studio`（侧栏在 `Forecast` 后）。
- 内部信息架构：
  - Compare：创建/预览/对比。
  - Saved scenarios：筛选、重命名、归档、删除、打开。
  - Decision log：记录与复盘入口。

## Data model diff

- 复用并增强：
  - `scenarios`（状态/类型约束用于 Decision Studio）。
  - `scenario_events`（事件类型约束扩展，保留历史兼容类型）。
- 新增：
  - `decision_records`（按用户与场景记录 decision_status、summary、reason、review_on 等）。

## Migration results

- 已新增迁移脚本：`supabase/migration_p2b_decision_studio.sql`。
- 脚本内容覆盖：
  - `scenarios` status/type check。
  - `scenario_events` type check（含旧事件类型兼容）。
  - `decision_records` 建表、索引、外键、RLS、策略。
  - `scenario_apply_audits` 建表、索引、外键、RLS、策略。
  - `apply_scenario_to_plan_v1` 与 `undo_latest_scenario_apply_v1` RPC（`auth.uid()` 绑定、禁止 `anon/public`）。
- **状态**：本地代码已落地，live 执行未验证（见后文 BLOCKED 项）。

## Calculation architecture

- 单一可信路径已落实：
  - scenario events -> `projectDaily`
  - scenario events -> `projectMonthly`
  - STS -> `selectSafeToSpendBreakdown`
  - compare -> `selectDecisionComparison`
- 没有并行“第二套计算器”。

## Shared selectors

- `src/engine/decision.ts`:
  - `selectDecisionComparison(...)`
  - 输出 `baseline/scenario/delta/assumptions/warnings/confidence`
- 核心保障：
  - `$0` 场景 delta 为 0。
  - 比较调用不修改原计划对象。
  - 同输入重开结果稳定。

## Scenario templates

- Compare 流程已提供模板：
  - purchase / recurring_cost / cash_vs_finance / rent_change / travel / career_break / partner_contribution / wait_buy_later
- 当前是“最小模板参数集”，用于稳定进入 compare 流程；复杂金融细化（税务/摊销等）未扩展。

## Compare workflow

- 已实现的核心链路：
  1. 选择问题模板
  2. 输入基础假设 + 高级假设折叠区
  3. 预览 scenario
  4. 对比已保存场景（最多 3 个）
  5. 保存 preview 为命名场景
- 语言保持中性，不输出“你应该买/不该买”。

## Confidence and explainability

- comparison 输出中包含 `confidence` 状态：
  - `Ready to compare`
  - `Review assumptions`
  - `Limited confidence`
- 触发逻辑（当前最小版）：
  - 账户缺失或更新时间过旧会降级 confidence 并给出 warning/action。

## Saved scenarios

- 已支持：
  - 列表、搜索、类型/状态过滤
  - 打开、重命名、归档/反归档、删除
  - Compare 中勾选最多 3 个 saved scenarios 做对比
- 未支持：
  - “输入变更后查看原快照 vs 重新计算”双轨按钮（需 snapshot UI 完整接线）。

## Decision log

- 已支持：
  - 记录 decision status（considering/chosen/declined/deferred/reviewed）
  - summary / reason / review_on
  - 列表展示与删除
- 数据落到 `decision_records`（RLS own-row）。

## Apply-to-plan safety

- 已实现 review-confirm apply 流程：
  - Source scenario 选择 + 事件勾选（apply selected changes only）
  - 预览表：Planned item / Current value / Proposed value / Effective date / Source scenario
  - checkbox 确认 + stale 数据额外确认
  - 显式按钮 `Apply selected changes to plan`
- 已实现原子写 RPC（单事务）：
  - `apply_scenario_to_plan_v1(payload jsonb)`
  - 仅复制选中的 scenario events 到 baseline 场景
  - 写入 `scenario_apply_audits` 审计元数据
- 已实现撤销：
  - `undo_latest_scenario_apply_v1()`
  - 删除最近一次 apply 产生的 baseline 事件并标记审计记录 `undone_at`
- 仍保持不修改：
  - account balances
  - historical transactions
  - unrelated goals / reserve policies

## Data freshness

- Compare 已接入最小 freshness 提示（stale balance -> confidence 降级 + warning）。
- 尚未接入 review_items 高影响项联动降级（后续可并入）。

## Security and privacy

- 新公共表 `decision_records` 已加：
  - `user_id`
  - RLS
  - own-row policies
  - user/scenario 索引
- 不新增第三方分析 SDK；不记录用户笔记文本到分析层。

## RLS and RPC verification

- 代码层已定义/迁移层已声明：
  - `decision_records` RLS 与策略
  - `scenario_apply_audits` RLS 与策略
  - `apply_scenario_to_plan_v1` / `undo_latest_scenario_apply_v1` 执行权限（仅 `authenticated`）
- 本地静态核对通过：
  - `auth.uid()` ownership 绑定
  - 拒绝 baseline 自身 apply
  - 拒绝空 selection
  - `public`/`anon` revoke
- live A/B cross-user isolation：**BLOCKED（未执行）**。

## Security Advisor results

- **BLOCKED**：未进行 live Security Advisor 运行（需要项目在线权限）。

## Accessibility verification

- 已做基础可用性保障：
  - 三标签结构与表单控件可键盘操作。
  - 文本标签存在，比较卡片不依赖颜色单一表达。
- 未完成：
  - 390px 全链路截图验证与完整 SR 文案审计。

## Manual QA evidence

- **BLOCKED**：本次未产出你要求的截图清单（`qa_p2b_*.png`）。
- 建议下一步执行 Playwright/人工联合截图回合。

## Test, type-check, lint, and build results

- `npm run test`：**104 passed / 0 failed**
- `npm run typecheck`：**pass**
- `npm run lint`：**pass（3 条既有 warning，无 error）**
- `npm run build`：**pass**
- bundle 变化（相对上一轮构建输出）：
  - `dist/assets/index-*.js` 约从 `947.40 kB` -> `965.45 kB`（+`18.05 kB`）
- 新依赖：无

## Known limitations

- 未实现 scenario snapshot 的“原始快照对比 UI”。
- 未完成截图与 live 安全验证，故不能宣称 `P2B PASS`。

## PTO decisions required

- 是否批准进入 P2B-2：
  - 完成 live RLS A/B、RPC auth、Security Advisor 验证
  - 完成截图清单与 390px 流程验收

## Recommended next milestone

- `P2B-2 Verification and UX hardening`
  - Snapshot 原始 vs recalculated 双轨
  - QA screenshot evidence（含 390px 核心流）
  - live security verification（RLS A/B、RPC、Security Advisor）
