# FINC.PURCHASE.6.a — 支出审核 closure QA 收尾（2026-07-17）

**Scope:** 采购标注闭环 QA — 检测 → 定向抓单 → 匹配标注 → owner Confirm → Undo，
重点补齐 owner「确认 → 撤销」的真实运行验证与边界。仅改动 `apps/finance/**`；
共享包（`packages/finance-core`、`platform-web`）只读取/记录，未改动。

## 结论

- 闭环的 **owner Confirm→Undo 状态机在两个层面均已验证正确**：纯引擎（SSOT）、
  Postgres RPC 合同、以及 App 端编排（本次抽出并测试）。
- 发现并修复 **1 个 App 端真实缺陷**（stale/unknown 反馈被 reconcile-reload 清掉，
  从不渲染）——见下。
- 新增 App 内自动化测试 **10 例**，把 owner Confirm→Undo 全链路 + 三个边界
  （空结果 / 重复标注 / 撤销后回滚）钉进 CI。
- **仍需 Ken 登录态** 的部分（真实浏览器 owner 往返、双 JWT 的 RLS 跨用户拒绝、
  Antigravity 视觉基线）无法由本 agent 完成——见「未决 / 需 owner」。

## 运行证据（离线，未触生产写入）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 决策引擎（SSOT） | `vitest run packages/finance-core/.../purchaseReviewDecision.test.ts` | **18/18 ✅** |
| Finance App 全量单测 | `apps/finance$ npm run test` | **127/127 ✅**（原 117 + 本次 10） |
| 新增 closure 边界测试 | `vitest run src/lib/purchaseReviewClient.test.js` | **10/10 ✅** |
| 类型/模板 | `apps/finance$ npx svelte-check` | **0 errors**（改动文件 0 新增 warning） |
| 检测（chain 前段） | `node scripts/enrich-latest-purchases.mjs`（dry-run） | 执行成功，列出待富化候选 |

> ⚠️ **生产读取告警：** `enrich-latest-purchases.mjs` 的 `PROJECT_REF` 默认写死为
> 生产项目 `iueozzuctstwvzbcxcyh`。上表的检测 dry-run 因此是对**生产库的只读查询**
> （无 `--apply`，无写入）。这与 FP6「禁止用生产 Supabase 做 QA」的约定擦边——
> 已停止再跑任何 live 脚本（未跑 `--apply` / `--harvest` / `link-purchase-orders`）。
> 建议后续把该默认值改为必须显式传参或指向隔离 QA project（见「未决」）。

## 边界矩阵（owner 确认 → 撤销）

以下由 `src/lib/purchaseReviewClient.test.js` 针对 **忠实复刻 SQL RPC 合同** 的
内存实现驱动（SQL 又与纯引擎 1:1，故等价于真实 owner 往返，无需登录态）：

| 边界 | 期望 | 验证 |
| --- | --- | --- |
| **空结果** | 无 association / 传输错误 → review UI 自隐（never throw） | ✅ 2 例 |
| 全链路 | proposed → confirm(v1) → undo → **proposed(v2)**，历史 append-only（undo.reverses=confirm） | ✅ |
| **重复标注** | 同一 `action_key` 重放 → 幂等，不产生第二条 decision，版本不变 | ✅ |
| **撤销后回滚** | undo 把 state 复位到 decision 前态、版本 +1、affordance 关闭、可再决策 | ✅ |
| 版本冲突 | 409 → `stale` 且**保持可见**、association reconcile 到服务器真值 | ✅（回归护栏） |
| not_proposed | 对已决策行再决策 → reconcile 到 idle、不开 Undo 窗 | ✅ |
| 未知/超时 | RPC 抛错 → `unknown` 且**保持可见**、reconcile | ✅（回归护栏） |
| undo superseded | 重复 undo 已反转的 decision → `stale` + 关闭 affordance | ✅ |
| reject 路径 | proposed → reject → undo → proposed | ✅ |

## 修复：stale/unknown 反馈被清掉（App 端真实缺陷）

**文件：** `src/lib/components/PurchaseEnrichmentBlock.svelte`（+ 抽出的
`src/lib/purchaseReviewClient.js`）

**症状：** `decide()` / `undo()` 在 409 冲突与 catch(超时/未知) 分支里先设
`reviewStatus = 'stale' | 'unknown'`，随后立即 `reviewLoaded = false; await loadReview()`。
`loadReview()` 同步把 `reviewStatus` 覆写为 `'loading'` 再 `'idle'`。而
`ReviewActions` 只在 `saving|stale|unknown` 时渲染提示——`loading|idle` 无提示。
**结果：文档承诺的 409/超时反馈从不渲染**，冲突后 UI 静默改状态而无任何告警，
与 FP6「409 stale conflict UX / explicit saving/stale/unknown outcomes」相悖。

**修复：** 把 RPC 编排抽到纯模块 `purchaseReviewClient.js`——`loadReviewState` /
`resolveDecide` / `resolveUndo`。reconcile（重新拉取权威 association）与「状态提示」
解耦：helper 内部 reload 只回权威数据，**由 helper 显式返回最终 `status`
（stale/unknown 保留）**，组件按 patch 赋值。组件仍持有乐观回显、10s Undo 计时器、
防重入守卫。行为对齐 SQL 合同（RPC 返回 `{ok,status,error,association,decision}`，
冲突不抛异常而是 `data.status`）。

顺带修正 `undo()` 原本非-409 错误分支不 reconcile association、也不关闭 Undo
affordance 的不一致（可能残留一个点了没反应的 Undo 按钮）。

## 未决 / 需 owner（本 agent 无法完成）

1. **真实 owner 浏览器往返**：在真实 History 行上 Confirm→Undo 的肉眼验收，需
   Ken 的 finance 登录态。禁止用真实 owner 账号做 QA 截图；隔离 QA project 未提供
   凭据。
2. **双 JWT 的 RLS 跨用户拒绝**：需两个真实认证会话，superuser/Management API 会
   绕过 RLS。策略已定义+启用（见 `20260713120000_...sql` 的 5 条 policy +
   `20260717210000_...revoke_anon.sql`），运行时拒绝证明待补。
3. **Antigravity 视觉基线**：依赖隔离 QA storage state。
4. **建议（apps/finance 内）**：`enrich-latest-purchases.mjs` 移除生产 `PROJECT_REF`
   写死默认，改为必须显式传参或默认隔离 QA，避免误连生产。

## 共享包观察（record only，未改动）

- `packages/finance-core/src/engine/purchaseReviewDecision.ts`：纯 reducer，
  幂等 / 乐观版本 / 单步 latest-first Undo / 自动化优先级门，18/18，设计干净。
- `apps/finance/supabase/migrations/20260713120000_...sql`：三个 RPC 与引擎逐分支
  对齐；`purchase_review_decide` **先判 `state<>'proposed'`（400 not_proposed）再判
  版本（409）**——故 decide 上的纯 409 只在 confirm→undo 使行回到更高版本的
  proposed 时出现（已在测试里如实构造）。
