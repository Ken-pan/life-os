#!/usr/bin/env node
/**
 * Harvest Best Buy purchase history (scroll + capture), keep orders from the past year.
 *
 * Usage: WEB_STATE_ALLOW_BESTBUY=1 node scripts/bestbuy-harvest-past-year.mjs
 *
 * Requires: bridge running, extension Dev Agent Mode ON, logged into Best Buy in Chrome.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRecipe, runRecipe } from '../lib/recipe.mjs'
import { extractMergeKey } from '../lib/store.mjs'
import { redactForExport } from '../lib/privacy.mjs'

const RECIPE_ID = 'bestbuy-orders'
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'
const PURCHASES_URL = 'https://www.bestbuy.com/purchasehistory/purchases'
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

function parseOrderDate(raw) {
  if (!raw) return NaN
  const t = Date.parse(String(raw))
  if (!Number.isNaN(t)) return t
  const m = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return NaN
  let year = Number(m[3])
  if (year < 100) year += 2000
  return Date.parse(`${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`)
}

function withinPastYear(orderDate, cutoffMs) {
  const t = parseOrderDate(orderDate)
  if (Number.isNaN(t)) return true
  return t >= cutoffMs
}

function writeExport(recipe, summary, rawItems, exportItems) {
  const outDir = path.join(
    __dirname,
    '..',
    'data',
    recipe.export?.outDir || 'bestbuy-export',
  )
  fs.mkdirSync(outDir, { recursive: true })
  const base = String(recipe.export?.basename || 'bestbuy-orders-past-year')
  const jsonPath = path.join(outDir, `${base}.json`)
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ summary, orders: exportItems }, null, 2),
  )
  fs.writeFileSync(
    path.join(outDir, `${base}-raw.json`),
    JSON.stringify({ summary, orders: rawItems }, null, 2),
  )
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
  return { json: jsonPath, jsonRaw: path.join(outDir, `${base}-raw.json`), csv: csvPath }
}

async function scrollHarvest(deps, recipe, tabId) {
  const mergeKeyRules = recipe.entities?.mergeKey || ['orderId']
  /** @type {Map<string, Record<string, unknown>>} */
  const merged = new Map()
  const steps = []
  const maxRounds = Number(recipe.vars?.scrollRounds) || 35

  await deps.runAction(
    'navigate',
    { url: PURCHASES_URL, tabId },
    90000,
  )

  for (let round = 0; round < maxRounds; round++) {
    const t0 = Date.now()
    await deps.runAction(
      'capture',
      {
        send: true,
        tabId,
        fast: true,
        wait: recipe.capture?.wait,
      },
      45000,
    )
    const snap = await deps.getLatestSnapshot()
    const items = snap?.adapter?.items || []
    let added = 0
    for (const item of items) {
      const key = extractMergeKey(item, mergeKeyRules) || item.orderId
      if (!key) continue
      if (!merged.has(key)) added++
      merged.set(key, { ...merged.get(key), ...item })
    }
    steps.push({
      step: `scroll-round-${round}`,
      pageItems: items.length,
      merged: merged.size,
      added,
      captureMs: Date.now() - t0,
      url: snap?.page?.url,
    })

    if (round > 0 && added === 0) {
      steps.push({ step: 'scroll-stop', reason: 'no new items', round })
      break
    }

    await deps.runAction('scroll', { preset: 'bottom', tabId }, 30000)
    await new Promise((r) => setTimeout(r, 1200))
  }

  return { merged, steps }
}

async function main() {
  const health = await fetch(`${BRIDGE}/health`).then((r) => r.json())
  console.log(
    '[bestbuy] bridge',
    health.version,
    'agent',
    health.agent?.extensionConnected,
  )

  try {
    await runAction('ping', {}, 15000)
  } catch {
    console.error(
      'Extension not ready — open Chrome, reload Web State DevTools extension, enable Dev Agent Mode',
    )
    process.exit(1)
  }

  const recipe = loadRecipe(RECIPE_ID)
  const cutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000
  const cutoffLabel = new Date(cutoffMs).toISOString().slice(0, 10)
  console.log('[bestbuy] keeping orders on/after', cutoffLabel)

  const deps = { runAction, getLatestSnapshot, writeExport }
  const t0 = Date.now()

  const nav = await runAction('navigate', { url: PURCHASES_URL }, 90000)
  const tabId = nav?.tabId
  if (!tabId) throw new Error('Navigate did not return tabId')

  const { merged, steps: scrollSteps } = await scrollHarvest(deps, recipe, tabId)

  const allItems = [...merged.values()].sort((a, b) => {
    const da = parseOrderDate(a.orderDate) || 0
    const db = parseOrderDate(b.orderDate) || 0
    return db - da
  })

  const yearItems = allItems.filter((o) => withinPastYear(o.orderDate, cutoffMs))
  console.log(
    `[bestbuy] scroll harvest: ${allItems.length} total, ${yearItems.length} within past year`,
  )

  /** @type {Map<string, Record<string, unknown>>} */
  const enriched = new Map(
    yearItems.map((o) => [extractMergeKey(o, recipe.entities?.mergeKey) || o.orderId, o]),
  )

  const followResult = await runRecipe(deps, RECIPE_ID, {
    tabId,
    vars: { ...recipe.vars, targetCount: yearItems.length },
  })

  for (const item of followResult.items || []) {
    const key = extractMergeKey(item, recipe.entities?.mergeKey) || item.orderId
    if (key && withinPastYear(item.orderDate, cutoffMs)) {
      enriched.set(key, { ...enriched.get(key), ...item })
    }
  }

  const list = [...enriched.values()].sort((a, b) => {
    const da = parseOrderDate(a.orderDate) || 0
    const db = parseOrderDate(b.orderDate) || 0
    return db - da
  })

  const exportItems = list.map((o) => redactForExport(o))
  const summary = {
    recipeId: RECIPE_ID,
    harvestedAt: new Date().toISOString(),
    pastYearCutoff: cutoffLabel,
    harvestedCount: list.length,
    scrollSteps,
    followSteps: followResult.summary?.steps?.filter((s) =>
      String(s.step || '').startsWith('follow:'),
    ),
    complete: true,
  }

  const outPaths = writeExport(recipe, summary, list, exportItems)

  console.log('\n[bestbuy] DONE in', Math.round((Date.now() - t0) / 1000), 's')
  console.log(JSON.stringify(summary, null, 2))
  console.log('[bestbuy] outputs', outPaths)
}

main().catch((e) => {
  console.error('[bestbuy] FATAL', e.message)
  process.exit(1)
})
