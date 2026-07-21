# 改进有效性验证（A/B · 2026-07-21）

**问题：** Prompt 置顶 + 输出守卫是否**真实有效**，还是只是评测自嗨？  
**方法：** 同一网关、同一 `llm-fast`、同一 4 场景，各跑一遍：

| 臂 | 命令 | 日志 |
|----|------|------|
| 对照 | `GUARD=0 ONLY=MT01,MT04,MT10,MT12` | [`logs/ab-guard-OFF.json`](./logs/ab-guard-OFF.json) |
| 实验 | `GUARD=1 ONLY=MT01,MT04,MT10,MT12` | [`logs/ab-guard-ON.json`](./logs/ab-guard-ON.json) |
| 机器对比 | `replyGuard` 检测器 + 软启发 | [`logs/ab-guard-comparison.json`](./logs/ab-guard-comparison.json) |

另：**Grok 4.5 人工读 transcript**（不采信本地 judge 的 100%）。

---

## 总判（一句话）

**输出守卫对 MT01 / MT12 的硬约束泄漏是真实、可复现有效的；Prompt 对 MT04 / MT10 的「首轮克制」有中等、不稳定收益；无回归。**

| 改进层 | 是否真实有效 | 证据强度 |
|--------|--------------|----------|
| 输出守卫（先别写代码 / 禁假 %） | **是** | A/B 对照 + 检测器 + 原文 diff |
| Prompt 澄清预算（MT04） | **是（本轮）** | 两臂均 3 问+假设方案；相对最早基线明显 |
| Prompt 焦虑先给今日事（MT10） | **部分有效** | 已把「今天 2 小时」置顶，但仍附带 12 周表 |
| 本地 LLM judge 打 100% | **不可信** | 两臂都报 pass，掩盖 OFF 臂硬违规 |

---

## 逐场景（Grok 4.5）

### MT01 · 先别写代码 — 守卫有效 ★

| | GUARD=0 | GUARD=1 |
|--|---------|---------|
| T1 硬违规 | **有**（SQLite / 本地 JSON 选型写进验收） | **无**（触发 1 次 rewrite+scrub） |
| 判定 | fail-constraint | **pass-constraint** |

OFF 原文片段：`数据来源（本地 JSON、SQLite 还是手动输入）`  
ON：改为「暂不涉及具体技术实现 / 界面草图 / 交互流程」类产品语言。

**结论：改进真实。** 无守卫时模型仍越界；有守卫时硬约束干净。

### MT12 · 更短/更具体 + 禁假百分比 — 守卫有效 ★

| | GUARD=0 | GUARD=1 |
|--|---------|---------|
| 改写结构 | 有「更短版/更具体版」 | 同左 |
| 无依据 % | **有**（`提升 50%`） | **无**（guardHits=1） |
| 判定 | partial | **pass-constraint** |

**结论：改进真实。** Prompt  alone 已能出双维结构，但假百分比仍靠守卫清掉。

### MT04 · 澄清预算 — Prompt 有效（本轮）

两臂回复几乎相同（len=558）：**恰好 3 个关键问题 + 假设最小方案**。  
相对最早基线（长问卷、无假设方案）是真实进步；**与 GUARD 无关**（guardHits=0）。

自动启发式曾误判为 weak（把方案里的 1.2.3. 步骤算进「问题数」）——已在人工复核中纠正为 **pass-soft**。

### MT10 · 焦虑首动 — Prompt 部分有效

两臂均：**先给「今天 2 小时一件事」**，随后仍附 **12 周表**。  
相对最早基线「先甩 12 周冲刺」有改进，但未完全做到「先一事、长计划要用户要才给」。  
判定：**partial-soft**（守卫不参与）。

---

## 有效性结论矩阵

| 声称 | 是否成立 |
|------|----------|
| 「加了 prompt 就全面对齐 GPT/Claude」 | **不成立** |
| 「输出守卫能堵住先别写代码 / 假 %」 | **成立（A/B 证明）** |
| 「澄清预算 prompt 有用」 | **成立（本轮稳态）** |
| 「焦虑场景只给今日一事」 | **部分成立**（置顶有，尾巴仍长） |
| 「开守卫会弄坏其它场景」 | **本轮未观察到回归** |

---

## 还不够的地方（诚实）

1. **MT10**：应用层还可加「焦虑类意图 → 首轮只输出今日行动，禁止附带多周表」的结构守卫（类似 no-code scrub）。  
2. **随机性**：单次 A/B；温度 0.3 下 MT04/MT10 两臂几乎同文，说明差异主要来自守卫触发点，不是采样噪声。  
3. **未测**：完整 12 场景、UI 登录态、`llm-quality` 升模冷启动、有图+工具。

---

## 复现

```bash
ONLY=MT01,MT04,MT10,MT12 GUARD=0 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs
# 将输出 json 存为 logs/ab-guard-OFF.json

ONLY=MT01,MT04,MT10,MT12 GUARD=1 node scripts/qa/kenos-ai-chat-multiturn-deep-qa.mjs
# 存为 logs/ab-guard-ON.json
```
