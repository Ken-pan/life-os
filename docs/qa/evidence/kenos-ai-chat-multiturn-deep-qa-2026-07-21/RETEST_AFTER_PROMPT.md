# Prompt 改进复测（网络实践落地后）

**日期：** 2026-07-21  
**改动：** `apps/aios/src/lib/chat.svelte.js` → `buildSystemPrompt` 置顶「行为纪律」短块  
**依据（网络检索）：**
- 显式 **priority order** / 约束置顶（primacy），避免 instruction-following cliff  
- **具体负向约束**（不要泛泛 “别啰嗦”）  
- **澄清预算**（≤3 问或假设方案）  
- **诚实/禁编造数字** + 多约束改写成对输出  

**复测命令：** `ONLY=MT01,MT04,MT10,MT12 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs`  
**原始日志：** [`logs/multiturn-retest-MT01-04-10-12.json`](./logs/multiturn-retest-MT01-04-10-12.json)

## Grok 4.5 对照（改进前 → 改进后）

| ID | 改进前 | 改进后（人工复核 transcript） | 变化 |
|----|--------|------------------------------|------|
| MT01 | partial：先别写代码仍铺函数/存储 | **仍 partial**：阶段/验收更好，但仍出现 JSON/SQLite、`getTodayRecords` | 结构↑，硬禁令未完全吃住 |
| MT04 | pass（问卷过长） | **pass↑**：严格 3 问 + 假设方案并列 | 澄清预算生效 |
| MT10 | pass（relevancy 3，先甩 12 周） | **pass↑**：首轮直接给「今天 2 小时一件事」 | 阻塞路由生效 |
| MT12 | partial：无更短/更具体结构 | **pass（结构）**：出现「更短版 / 更具体版」；**仍有「提升 50%」幻觉** | 改写结构修好；数字诚实未完全吃住 |

## 结论

- **Prompt 置顶纪律有效**：MT04 / MT10 / MT12 结构类问题明显改善。  
- **未一次修完**：MT01「先别写代码」、MT12 无依据百分比 —— 符合行业结论「prompt 是最弱一层，需后处理/升模/验证」。  
- **下一步（仍属网络最佳实践）：**  
  1. 对「先别写代码」做输出侧轻量检测（出现 \`\`\` / `function` 则自动重写一刀）  
  2. 对营销文案禁 `%` / 「提升」数字，除非用户提供  
  3. 刁钻多约束轮次建议升 `llm-quality`

## 产品代码落点

```395:420:apps/aios/src/lib/chat.svelte.js
// 回复优先级(冲突时按序) …
// 澄清预算 … 阻塞/焦虑 … 先别写代码 … 多约束改写 …
```
