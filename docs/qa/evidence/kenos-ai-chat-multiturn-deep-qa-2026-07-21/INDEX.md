# Kenos AI 聊天 · 多轮深入对话 QA

**日期：** 2026-07-21  
**采信评分：** Grok 4.5 基线 → Prompt 改进 → **输出守卫（本轮）**

| 文件 | 说明 |
|------|------|
| [GAP_ANALYSIS.md](./GAP_ANALYSIS.md) | 差距分层与优化优先级 |
| [AUDIT.md](./AUDIT.md) | Grok 4.5 基线审核 |
| [RETEST_AFTER_PROMPT.md](./RETEST_AFTER_PROMPT.md) | Prompt 置顶后复测 |
| [RETEST_REPLY_GUARD.md](./RETEST_REPLY_GUARD.md) | **输出守卫落地复测** |
| [EFFECTIVENESS_AB.md](./EFFECTIVENESS_AB.md) | A/B：先别写代码 / 假 % |
| [RETEST_ANXIETY_GUARD.md](./RETEST_ANXIETY_GUARD.md) | A/B：焦虑首轮禁多周表 |
| [RETEST_FORMAT_CLARIFY_GUARD.md](./RETEST_FORMAT_CLARIFY_GUARD.md) | **A/B：strict-format / clarify-budget（最新）** |
| [OTHER_ANGLES_RESEARCH.md](./OTHER_ANGLES_RESEARCH.md) | **其他角度：工具结果规范化 + 本地注入软护栏** |
| [logs/ab-guard-OFF.json](./logs/ab-guard-OFF.json) / [ab-guard-ON.json](./logs/ab-guard-ON.json) | A/B 原始对话 |
| [logs/ab-format-clarify-OFF.json](./logs/ab-format-clarify-OFF.json) / [ab-format-clarify-ON.json](./logs/ab-format-clarify-ON.json) | 格式/澄清 A/B 原始对话 |
| [logs/grok45-judge-results.json](./logs/grok45-judge-results.json) | 基线 12 场景 Grok 打分 |
| [logs/multiturn-retest-MT01-MT12.json](./logs/multiturn-retest-MT01-MT12.json) | 守卫后 MT01/MT12 |
| `apps/aios/src/lib/replyGuard.core.js` | 检测 / 重写 / scrub |
| `scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs` | 复跑（`ONLY=` / `GUARD=` / `QUALITY_UPGRADE=`） |

## 最新结论（有效性 A/B）

- **守卫真实有效：** MT01（先别写代码）、MT12（假百分比）、MT10（焦虑禁多周表）、**MT03（字数上限 / strict-format）** — 见 [EFFECTIVENESS_AB.md](./EFFECTIVENESS_AB.md) / [RETEST_ANXIETY_GUARD.md](./RETEST_ANXIETY_GUARD.md) / [RETEST_FORMAT_CLARIFY_GUARD.md](./RETEST_FORMAT_CLARIFY_GUARD.md)  
- **Prompt 部分有效 / 本轮基线已好：** MT04 澄清预算（守卫有假阳性计数风险）  
- **不要信本地 judge 的 100%：** 会掩盖关守卫时的硬违规

## 复跑

```bash
ONLY=MT01,MT12,MT10 GUARD=0 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs
ONLY=MT01,MT12,MT10 GUARD=1 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs
ONLY=MT03,MT04,MT05 GUARD=0 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs
ONLY=MT03,MT04,MT05 GUARD=1 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs
node --test apps/aios/src/lib/replyGuard.core.test.js
```
