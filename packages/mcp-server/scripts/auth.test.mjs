import assert from 'node:assert/strict'
import { createMcpHandler } from '../src/index.js'
import { jwtFromRequest, needLogin, userIdOf, lifeOsClient } from '../src/auth.js'

/**
 * PLAT.MCP.0 — 共享 MCP 鉴权。
 * 锁死抽出来的鉴权样板 + createMcpHandler 的声明式 auth 门：无 Bearer → 统一「未登录」
 * 文本（非 isError），有 Bearer → ctx 注入 jwt + 作用于该 JWT 的 supabase 客户端。
 */

// —— jwtFromRequest：从 Authorization 头取 Bearer ——
const reqWith = (headers) => new Request('https://x.kenos.space/api/mcp', { method: 'POST', headers })
assert.equal(jwtFromRequest(reqWith({ authorization: 'Bearer abc.def.ghi' })), 'abc.def.ghi')
assert.equal(jwtFromRequest(reqWith({ authorization: 'Bearer   spaced  ' })), 'spaced')
assert.equal(jwtFromRequest(reqWith({})), '')
assert.equal(jwtFromRequest(reqWith({ authorization: 'Basic xyz' })), '')

// —— needLogin：带/不带 appLabel ——
assert.equal(needLogin('Home'), '需要登录：请在 AIOS 设置 → MCP 为 Home server 配置 Korben access token。')
assert.equal(needLogin('Planner'), '需要登录：请在 AIOS 设置 → MCP 为 Planner server 配置 Korben access token。')
assert.match(needLogin(), /需要登录/)

// —— userIdOf：fake supabase auth.getUser ——
assert.equal(await userIdOf({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) } }), 'u-1')
assert.equal(await userIdOf({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }), '')
await assert.rejects(
  () => userIdOf({ auth: { getUser: async () => ({ data: null, error: { message: 'jwt expired' } }) } }),
  /jwt expired/,
)

// —— lifeOsClient：构造出的客户端可查询（无网络时只验形状）——
const client = lifeOsClient('some.jwt', { schema: 'home' })
assert.equal(typeof client.from, 'function')
assert.equal(typeof client.auth?.getUser, 'function')

// —— createMcpHandler 声明式 auth 门 ——
const handler = createMcpHandler({
  name: 'authapp',
  auth: { appLabel: 'Home', schema: 'home' },
  tools: [
    { name: 'ping', description: '公共', handler: () => 'pong' },
    {
      name: 'secure',
      description: '需登录',
      auth: true,
      // 回显 ctx 形状，验证注入
      handler: (_args, ctx) => ({ jwt: ctx.jwt, hasClient: typeof ctx.supabase?.from === 'function', hasReq: !!ctx.request }),
    },
  ],
})

const post = async (body, headers = {}) =>
  handler(new Request('https://x.kenos.space/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
const bodyOf = async (res) => JSON.parse(await res.text())

// tools/list：auth 工具照常出现（门只在调用时生效）
const list = await bodyOf(await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }))
assert.deepEqual(list.result.tools.map((t) => t.name), ['ping', 'secure'])

// 公共工具无 Bearer 也能调
const ping = await bodyOf(await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ping' } }))
assert.deepEqual(ping.result.content, [{ type: 'text', text: 'pong' }])
assert.equal(ping.result.isError, undefined)

// auth 工具无 Bearer → 统一「未登录」文本，且不是 isError（AIOS 直接展示给用户）
const denied = await bodyOf(await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'secure' } }))
assert.equal(denied.result.content[0].text, needLogin('Home'))
assert.equal(denied.result.isError, undefined)

// auth 工具带 Bearer → ctx 注入 jwt + supabase 客户端
const ok = await bodyOf(await post(
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'secure' } },
  { authorization: 'Bearer my.jwt.token' },
))
const echoed = JSON.parse(ok.result.content[0].text)
assert.equal(echoed.jwt, 'my.jwt.token')
assert.equal(echoed.hasClient, true)
assert.equal(echoed.hasReq, true)

console.log('auth.test.mjs: all passed')
