import assert from 'node:assert/strict'
import { createMcpHandler } from '../src/index.js'

/**
 * 锁死与 AIOS MCP 客户端（apps/aios/src/lib/mcp.js）的协议契约。
 * 客户端只实现子集：initialize → notifications/initialized → tools/list → tools/call，
 * 并按 `result.content[].text` / `result.isError` 解析。下面每条断言都对应客户端的一处解析。
 */

const handler = createMcpHandler({
  name: 'testapp',
  version: '9.9.9',
  tools: [
    {
      name: 'echo',
      description: '回显',
      inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
      handler: (args) => `echo:${args.msg}`,
    },
    { name: 'obj', description: '返回对象', handler: () => ({ a: 1 }) },
    {
      name: 'boom',
      description: '抛错',
      handler: () => {
        throw new Error('炸了')
      },
    },
  ],
})

const post = async (body, headers = {}) =>
  handler(
    new Request('https://x.kenos.space/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
const bodyOf = async (res) => JSON.parse(await res.text())

// —— CORS 预检：AIOS 从 tauri:// 或 localhost 跨源调用，preflight 必须过 ——
const pre = await handler(
  new Request('https://x.kenos.space/api/mcp', { method: 'OPTIONS', headers: { origin: 'http://localhost:5197' } }),
)
assert.equal(pre.status, 204)
assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5197')

// —— initialize：客户端读 result.protocolVersion / serverInfo ——
const init = await bodyOf(await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }))
assert.equal(init.jsonrpc, '2.0')
assert.equal(init.id, 1)
assert.equal(init.result.protocolVersion, '2025-06-18')
assert.deepEqual(init.result.capabilities, { tools: {} })
assert.deepEqual(init.result.serverInfo, { name: 'testapp', version: '9.9.9' })

// —— notification（无 id）：客户端 fire-and-forget，不解析 body ——
const notif = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
assert.equal(notif.status, 202)
assert.equal(await notif.text(), '')

// —— tools/list：客户端读 result.tools[].name / description / inputSchema ——
const list = await bodyOf(await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }))
assert.deepEqual(
  list.result.tools.map((t) => t.name),
  ['echo', 'obj', 'boom'],
)
assert.equal(list.result.tools[0].inputSchema.properties.msg.type, 'string')
// 无 inputSchema 的工具必须补默认值：客户端要求 parameters 是对象
assert.deepEqual(list.result.tools[1].inputSchema, { type: 'object', properties: {} })

// —— tools/call：客户端从 result.content[] 里取 type==='text' 的 text ——
const call = await bodyOf(await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { msg: 'hi' } } }))
assert.deepEqual(call.result.content, [{ type: 'text', text: 'echo:hi' }])

// 非字符串返回值要 JSON 序列化成 text（客户端只认 text）
const objCall = await bodyOf(await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'obj' } }))
assert.equal(JSON.parse(objCall.result.content[0].text).a, 1)

// —— handler 抛错 → isError 结果（不是 RPC error）：客户端靠 result.isError 分支 ——
const boom = await bodyOf(await post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom' } }))
assert.equal(boom.result.isError, true)
assert.match(boom.result.content[0].text, /炸了/)
assert.equal(boom.error, undefined)

// —— 未知工具同样走 isError，而非 RPC error ——
const unknownTool = await bodyOf(await post({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope' } }))
assert.equal(unknownTool.result.isError, true)
assert.equal(unknownTool.error, undefined)

// —— 未知方法 → 标准 JSON-RPC error ——
const unknownMethod = await bodyOf(await post({ jsonrpc: '2.0', id: 7, method: 'foo/bar' }))
assert.equal(unknownMethod.error.code, -32601)

// —— 坏 JSON → parse error，不抛 ——
const badJson = await handler(
  new Request('https://x.kenos.space/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }),
)
assert.equal(badJson.status, 400)
assert.equal((await bodyOf(badJson)).error.code, -32700)

// —— 非 POST → 405 ——
assert.equal((await handler(new Request('https://x.kenos.space/api/mcp', { method: 'GET' }))).status, 405)

console.log('mcpHandler.test.mjs: all passed')
