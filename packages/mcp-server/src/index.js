/**
 * @life-os/mcp-server — 把一组工具暴露成 AIOS 可发现的 MCP server。
 *
 * 传输：Streamable HTTP + JSON-RPC 2.0，与 apps/aios/src/lib/mcp.js 客户端逐字对齐：
 *   initialize → notifications/initialized → tools/list → tools/call
 * protocolVersion `2025-06-18`；无状态（不签发 Mcp-Session-Id，客户端也不要求）。
 *
 * 用法（Netlify Function v2，Web Fetch API 签名）：
 *   import { createMcpHandler } from '@life-os/mcp-server'
 *   export default createMcpHandler({
 *     name: 'fitness',
 *     tools: [{
 *       name: 'log_workout',
 *       description: '记录一次训练',
 *       inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
 *       async handler(args, { request }) { ... return '已记录' }  // 返回 string 或可 JSON 化对象
 *     }],
 *   })
 *
 * 安全模型（PLAT.MCP.0）：数据工具从 `Authorization: Bearer <jwt>` 取用户 JWT，转发
 * 给 Supabase 由 RLS 逐用户鉴权。声明式接法——顶层给 `auth: { appLabel, schema }`，
 * 给工具打 `auth: true`，本 helper 就在调用前取 JWT、无则回统一「未登录」提示、有则把
 * 一个作用于该 JWT 的 Supabase 客户端注入 ctx：
 *   createMcpHandler({
 *     name: 'planner',
 *     auth: { appLabel: 'Planner' },        // schema 可选（如 Home 用 'home'）
 *     tools: [
 *       { name: 'ping', handler() { return 'ok' } },              // 公共工具，免鉴权
 *       { name: 'add_task', auth: true, async handler(args, { supabase, jwt }) { ... } },
 *     ],
 *   })
 * 鉴权样板抽在 ./auth.js，且只在某个 auth 工具真被调用时才动态加载——纯协议消费者
 * （及协议单测）保持零 supabase 依赖。需要 user_id 的工具可 `import { userIdOf } from
 * '@life-os/mcp-server/auth'`。
 */

const PROTOCOL_VERSION = '2025-06-18'

/** @typedef {(args: any, ctx: { request: Request, jwt?: string, supabase?: any }) => (string | object | Promise<string | object>)} McpToolHandler */
/** @typedef {{ name: string, description?: string, inputSchema?: object, auth?: boolean, handler: McpToolHandler }} McpTool */
/** @typedef {{ appLabel?: string, schema?: string }} McpAuthOptions */

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
    Vary: 'Origin',
  }
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const toolText = (out) => ({
  content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }],
})
const toolError = (message) => ({ content: [{ type: 'text', text: String(message) }], isError: true })

/**
 * @param {{ name?: string, version?: string, tools?: McpTool[], auth?: McpAuthOptions }} options
 * @returns {(request: Request) => Promise<Response>}
 */
export function createMcpHandler(options) {
  const { name = 'life-os-app', version = '1.0.0', tools = [], auth } = options || {}
  const byName = new Map(tools.map((t) => [t.name, t]))

  return async function handler(request) {
    const origin = request.headers.get('origin') || '*'
    const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers })

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
    if (request.method !== 'POST') return json(rpcError(null, -32600, '仅支持 POST'), 405)

    let msg
    try {
      msg = await request.json()
    } catch {
      return json(rpcError(null, -32700, 'JSON 解析失败'), 400)
    }

    const { id, method, params } = msg || {}

    // notification（无 id）：确认收到，不回 body
    if (id == null && typeof method === 'string' && method.startsWith('notifications/')) {
      return new Response(null, { status: 202, headers: corsHeaders(origin) })
    }

    try {
      if (method === 'initialize') {
        return json(
          rpcResult(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name, version },
          }),
        )
      }
      if (method === 'tools/list') {
        return json(
          rpcResult(id, {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description || t.name,
              inputSchema: t.inputSchema || { type: 'object', properties: {} },
            })),
          }),
        )
      }
      if (method === 'tools/call') {
        const tool = byName.get(params?.name)
        if (!tool) return json(rpcResult(id, toolError(`未知工具 ${params?.name}`)))
        let ctx = { request }
        if (tool.auth) {
          // Lazy-load the auth helpers so pure-protocol consumers never pull supabase.
          const { jwtFromRequest, lifeOsClient, needLogin } = await import('./auth.js')
          const jwt = jwtFromRequest(request)
          if (!jwt) return json(rpcResult(id, toolText(needLogin(auth?.appLabel))))
          ctx = { request, jwt, supabase: lifeOsClient(jwt, { schema: auth?.schema }) }
        }
        try {
          const out = await tool.handler(params?.arguments || {}, ctx)
          return json(rpcResult(id, toolText(out)))
        } catch (err) {
          return json(rpcResult(id, toolError(err?.message || err)))
        }
      }
      return json(rpcError(id, -32601, `未知方法：${method}`))
    } catch (err) {
      return json(rpcError(id, -32603, err?.message || '内部错误'))
    }
  }
}
