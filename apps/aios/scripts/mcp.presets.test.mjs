import assert from 'node:assert/strict'
import {
  LIFE_OS_MCP_PRESETS,
  isLifeOsMcpUrl,
  mergeLifeOsMcpPresets,
  refreshLifeOsMcpTokens,
  ensureLifeOsMcpFleet,
} from '../src/lib/mcp.presets.js'

assert.equal(LIFE_OS_MCP_PRESETS.length, 4)
assert.equal(isLifeOsMcpUrl('https://money.kenos.space/api/mcp/'), true)
assert.equal(isLifeOsMcpUrl('https://evil.example/api/mcp'), false)

{
  const { servers, added } = mergeLifeOsMcpPresets([], { token: 'abc' })
  assert.equal(servers.length, 4)
  assert.equal(added.length, 4)
  assert.equal(servers[0].token, 'abc')
  assert.equal(servers.every((s) => s.enabled), true)
}

{
  const first = mergeLifeOsMcpPresets([], { token: 't1' }).servers
  const { added } = mergeLifeOsMcpPresets(first, { token: 't2' })
  assert.equal(added.length, 0)
}

{
  const base = mergeLifeOsMcpPresets([], { token: 'old' }).servers
  const withCustom = [
    ...base,
    { id: 'custom', name: 'Other', url: 'https://example.com/mcp', token: 'keep', enabled: true },
  ]
  const { servers, updated } = refreshLifeOsMcpTokens(withCustom, 'fresh')
  assert.equal(updated, 4)
  assert.equal(servers.filter((s) => isLifeOsMcpUrl(s.url)).every((s) => s.token === 'fresh'), true)
  assert.equal(servers.find((s) => s.id === 'custom')?.token, 'keep')
  const again = refreshLifeOsMcpTokens(servers, 'fresh')
  assert.equal(again.updated, 0)
}

{
  const { servers, added, updated } = ensureLifeOsMcpFleet([], 'tok')
  assert.equal(servers.length, 4)
  assert.equal(added.length, 4)
  // merge 已写入 token，refresh 无需再改
  assert.equal(updated, 0)
  assert.equal(servers.every((s) => s.token === 'tok'), true)
  const again = ensureLifeOsMcpFleet(servers, 'tok')
  assert.equal(again.added.length, 0)
  assert.equal(again.updated, 0)
  const rotated = ensureLifeOsMcpFleet(servers, 'tok2')
  assert.equal(rotated.added.length, 0)
  assert.equal(rotated.updated, 4)
}

{
  const { updated } = refreshLifeOsMcpTokens(
    [{ id: 'x', name: 'x', url: 'https://home.kenos.space/api/mcp', enabled: true }],
    '',
  )
  assert.equal(updated, 0)
}

console.log('mcp.presets.test.mjs: ok')
