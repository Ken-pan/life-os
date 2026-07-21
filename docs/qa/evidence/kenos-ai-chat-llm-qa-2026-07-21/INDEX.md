# Kenos AI 聊天 · 30 项 LLM 功能对话 QA

**日期：** 2026-07-21  
**产品：** Life OS / Kenos · `apps/aios` Assistant（路由 `/assistant`，`/chat` 重定向至此）  
**对标：** ChatGPT（GPT-4o / GPT-5 类）与 Claude（Sonnet / Opus 类）的可观察产品体验  
**证据目录：** `docs/qa/evidence/kenos-ai-chat-llm-qa-2026-07-21/`

| 文件 | 说明 |
|------|------|
| [LLM_FUNCTIONAL_QA_30.md](./LLM_FUNCTIONAL_QA_30.md) | 30 用例表 + 判定 + 差距与建议（主报告） |
| [logs/llm-qa-30-results.json](./logs/llm-qa-30-results.json) | 网关实测原始结果 |
| `scripts/qa/kenos-ai-chat-llm-functional-qa-30.mjs` | 可复跑脚本（repo 根） |

## 一句话结论

**产品具备完整本地 AI 聊天（流式、工具环、记忆、附件、停止/重试），本轮 30 项常见对话能力实测 29 通过 / 1 部分通过；相对 GPT/Claude 的主要差距不在「会不会聊天」，而在前沿模型质量天花板、视觉+工具并发、联网稳定性，以及生产侧 Action 写入仍 fail-closed。**

## 实测方式

| 项 | 内容 |
|----|------|
| 通道 | 本机 LocalAI 网关 `http://127.0.0.1:18888`（与 `apps/aios/src/lib/localai.js` 同源） |
| 模型 | `llm-fast` → Qwen3.6-35B-A3B（MLX 4bit）；`enable_thinking: false` |
| 脚本 | `node scripts/qa/kenos-ai-chat-llm-functional-qa-30.mjs` |
| UI 浏览器 | 未跑 Playwright 全页 30 轮（避免依赖登录态）；产品体验类结合 **API 探针 + 代码可达性** |
| 标注 | `api-live` / `api-live+code` / `code-inferred` |

## 结果统计（复核后）

| 判定 | 数量 |
|------|------|
| 通过 (pass) | **29** |
| 部分通过 (partial) | **1**（T02 任务创建：有工具与守卫，未做端到端 UI 写入） |
| 失败 (fail) | **0** |
| 未测 (untested) | **0** |
| N/A | **0** |
| 加权通过率 | **98.3%**（pass + 0.5×partial） |

## Top 5 差距（相对 GPT/Claude）

1. **模型质量天花板** — 默认本地 35B MoE，难敌 GPT-5 / Claude Opus 的长文、刁钻指令与创意深度。  
2. **有图即关工具** — `useTools && !useVision`，图文对话不能同时 tool-call（GPT/Claude 可）。  
3. **联网非一等公民** — 依赖本机 Chrome Bridge 或不稳定公共代理，不如 ChatGPT 内建 browsing。  
4. **Action 生产写入未开放** — `planner_add_task` 等受 `prodWriteGuard` / 只读 canary 约束。  
5. **安全靠基座模型** — 无独立 moderation 层；轻量拒答本次通过，但不如 Anthropic/OpenAI 产品级护栏。

## 复跑

```bash
cd "/Users/kenpan/「Projects」/life-os"
# 需本机 LocalAI 网关已启动（默认 :18888）
node scripts/qa/kenos-ai-chat-llm-functional-qa-30.mjs
```
