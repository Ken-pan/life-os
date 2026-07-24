/**
 * @life-os/mcp-server/auth — 共享 MCP 鉴权（PLAT.MCP.0）。
 *
 * Home（where_is）与 Planner（任务 CRUD）两个 MCP 面各自重复了同一套鉴权样板：
 * 从 `Authorization: Bearer <jwt>` 取 JWT → 造一个带该 JWT 的 Supabase 客户端
 * （让 RLS 逐用户鉴权）→ 需要时 `auth.getUser()` 取 user_id。两消费者达到「≥2 才
 * 提取」的门槛，抽到这里；之后 Finance/Fitness/Knowledge 的 MCP 都近零成本。
 *
 * 只抽鉴权/客户端样板，不碰业务工具。协议仍由 ./index.js 的 createMcpHandler 管。
 *
 * 这个模块 import 了 @supabase/supabase-js + @life-os/sync，所以 createMcpHandler
 * 的基础导出（'.'）刻意不静态引它——只有声明了 `auth` 的工具被调用时才动态加载，
 * 纯协议消费者（及协议单测）保持零 supabase 依赖。
 */

import { createClient } from '@supabase/supabase-js'
import {
  LIFE_OS_SUPABASE_URL,
  LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
} from '@life-os/sync'

/**
 * 从请求的 Authorization 头取 Bearer JWT（无则空串）。
 * @param {Request} request
 * @returns {string}
 */
export function jwtFromRequest(request) {
  const auth = request?.headers?.get?.('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

/**
 * 造一个作用于用户 JWT 的 Life OS Supabase 客户端——所有读写都过该用户的 RLS。
 * 无状态（不持久化/不自动刷新），一次请求一个客户端。`schema` 可把默认 schema
 * 定到某个 app 库（如 Home 的 'home'），省得每次 `.schema(...)`。
 * @param {string} jwt
 * @param {{ schema?: string }} [options]
 */
export function lifeOsClient(jwt, { schema } = {}) {
  /** @type {Record<string, any>} */
  const options = {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }
  if (schema) options.db = { schema }
  return createClient(LIFE_OS_SUPABASE_URL, LIFE_OS_SUPABASE_PUBLISHABLE_KEY, options)
}

/**
 * 取当前 JWT 对应的 user_id（无用户则空串）。写入 user_id 拥有列的工具需要它。
 * @param {{ auth: { getUser: () => Promise<{ data: any, error: any }> } }} supabase
 * @returns {Promise<string>}
 */
export async function userIdOf(supabase) {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  return data?.user?.id || ''
}

/**
 * 统一的「未登录」提示——AIOS 用户在设置里为该 app 的 MCP server 配 token。
 * @param {string} [appLabel] 展示用 app 名（如 'Home' / 'Planner'）
 * @returns {string}
 */
export function needLogin(appLabel) {
  const who = appLabel ? `${appLabel} ` : ''
  return `需要登录：请在 AIOS 设置 → MCP 为 ${who}server 配置 Korben access token。`
}
