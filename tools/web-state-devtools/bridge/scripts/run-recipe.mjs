#!/usr/bin/env node
/**
 * Run a harvest recipe via bridge (in-process — avoids HTTP timeout on long harvests).
 * Usage: WEB_STATE_ALLOW_AMAZON=1 node scripts/run-recipe.mjs amazon-orders
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runRecipe } from '../lib/recipe.mjs'

const recipeId = process.argv[2] || 'amazon-orders'
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function runAction(action, params = {}, timeoutMs = 60000) {
  const res = await fetch(`${BRIDGE}/actions/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params, timeoutMs }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status} ${action}`)
  return data.result
}

async function getLatestSnapshot() {
  const res = await fetch(`${BRIDGE}/latest`)
  if (!res.ok) throw new Error('No snapshot on bridge')
  const data = await res.json()
  return data.snapshot
}

function writeExport(recipe, summary, rawItems, exportItems) {
  const year = recipe.vars?.year || 'data'
  const outDir = path.join(
    __dirname,
    '..',
    'data',
    recipe.export?.outDir || 'export',
  )
  fs.mkdirSync(outDir, { recursive: true })
  const base = String(recipe.export?.basename || recipe.id || 'export').replace(
    '{year}',
    String(year),
  )
  const paths = {}
  const jsonPath = path.join(outDir, `${base}.json`)
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ summary, orders: exportItems }, null, 2),
  )
  fs.writeFileSync(
    path.join(outDir, `${base}-raw.json`),
    JSON.stringify({ summary, orders: rawItems }, null, 2),
  )
  paths.json = jsonPath
  paths.jsonRaw = path.join(outDir, `${base}-raw.json`)
  const csvPath = path.join(outDir, `${base}.csv`)
  const headers = [
    'orderId',
    'orderDate',
    'orderTotal',
    'status',
    'lineItemCount',
    'lineItemTitles',
    'detailUrl',
  ]
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const o of exportItems) {
    const titles = (o.lineItems || []).map((li) => li.title).join(' | ')
    lines.push(
      [
        esc(o.orderId),
        esc(o.orderDate),
        esc(o.orderTotal),
        esc(o.status),
        Array.isArray(o.lineItems) ? o.lineItems.length : 0,
        esc(titles),
        esc(o.detailUrl),
      ].join(','),
    )
  }
  fs.writeFileSync(csvPath, lines.join('\n'))
  paths.csv = csvPath
  return paths
}

async function main() {
  const health = await fetch(`${BRIDGE}/health`).then((r) => r.json())
  console.log(
    '[recipe] bridge',
    health.version,
    'agent',
    health.agent?.extensionConnected,
  )

  try {
    await runAction('ping', {}, 15000)
  } catch {
    console.error('Extension not ready — enable Dev Agent Mode in popup')
    process.exit(1)
  }

  const t0 = Date.now()
  const result = await runRecipe(
    { runAction, getLatestSnapshot, writeExport },
    recipeId,
  )

  console.log('\n[recipe] DONE in', Math.round((Date.now() - t0) / 1000), 's')
  console.log(JSON.stringify(result.summary, null, 2))
  console.log('[recipe] outputs', result.outPaths)

  if (
    result.summary?.targetCount &&
    result.summary.harvestedCount < result.summary.targetCount
  ) {
    process.exit(2)
  }
}

main().catch((e) => {
  console.error('[recipe] FATAL', e.message)
  process.exit(1)
})
