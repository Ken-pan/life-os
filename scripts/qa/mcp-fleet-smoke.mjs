#!/usr/bin/env node
/**
 * Life OS MCP 舰队生产可达性 smoke（PLAT.MCP.SMOKE）。
 *
 * 对每个预设 URL POST initialize；期望 200（函数已挂载）。
 * 404 = 未部署 functions；其它非 2xx 也记失败。
 *
 * 用法：
 *   node scripts/qa/mcp-fleet-smoke.mjs
 *   npm run qa:mcp-fleet
 *
 * 不带 JWT（只验「面在不在」）；业务工具鉴权另测。
 */

const FLEET = [
  { id: 'home', url: 'https://home.kenos.space/api/mcp' },
  { id: 'planner', url: 'https://planner.kenos.space/api/mcp' },
  { id: 'finance', url: 'https://finance.kenos.space/api/mcp' },
  { id: 'fitness', url: 'https://fitness.kenos.space/api/mcp' },
]

const BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'life-os-mcp-fleet-smoke', version: '1.0' },
  },
})

/**
 * @param {{ id: string, url: string }} target
 */
async function probe(target) {
  const started = Date.now()
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: BODY,
    })
    return {
      id: target.id,
      url: target.url,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      ms: Date.now() - started,
    }
  } catch (err) {
    return {
      id: target.id,
      url: target.url,
      status: 0,
      ok: false,
      ms: Date.now() - started,
      error: err?.message || String(err),
    }
  }
}

const results = []
for (const t of FLEET) {
  results.push(await probe(t))
}

let failed = 0
for (const r of results) {
  const mark = r.ok ? 'ok' : 'FAIL'
  if (!r.ok) failed += 1
  const extra = r.error ? ` · ${r.error}` : r.status === 404 ? ' · functions 未上线？检查 deploy --functions' : ''
  console.log(`${mark.padEnd(4)} ${r.id.padEnd(8)} HTTP ${r.status || '—'} ${r.ms}ms${extra}`)
}

if (failed) {
  console.error(`\nmcp-fleet-smoke: ${failed}/${results.length} unreachable`)
  process.exit(1)
}
console.log(`\nmcp-fleet-smoke: ${results.length}/${results.length} ok`)
