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
import { loadRecipe } from '../lib/recipe.mjs'
import { extractMergeKey } from '../lib/store.mjs'
import { redactForExport } from '../lib/privacy.mjs'
import {
  ensureHarvestListPage,
  getTabUrl,
  isAuthIntermediateUrl,
  isHardSignInUrl,
  resolveHarvestTabId,
  waitForHarvestReady,
} from '../lib/harvest-tab.mjs'

const PURCHASES_READY_RE = /bestbuy\.com\/purchasehistory\/purchases/i

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
  const rawPath = path.join(outDir, `${base}-raw.json`)
  const prevCount = fs.existsSync(rawPath)
    ? (JSON.parse(fs.readFileSync(rawPath, 'utf8')).orders?.length ?? 0)
    : 0
  const stuckOnSignIn = (summary.scrollSteps ?? []).some((s) =>
    isHardSignInUrl(String(s.url ?? '')),
  )
  if (exportItems.length === 0 && (prevCount > 0 || stuckOnSignIn)) {
    console.warn(
      '[bestbuy] 0 orders harvested',
      stuckOnSignIn
        ? '(still on sign-in page — not auth refresh hop)'
        : `(previous export had ${prevCount})`,
      '— keeping existing export',
    )
    return {
      json: path.join(outDir, `${base}.json`),
      jsonRaw: rawPath,
      csv: path.join(outDir, `${base}.csv`),
      skipped: true,
    }
  }
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
  return {
    json: jsonPath,
    jsonRaw: path.join(outDir, `${base}-raw.json`),
    csv: csvPath,
  }
}

async function scrollHarvest(deps, recipe, tabId, purchasesUrl, runAction) {
  const mergeKeyRules = recipe.entities?.mergeKey || ['orderId']
  /** @type {Map<string, Record<string, unknown>>} */
  const merged = new Map()
  const steps = []
  const maxRounds = Number(recipe.vars?.scrollRounds) || 35
  const log = (msg) => console.log('[bestbuy]', msg)

  await ensureHarvestListPage(runAction, tabId, {
    targetUrl: purchasesUrl,
    readyRe: PURCHASES_READY_RE,
    log,
  })

  let zeroAddRounds = 0

  for (let round = 0; round < maxRounds; round++) {
    const tabUrl = await getTabUrl(runAction, tabId)
    if (!PURCHASES_READY_RE.test(tabUrl) || isAuthIntermediateUrl(tabUrl)) {
      await ensureHarvestListPage(runAction, tabId, {
        targetUrl: purchasesUrl,
        readyRe: PURCHASES_READY_RE,
        log,
      })
    }

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
      zeroAddRounds++
      if (zeroAddRounds >= 3) {
        steps.push({ step: 'scroll-stop', reason: 'no new items', round })
        break
      }
    } else {
      zeroAddRounds = 0
    }

    // Best Buy: prefer Load More when present; never throw on auth/list edge pages
    const loadMore = await deps.runAction(
      'click',
      {
        tabId,
        selector: '[data-testid="OrderList-LoadMore-TestID"]',
        optional: true,
      },
      8000,
    )
    if (loadMore?.ok) {
      await new Promise((r) => setTimeout(r, 1500))
    } else {
      await deps.runAction('scroll', { preset: 'bottom', tabId }, 30000)
      await new Promise((r) => setTimeout(r, 1200))
    }
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

  const tabId = await resolveHarvestTabId(runAction, {
    hostRe: /bestbuy\.com/i,
    pathRe: /purchasehistory\/purchases/i,
    targetUrl: PURCHASES_URL,
    log: (msg) => console.log('[bestbuy]', msg),
  })
  await ensureHarvestListPage(runAction, tabId, {
    targetUrl: PURCHASES_URL,
    readyRe: PURCHASES_READY_RE,
    log: (msg) => console.log('[bestbuy]', msg),
  })

  const { merged, steps: scrollSteps } = await scrollHarvest(
    deps,
    recipe,
    tabId,
    PURCHASES_URL,
    runAction,
  )

  const allItems = [...merged.values()].sort((a, b) => {
    const da = parseOrderDate(a.orderDate) || 0
    const db = parseOrderDate(b.orderDate) || 0
    return db - da
  })

  const yearItems = allItems.filter((o) =>
    withinPastYear(o.orderDate, cutoffMs),
  )
  console.log(
    `[bestbuy] scroll harvest: ${allItems.length} total, ${yearItems.length} within past year`,
  )

  /** @type {Map<string, Record<string, unknown>>} */
  const enriched = new Map(
    yearItems.map((o) => [
      extractMergeKey(o, recipe.entities?.mergeKey) || o.orderId,
      o,
    ]),
  )

  const follow = recipe.follow
  const followSteps = []
  if (follow?.enabled) {
    const PRICE_RE = /\$[\d,]+\.\d{2}/
    const needFollow = (o) => {
      if (!o.detailUrl) return false
      if (follow.whenMissing?.length) {
        return follow.whenMissing.some((f) => {
          if (f === 'orderTotal')
            return !o.orderTotal || !PRICE_RE.test(String(o.orderTotal))
          if (f === 'lineItems')
            return !Array.isArray(o.lineItems) || o.lineItems.length === 0
          return !o[f]
        })
      }
      return !o.orderTotal || !o.lineItems?.length
    }
    const maxFollow = Number(follow.max) || 40
    let followed = 0
    for (const item of [...enriched.values()]) {
      if (followed >= maxFollow) break
      if (!needFollow(item)) continue
      const t1 = Date.now()
      await runAction('navigate', { url: item.detailUrl, tabId }, 90000)
      await new Promise((r) => setTimeout(r, 2500))
      await runAction(
        'capture',
        { send: true, tabId, fast: true, wait: follow.wait },
        45000,
      )
      const snap = await getLatestSnapshot()
      const detail = snap?.adapter?.items?.[0]
      if (detail) {
        const key =
          extractMergeKey(item, recipe.entities?.mergeKey) || item.orderId
        enriched.set(key, {
          ...item,
          ...detail,
          orderId: item.orderId || detail.orderId,
          detailUrl: item.detailUrl || detail.detailUrl,
          orderTotal: detail.orderTotal || item.orderTotal,
          orderDate: detail.orderDate || item.orderDate,
          lineItems: detail.lineItems?.length
            ? detail.lineItems
            : item.lineItems,
        })
      }
      followed++
      followSteps.push({
        step: `follow:${item.orderId}`,
        captureMs: Date.now() - t1,
        enriched: !!detail,
      })
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
    followSteps,
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
