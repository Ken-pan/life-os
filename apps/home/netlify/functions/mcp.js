import { createClient } from '@supabase/supabase-js'
import { createMcpHandler } from '@life-os/mcp-server'
import {
  LIFE_OS_SUPABASE_URL,
  LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
} from '@life-os/sync'
import { whereIs } from '../../src/lib/spatial/where-is.js'

/**
 * Home MCP — AIOS 设置 → MCP → URL `https://home.kenos.space/api/mcp`
 * + Bearer = 用户 Life OS Supabase access_token（与云同步同 JWT）。
 */

function jwtFromRequest(request) {
  const auth = request.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

function homeClient(jwt) {
  return createClient(LIFE_OS_SUPABASE_URL, LIFE_OS_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function loadStorageZones(jwt) {
  const sb = homeClient(jwt)
  const { data, error } = await sb
    .schema('home')
    .from('storage_snapshots')
    .select('storage_zones, project_id, updated_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export default createMcpHandler({
  name: 'home',
  tools: [
    {
      name: 'ping',
      description: '连通性自检，返回 Home MCP 标识',
      inputSchema: { type: 'object', properties: {} },
      handler() {
        return 'home MCP server ok'
      },
    },
    {
      name: 'where_is',
      description:
        '在家居储藏清单中查找物品所在储藏区（按名称/标签/备注/购买标题匹配）。用户问「XX 在哪」「登山包放哪了」时使用。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '物品关键词，可多词 AND（例如：磨豆机 咖啡）',
          },
        },
        required: ['query'],
      },
      async handler(args, { request }) {
        const jwt = jwtFromRequest(request)
        if (!jwt) {
          return '需要登录：请在 AIOS 设置 → MCP 为 Home server 配置 Life OS access token。'
        }
        const query = String(args?.query ?? '').trim()
        if (!query) return whereIs([], '')
        let row
        try {
          row = await loadStorageZones(jwt)
        } catch (err) {
          return `读取储藏快照失败：${err?.message ?? err}`
        }
        if (!row?.storage_zones?.length) {
          return (
            '还没有可查询的储藏清单快照。请先在 Home 打开 /storage 并登录 Life OS，' +
            '编辑任意物品后会自动同步；再重试 where_is。'
          )
        }
        return whereIs(row.storage_zones, query)
      },
    },
  ],
})

export const config = { path: '/api/mcp' }
