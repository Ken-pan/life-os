import { browser } from '$app/environment'
import {
  LIFE_OS_MCP_PRESETS,
  isLifeOsMcpUrl,
  mergeLifeOsMcpPresets,
  refreshLifeOsMcpTokens,
  ensureLifeOsMcpFleet,
} from './mcp.presets.js'

export {
  LIFE_OS_MCP_PRESETS,
  isLifeOsMcpUrl,
  mergeLifeOsMcpPresets,
  refreshLifeOsMcpTokens,
  ensureLifeOsMcpFleet,
}

/**
 * MCP 客户端(HTTP / Streamable HTTP 传输)。
 * 让 AIOS 消费外部 MCP server 的工具:配一个 URL,server 的工具就自动出现在
 * agent loop 里,一次接入白嫖一批能力,不用逐个手写。
 *
 * 只做 HTTP 传输(远程或本机已在跑的 HTTP MCP server),纯 JS 不碰 Rust。
 * server 配置设备本地(URL/token 常与设备绑定,也可能含密钥,不进云同步)。
 *
 * 协议子集:initialize → notifications/initialized → tools/list → tools/call。
 * 响应兼容 application/json 与 text/event-stream(SSE 里取匹配 id 的那条)。
 */

const CFG_KEY = 'aios_mcp_servers_v1'
const PROTOCOL_VERSION = '2025-06-18'

/** @typedef {{ id:string, name:string, url:string, enabled:boolean, token?:string }} McpServer */

/* —————————————————————— 配置(设备本地) —————————————————————— */

/** @returns {McpServer[]} */
export function loadServers() {
  if (!browser) return []
  try {
    const arr = JSON.parse(localStorage.getItem(CFG_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** @param {McpServer[]} servers */
export function saveServers(servers) {
  if (!browser) return
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(servers))
  } catch {
    /* 存不下不影响本次运行 */
  }
}

/** 生成一个只含 [a-z0-9_] 的短 id(工具名要拼进去,受函数名字符集限制) */
export function slugifyId(name) {
  const base = String(name || 'server')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  return base || 'server'
}

/* —————————————————————— HTTP JSON-RPC —————————————————————— */

/** @type {Map<string, string>} serverId → mcp-session-id(内存态) */
const sessions = new Map()
let rpcSeq = 1

/** 解析一次响应体:JSON 直接取,SSE 取匹配 id 的 data 帧 */
async function parseRpcResponse(res, wantId) {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    const text = await res.text()
    let last = null
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      try {
        const msg = JSON.parse(raw)
        if (msg?.id === wantId) return msg
        if (msg?.id != null) last = msg
      } catch {
        /* 跳过非 JSON data 帧 */
      }
    }
    return last
  }
  const txt = await res.text()
  if (!txt.trim()) return null
  return JSON.parse(txt)
}

/**
 * 发一次 JSON-RPC 请求;notification(无 id)不等响应。
 * @param {McpServer} server
 */
