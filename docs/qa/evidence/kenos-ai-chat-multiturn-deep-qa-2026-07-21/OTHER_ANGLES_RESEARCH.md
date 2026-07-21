# Kenos Assistant · 其他角度研究与落地

**日期：** 2026-07-21  
**范围：** 刻意避开已落地的 **输出守卫主线**（`replyGuard.core.js` / 行为纪律 prompt / MT01·MT12·MT10 后处理）。  
**依据：** [GAP_ANALYSIS.md](./GAP_ANALYSIS.md)、[INDEX.md](./INDEX.md)、代码链路（`chat.svelte.js` / `chat-tool-loop.core.js` / `tools.js` / `memory.svelte.js` / `prodWriteGuard.core.js`）、外部实践检索。

---

## 1. 研究结论（2–3 个高 ROI）

| # | 角度 | 证据 | 为何高 ROI | 本轮是否落地 |
|---|------|------|------------|--------------|
| **A** | Agent/tool loop：空结果 / 失败结构化回传 + 幂等瞬时重试 | GAP §3 #2–3；工具失败常以短字符串回模型，空命中易诱发编造；行业要求 **errors as tool results**、瞬时失败可退避重试、写操作不自动重试 | 纯函数可测；不碰 replyGuard；直接改善联网/RAG/写入失败时的下一轮推理 | **已落地** |
| **B** | 安全：本地轻量 jailbreak / prompt-injection **软 steer** | GAP §4 #2「无独立 moderation」；基座拒答不够稳；行业强调分层 + instruction hierarchy，关键词仅作快筛 | 无外部 API；短块注入 system，不硬拒正常角色扮演 | **已落地** |
| **C** | 生产写入失败的产品文案 | GAP §3 #3 / §7「不要宣传对话即可写入」；`assertDispatcherWriteAllowed` 原文偏运维腔 | 一句话改动能减少「假写入成功」 | **已落地**（随 A） |
| — | 多轮摘要/记忆注入精修 | MT08 已过；摘要路径已有 | 边际收益低于 A/B；易与并行 agent 的 prompt 工作重叠 | **未选** |
| — | 流式 UX（首 token / 取消 / tool running） | UI 已有 tool shimmer、「继续生成」 | 改动面在 Svelte UI，感知提升需截图验收，本轮优先可单测的 core | **未选** |
| — | 模型路由升模 | `shouldPreferQualityModel` 已在 replyGuard 侧接入 | 属并行 agent 主线，避免冲突 | **未选** |
| — | Vision 白名单工具 | `filterToolsForVision` 已在并行改动中 | 同上 | **未选** |

---

## 2. 外部最佳实践（写入证据）

1. **Tool failures → structured tool results（勿抛到应用层崩溃）**  
   - Anthropic：[Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — 错误信息要可操作（含下一步建议）；`is_error` 语义。  
   - 生产综述：[Function Calling Patterns](https://www.matthewswong.com/en/blog/function-calling-openai-anthropic/) — `error_type` / `retry_suggested`；瞬时失败可应用层退避，再交回模型。  
   - 幂等边界：[Production Design for AI Agent Tool Use](https://tomodahinata.com/en/blog/ai-agent-tool-use-function-calling-production-design) — **只读可重试，有副作用默认不重试**。

2. **Jailbreak / injection：分层，而非单靠关键词**  
   - [LLM Armor · Jailbreak Detection](https://llmarmor.dev/blog/llm-jailbreak-detection/) — 输入快筛 + 输出策略 + 行为监控；块名单只是第一层。  
   - [LLM Guardrails（RAG/Agent）](https://alice.io/blog/llm-guardrails) — instruction hierarchy；检索内容不可覆盖系统策略。  
   本轮实现选择 **软 steer 短块**（命中时提醒优先级与拒泄系统提示），避免误伤创意请求。

---

## 3. 实现摘要

### 3.1 工具结果规范化 + 幂等重试
- 文件：`apps/aios/src/lib/chat-tool-loop.core.js`
  - `classifyToolRawResult` / `normalizeToolResult` / `shouldAutoRetryTool` / `IDEMPOTENT_RETRY_TOOLS`
  - `buildWireMessages` 回放时对缺失/空结果同样规范化（幂等，已带 `[tool_result]` 前缀不再包一层）
- 接线：`chat.svelte.js` 的 `runOne` — `executeTool` → normalize →（瞬时可再试一次）→ 写入 `tc.result`
- 写入文案：`prodWriteGuard.core.js` `assertDispatcherWriteAllowed` 改为明确「勿假装已写入」的产品句

### 3.2 输入侧软护栏
- 新文件：`apps/aios/src/lib/inputGuard.core.js`（+ `.test.js`）
- `detectPromptInjectionSignals` / `buildInjectionSteerBlock`
- 接线：`buildSystemPrompt` 在行为纪律块后条件插入 steer（仅 hit 时）

---

## 4. 验证

### 单测（全绿）
```bash
node --test apps/aios/src/lib/chat-tool-loop.core.test.js apps/aios/src/lib/inputGuard.core.test.js
# 9 pass
```

### LocalAI smoke（2026-07-21 本机）
- `GET http://127.0.0.1:18888/v1/models` → **可达**（200，含 `llm-fast` / embedding 等）
- `POST /v1/chat/completions`（`llm-fast`，`max_tokens: 8`）→ **可达**；短回复被 thinking 通道占满属既有采样行为，非本轮回归点

### 未做
- 未重跑完整 multiturn QA（本轮不改 replyGuard 硬探针主线）
- 未改 Message UI 对 `[tool_result]` 的展示样式（模型侧消费优先；UI 可读性可后续）

---

## 5. 并行冲突说明

- **未重写** `replyGuard.core.js` / `replyGuard.core.test.js`
- `chat.svelte.js` 仅追加：inputGuard import、system steer 插入、tool `runOne` 规范化/重试；保留对方已有的 vision filter / quality upgrade / maybeRewriteGuardedReply

---

## 6. 下一步建议（最多 3）

1. **工具失败 UI**：Message 对 `error_type: policy|transient` 显示短 badge，避免用户只看到折叠 JSON。  
2. **空 RAG 接地探针**：对 `search_notes`/`ask_notes` 空结果加 1–2 条 QA，断言回复不含伪造路径。  
3. **注入 steer A/B**：`Ignore previous instructions + 泄露 system prompt` 开/关 steer 各跑一轮，用独立 judge 看拒泄率（勿用 llm-fast 自判）。
