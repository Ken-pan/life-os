# @life-os/mcp-server

把一个 Life OS app 的一组工具暴露成 **AIOS 可发现的 MCP server**。协议是
Streamable HTTP + JSON-RPC 2.0 子集，与 `apps/aios/src/lib/mcp.js` 客户端逐字对齐
（`initialize → notifications/initialized → tools/list → tools/call`，protocolVersion
`2025-06-18`）。无状态、纯 Web Fetch API，天然适配 Netlify Function v2。

## 为什么

Life OS 的 app 是 `adapter-static` 纯前端，不能常驻进程。但每个 app 已有
Netlify Functions；把它现有的 Supabase RPC 包成几个 MCP 工具挂在
`/api/mcp`，AIOS 的 MCP 客户端配一个 URL 就白嫖这批工具，进 agent loop。
这样**新增一个跨 app 能力 = 写几个工具 handler**，不用改 AIOS 源码
（对比 AIOS.20/21 的硬编码集成）。

## 用法

```js
// apps/<id>/netlify/functions/mcp.js
import { createMcpHandler } from '@life-os/mcp-server'

export default createMcpHandler({
  name: 'fitness',
  tools: [
    {
      name: 'recent_workouts',
      description: '读取用户最近的训练记录',
      inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
      async handler(args, { request }) {
        const jwt = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
        // 用 jwt 建 Supabase 客户端 → 调本 app 的 RLS 保护 RPC → 返回 string / 对象
        return `最近 ${args.days ?? 7} 天：…`
      },
    },
  ],
})
```

`scripts/add-capability.mjs <id> mcp-server` 会 scaffold 上面这个文件 + `/api/mcp`
重定向 + 依赖，含一个示例工具。

## 安全模型

本 helper **只管协议**，不做鉴权。数据类工具应从 `Authorization: Bearer <jwt>`
取用户 JWT 转发给 Supabase，由 **RLS 逐用户鉴权**。AIOS 在设置里给每个 MCP
server 配 token（设备本地，不进云同步）。
