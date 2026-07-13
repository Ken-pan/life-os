# AI.OS — 本地 AI 对话(LocalAI 驱动)

ChatGPT 式私人 AI 助手,推理全部走本机 LocalAI 网关
(`http://127.0.0.1:18888`,llama-swap · OpenAI 兼容),数据不出设备。
无彩色灰阶配色。

```bash
npm exec --workspace aios-os -- vite dev   # http://localhost:5197
```

## 能力

| 能力 | 说明 | 位置 |
| --- | --- | --- |
| 流式对话 | SSE 增量渲染;快速(Qwen3.6-35B)/ 深度(Qwen3-Next-80B)切换 | `src/lib/localai.js` |
| 思考模式 | qwen `enable_thinking`,思考过程折叠展示 | 模型菜单开关 |
| 工具调用 agent loop | 原生 `tool_calls`,最多 6 轮:计算器(BigInt 精确)· 代码解释器(Worker 沙盒,无网络/DOM)· 时间 · 记忆读写 · 网页阅读(直连→CORS 代理回退) | `src/lib/tools.js` · `src/lib/chat.svelte.js` |
| 长期记忆 | 模型经 save_memory 主动写入;Qwen3-Embedding 语义召回(512 维 Matryoshka 截断)注入 system prompt;设置页可管理 | `src/lib/memory.svelte.js` |
| 视觉 | 图片附件(选择/粘贴,降采样 1568px)自动路由 vlm-fast / vlm-quality | `chat.svelte.js` 视觉路由 |
| 语音输入 | MediaRecorder → 网关 Qwen3-ASR 转写 | `Composer.svelte` |
| 自定义指令 / 温度 | system prompt 注入 + 采样温度 | 设置页「智能」 |
| 自动标题 | 首轮回复后 llm-fast 起题 | `localai.js generateTitle` |
| 安全 markdown | 零依赖白名单渲染器(代码块/表格/思考块),全量转义 | `src/lib/markdown.js` |

会话、记忆、设置全部 `localStorage`(`aios_chats_v1` / `aios_memory_v1` /
`aiosos_v1`)。网关合同见 `local-ai/docs/CONSUMING.md`;VLM/STT 服务壳的
CORS 头由 local-ai 侧 FastAPI middleware 提供(浏览器消费必需)。

## 已知边界

- `fetch_url` 回退公共 CORS 代理(corsproxy.io / allorigins)时请求离开本机,可在设置关闭。
- VLM 服务壳单线程、非流式(整块 JSON 返回,`streamChat` 已兼容);多轮图片对话的文本会被壳拍平,复杂追问建议开新对话。
- 尚未晋升(promote):brand token app 内自持;本 app 依赖 localhost 网关,公网部署意义有限。
