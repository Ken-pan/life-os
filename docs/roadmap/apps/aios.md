# AIOS Roadmap

**云端只读版：** [aios-kenos.netlify.app](https://aios-kenos.netlify.app) · **Workspace：** `aios-os` · **Dev 端口：** 5197 · **ID 前缀：** `AIOS`

> **层级：实验 / 本地优先。** 与六个 canonical web 站不同：AIOS 是**原生 Mac app**(Tauri v2 壳，装在 `/Applications`)，推理全部走本机 LocalAI 网关(`127.0.0.1:18888`，llama-swap · OpenAI 兼容)+ 本地生图，数据不出设备。Netlify 上的 `aios-kenos.netlify.app` 只是**登录后查看已同步对话/记忆/图片的只读查看器**(`VITE_AIOS_CLOUD=1`)——生成新回复需连回运行本地网关的机器。

## 一句话

私人 AI 助手(ChatGPT 式)，本机推理零数据外泄；已接 Life OS 统一账户(共享 SSO / `@life-os/sync`)，读跨 app `core_*` 快照、经 `life_events` 收件箱写回 Planner。**当前进度 AIOS.1–AIOS.25。**

## 当前能力（已落地）

| 域 | 状态 | 要点 |
| --- | --- | --- |
| 流式对话 / 思考模式 | ✅ | SSE 增量;快速(Qwen3.6-35B)/深度(Qwen3-Next-80B)切换;`enable_thinking` 折叠展示 |
| 工具 agent loop | ✅ | 原生 `tool_calls` ≤6 轮:网页搜索/阅读 · 计算器(BigInt) · 代码解释器(Worker 沙盒) · 时间 · 记忆读写 |
| 长期记忆 | ✅ | 模型主动 `save_memory`;Qwen3-Embedding 语义召回(512 维 Matryoshka);**AIOS.25** 对话后被动萃取稳定事实 |
| 笔记库检索 | ✅ | Obsidian vault BM25+向量 RRF + qwen3-reranker 重排;`search_notes` / `read_note` 带 Obsidian 深链 |
| 多模态 / 语音 | ✅ | 图片附件路由 vlm-fast/quality;MediaRecorder→Qwen3-ASR 转写;回复 Kokoro/Qwen3 TTS 流式朗读 |
| 文件导入 | ✅ | PDF(扫描件转 VLM) · DOCX/PPTX/XLSX/EPUB · 音频转写 · 30+ 文本扩展名 |
| 侧栏预览面板 | ✅ | Artifacts 沙盒 iframe 实时渲染 · **AIOS.24** 可编辑 Canvas(只读渲染→活文档) · 内建阅读器 |
| 本地生图 | ✅ | mflux 三档(Z-Image-Turbo/Qwen-Image/Edit-2509)+ 角色/风格一致性 + 批量;经 `/upstream/image` |
| 今日/时效感知 | ✅ | **AIOS.15–19** 系统提示织入:Obsidian 日报(Teams/Outlook/Jira/RSS) · git pulse · 所在地 · 动态首页建议 |
| Life OS 跨 app 打通 | ✅ | **AIOS.20** 读今日快照/财务/待办注入系统提示;**AIOS.21** 经 `life_events` 收件箱往 Planner 加待办 |
| 主动性 | ✅ | **AIOS.22** 早晨今日简报(原生通知) |
| MCP 客户端 | ✅ | **AIOS.23** HTTP 接外部 MCP server,一次接入一批工具 |
| 云同步 | ✅ | Life OS 统一 Supabase(aios schema:对话+记忆+画像/设置);本地优先 LWW+墓碑;回前台自动同步;按需图片懒加载 |
| 云端只读版门禁 | ✅ | **AIOS.13** 无账户/非本人一律挡外;无网关降级 UX |
| 原生壳 / 权限中心 | ✅ | Tauri v2;自有 Dock 图标;`native.js` 工具(委派 agent/GUI 操控);设置页权限预检/请求/深链 |

## Next（按 ROI）

| ID | 主题 | 桶 | 备注 |
| --- | --- | --- | --- |
| **HOME.MCP.13**（跨 OS） | `where_is` → AIOS | Product | 稳定化护栏已落地后，优先接 Home 日用工具面 |

**AIOS.STABLE.26 ✅（2026-07-17）：** `npm test -w aios-os` **25/25** — 抽出纯 core：`chat-tool-loop`（wire 回放 / 生图误触发）· `cloud-sync`（LWW/墓碑）· `lifeos`（AIOS.20 快照格式化 + AIOS.21 payload）· `local-tools`（calculate / webAccess 过滤）。运行时模块已接线。

> AIOS 2026-07-13 建站、两天内推进到 AIOS.25。能力面已经足够宽；STABLE.26 把 20–25 关键链路变成可回归验证后，再扩 MCP（如 `HOME.MCP.13`）。

## Parked / 待研判

- Portal 接入:目前 Portal **未收录** AIOS(0 引用)——是否作为第七卡 / 启动器入口进 Portal 待定。
- 云端「生成」能力:当前云端仅只读;是否支持云端直连本地网关(**AIOS.14** 网关地址可配置已铺路)。
- 跨 app **写** 能力扩展:目前仅 Planner(经 `life_events`);Finance/Fitness 写路径待研判。

## 实现锚点

| 域 | 文件 / 位置 |
| --- | --- |
| 对话 / 工具 loop | `src/lib/chat.svelte.js` · `src/lib/tools.js` · `src/lib/localai.js` |
| 记忆 | `src/lib/memory.svelte.js` |
| 笔记检索 | `src/lib/tools.js` · `local-ai/services/knowledge/vault_server.py` |
| 预览面板 / Canvas | `src/lib/panel.svelte.js` · `SidePanel.svelte` |
| 云同步 / SSO | `src/lib/cloud.svelte.js` · `src/lib/supabase.js` · `src/lib/lifeos.js` |
| 原生壳 | `src-tauri/` · `src/lib/native.js` |
| 云端只读配置 | `netlify.toml`(`VITE_AIOS_CLOUD=1`) |

## 验收命令

```bash
npm exec --workspace aios-os -- vite dev   # http://localhost:5197
npm run build -w aios-os                    # 云端只读版构建
npm run app:aios                            # 更新原生 Mac app
```

## 集成

```text
LocalAI 网关(127.0.0.1:18888)──推理──► AIOS(本机)
Life OS core_* ──read──► 今日快照/财务/待办 注入系统提示(AIOS.20)
AIOS ──write via life_events 收件箱──► Planner 待办(AIOS.21)
本地 aios schema ──LWW 同步──► Life OS Supabase ──► aios-kenos.netlify.app(只读)
```