async function rpc(server, method, params, { notify = false } = {}) {
  const id = notify ? undefined : rpcSeq++
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (server.token) headers.Authorization = `Bearer ${server.token}`
  const sid = sessions.get(server.id)
  if (sid) headers['Mcp-Session-Id'] = sid

  const res = await fetch(server.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id }) }),
    signal: AbortSignal.timeout(30000),
  })

  const newSid = res.headers.get('mcp-session-id')
  if (newSid) sessions.set(server.id, newSid)

  if (notify) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`)
  }
  const msg = await parseRpcResponse(res, id)
  if (msg?.error) throw new Error(msg.error.message || `RPC 错误 ${msg.error.code}`)
  return msg?.result ?? null
}

/** 握手:initialize + notifications/initialized。失败会抛。 */
async function initialize(server) {
  sessions.delete(server.id)
  const result = await rpc(server, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'AI.OS', version: '1.0' },
  })
  await rpc(server, 'notifications/initialized', undefined, { notify: true }).catch(() => {})
  return result
}

/* —————————————————————— 工具发现 & 桥接 —————————————————————— */

/** @type {Array<{ name:string, serverId:string, origName:string, def:object }>} */
let toolCache = []
let lastRefreshAt = 0

/** 拼桥接工具名:mcp__<serverId>__<tool>,裁到 <=60 字符,只留合法字符 */
function bridgeName(serverId, origName) {
  const clean = String(origName).replace(/[^a-zA-Z0-9_-]/g, '_')
  let name = `mcp__${serverId}__${clean}`
  if (name.length > 60) name = name.slice(0, 60)
  return name
}

/**
 * 拉取所有已启用 server 的工具,刷新缓存。单个 server 失败不影响其它。
 * @returns {Promise<{ ok:number, failed:Array<{name:string,error:string}> }>}
 */
export async function refreshMcpTools() {
  if (!browser) return { ok: 0, failed: [] }
  const servers = loadServers().filter((s) => s.enabled && s.url)
  const next = []
  const failed = []
  let ok = 0
  for (const server of servers) {
    try {
      await initialize(server)
      const result = await rpc(server, 'tools/list', {})
      const tools = Array.isArray(result?.tools) ? result.tools : []
      for (const tool of tools) {
        const name = bridgeName(server.id, tool.name)
        next.push({
          name,
          serverId: server.id,
          origName: tool.name,
          def: {
            type: 'function',
            function: {
              name,
              description:
                `[${server.name}] ${tool.description || tool.name}`.slice(0, 1024),
              parameters:
                tool.inputSchema && typeof tool.inputSchema === 'object'
                  ? tool.inputSchema
                  : { type: 'object', properties: {} },
            },
          },
        })
      }
      ok++
    } catch (err) {
      failed.push({ name: server.name, error: err?.message ?? String(err) })
    }
  }
  toolCache = next
  lastRefreshAt = Date.now()
  return { ok, failed }
}

/** agent loop 用:当前已发现的 MCP 工具定义(OpenAI function 格式) */
export function mcpToolDefinitions() {
  return toolCache.map((t) => t.def)
}

export function isMcpTool(name) {
  return typeof name === 'string' && name.startsWith('mcp__')
}

/** 已发现工具数(设置页展示) */
export function mcpToolCount() {
  return toolCache.length
}

export function mcpLastRefreshAt() {
  return lastRefreshAt
}

/**
 * 执行一个桥接的 MCP 工具:路由到对应 server 的 tools/call,抽出文本结果。
 * @returns {Promise<string>}
 */
export async function executeMcpTool(name, args) {
  const entry = toolCache.find((t) => t.name === name)
  if (!entry) return `错误:未知 MCP 工具 ${name}(可能需要在设置里刷新)`
  const server = loadServers().find((s) => s.id === entry.serverId)
  if (!server) return `错误:MCP server 已移除(${entry.serverId})`
  try {
    const result = await rpc(server, 'tools/call', {
      name: entry.origName,
      arguments: args && typeof args === 'object' ? args : {},
    })
    const parts = Array.isArray(result?.content) ? result.content : []
    const text = parts
      .map((p) => {
        if (p?.type === 'text') return p.text
        if (p?.type === 'resource' && p.resource?.text) return p.resource.text
        return p?.type ? `[${p.type}]` : ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
    if (result?.isError) return `MCP 工具报错:${text || '(无详情)'}`
    return text || '(工具执行成功,无文本输出)'
  } catch (err) {
    return `MCP 工具执行失败:${err?.message ?? err}`
  }
}

/** 测试单个 server 连通性:initialize + tools/list,返回工具名列表或错误。 */
export async function testServer(server) {
  try {
    await initialize(server)
    const result = await rpc(server, 'tools/list', {})
    const tools = Array.isArray(result?.tools) ? result.tools : []
    return { ok: true, tools: tools.map((t) => t.name) }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}
