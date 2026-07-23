/**
 * Life OS MCP 预设（纯逻辑，无 SvelteKit 依赖）。
 *
 * P2-008 / P1-002: Planner MCP create-task no longer direct-writes; hosted RPC is required.
 * Presets remain for read tools. `writeToolsBlockedUntilHostedRpc` marks unsafe automation.
 */

/** @typedef {{ id:string, name:string, url:string, enabled:boolean, token?:string, writeToolsBlockedUntilHostedRpc?:boolean }} McpServer */

export const LIFE_OS_MCP_PRESETS = [
  { id: 'lifeos_home', name: 'Kenos Home', url: 'https://home.kenos.space/api/mcp' },
  {
    id: 'lifeos_planner',
    name: 'Kenos Plan',
    url: 'https://plan.kenos.space/api/mcp',
    writeToolsBlockedUntilHostedRpc: true,
  },
  { id: 'lifeos_finance', name: 'Kenos Money', url: 'https://money.kenos.space/api/mcp' },
  { id: 'lifeos_fitness', name: 'Kenos Training', url: 'https://training.kenos.space/api/mcp' },
]

const PRESET_URLS = new Set(LIFE_OS_MCP_PRESETS.map((p) => p.url.replace(/\/$/, '')))

/** 规范化 MCP URL（去尾斜杠）便于比对。 */
export function normalizeMcpUrl(url) {
  return String(url || '').replace(/\/$/, '')
}

/** 是否为已登记的 Life OS `*.kenos.space/api/mcp` 预设。 */
export function isLifeOsMcpUrl(url) {
  return PRESET_URLS.has(normalizeMcpUrl(url))
}

/**
 * 把缺失的 Life OS MCP 预设并入列表（已有同 URL 的跳过）。
 * @param {McpServer[]} servers
 * @param {{ token?: string }} [opts]
 * @returns {{ servers: McpServer[], added: string[] }}
 */
export function mergeLifeOsMcpPresets(servers, opts = {}) {
  const list = Array.isArray(servers) ? [...servers] : []
  const byUrl = new Set(list.map((s) => normalizeMcpUrl(s.url)))
  const token = String(opts.token || '').trim() || undefined
  /** @type {string[]} */
  const added = []
  for (const p of LIFE_OS_MCP_PRESETS) {
    const url = normalizeMcpUrl(p.url)
    if (byUrl.has(url)) continue
    let id = p.id
    const taken = new Set(list.map((s) => s.id))
    let i = 2
    while (taken.has(id)) id = `${p.id}_${i++}`
    list.push({
      id,
      name: p.name,
      url: p.url,
      token,
      enabled: true,
    })
    byUrl.add(url)
    added.push(p.name)
  }
  return { servers: list, added }
}

/**
 * 登录 / JWT 续期后，把 Life OS MCP 条目的 Bearer 写成当前 token。
 * 不发现工具、不改 enabled；仅改本地配置，避免静默 401。
 * @param {McpServer[]} servers
 * @param {string} token
 * @returns {{ servers: McpServer[], updated: number }}
 */
export function refreshLifeOsMcpTokens(servers, token) {
  const nextToken = String(token || '').trim()
  if (!nextToken) return { servers: Array.isArray(servers) ? [...servers] : [], updated: 0 }
  const list = Array.isArray(servers) ? servers : []
  let updated = 0
  const out = list.map((s) => {
    if (!isLifeOsMcpUrl(s.url)) return s
    if (s.token === nextToken) return s
    updated += 1
    return { ...s, token: nextToken }
  })
  return { servers: out, updated }
}

/**
 * 登录后确保 Life OS 四站 MCP 都在列表里，并用当前 JWT 刷新 Bearer。
 * @param {McpServer[]} servers
 * @param {string} token
 * @returns {{ servers: McpServer[], added: string[], updated: number }}
 */
export function ensureLifeOsMcpFleet(servers, token) {
  const { servers: merged, added } = mergeLifeOsMcpPresets(servers, { token })
  const { servers: next, updated } = refreshLifeOsMcpTokens(merged, token)
  return { servers: next, added, updated }
}
