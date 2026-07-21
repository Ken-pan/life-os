# 输出守卫落地复测（P0 续）

**日期：** 2026-07-21  
**产品改动：**
- 新增 `apps/aios/src/lib/replyGuard.core.js`（检测 + LLM 重写 prompt + 确定性 scrub）
- `chat.svelte.js`：流式收尾后 `maybeRewriteGuardedReply`（最多 2 轮重写 + `finalizeGuardedReply`）
- 多约束轮次静默升 `llm-quality`（`shouldPreferQualityModel`；纯「先别写代码」不升模，避免冷加载 80B）
- 单元测试：`replyGuard.core.test.js`（6 通过）

**复测：** `ONLY=MT01,MT12` + 默认 `GUARD=1`  
**日志：** [`logs/multiturn-retest-MT01-MT12.json`](./logs/multiturn-retest-MT01-MT12.json)

## 相对 Grok 4.5 基线

| ID | 基线 | Prompt-only 后 | **+ 输出守卫后** |
|----|------|----------------|------------------|
| MT01 | partial（函数/存储泄漏） | partial | **pass（turn-level clean）** — 守卫触发并 scrub 掉 SQLite/localStorage 行 |
| MT12 | partial（无更短/更具体 + 50%） | 结构 pass，仍有 50% | **pass** — `no-fabricated-metrics` 重写去掉百分比 |

## 机制（对齐网络实践）

1. Prompt 置顶纪律（最弱层，已做）  
2. **应用层验证 + 重写**（本轮）：违反硬约束 → 修订器重写 → 确定性 scrub  
3. 升模：仅刁钻多约束（可选 `QUALITY_UPGRADE=1` 在 QA；产品内默认开）

## 残留风险

- 风险讨论轮（用户未说「先别写代码」）仍可提 SQLite 作为反例 — 符合预期。  
- scrub 按行删除，极端情况下可能删掉整行验收标准；需盯回归。  
- `llm-quality` 冷启动仍重；已避免对纯「先别写代码」强制升模。
