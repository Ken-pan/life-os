#!/usr/bin/env node
/**
 * Re-visit order detail pages missing lineItems and patch export JSON.
 * Usage: WEB_STATE_ALLOW_BESTBUY=1 node scripts/refollow-order-gaps.mjs --source bestbuy|target
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRecipe } from '../lib/recipe.mjs'
import { redactForExport } from '../lib/privacy.mjs'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import {
  ensureHarvestListPage,
  getTabUrl,
  waitForDetailPage,
} from '../lib/harvest-tab.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'

function exportPathFor(source) {
  const dir = path.join(__dirname, '..', 'data', `${source}-export`)
  return (
    resolveOrdersRawPath(dir, source) ||
    path.join(dir, `${source}-orders-past-year-raw.json`)
  )
}

const CONFIG = {
  bestbuy: {
    allowEnv: 'WEB_STATE_ALLOW_BESTBUY',
    recipeId: 'bestbuy-orders',
    exportPath: exportPathFor('bestbuy'),
    listUrl: 'https://www.bestbuy.com/purchasehistory/purchases',
    readyRe: /bestbuy\.com\/purchasehistory\/purchases/i,
    hostRe: /bestbuy\.com/i,
    fixDetailUrl(order) {
      if (!order.orderId) return order.detailUrl
      const id = encodeURIComponent(order.orderId)
      if (/^BBY03-/i.test(order.orderId)) {
        return `https://www.bestbuy.com/profile/ss/marketplace/orders/order-details/${id}/view`
      }
      return `https://www.bestbuy.com/profile/ss/orders/order-details/${id}/view`
    },
    followWait: {
      selectors: [
        'a[id^="line-item-header-"]',
        '.order-details-page',
        '[class*="OrderDetailsPage"]',
        'img[src*="bbystatic.com"]',
      ],
      minCount: 1,
      stableMs: 1200,
      timeoutMs: 25000,
    },
  },
  target: {
    allowEnv: 'WEB_STATE_ALLOW_TARGET',
    recipeId: 'target-orders',
    exportPath: exportPathFor('target'),
    listUrl: 'https://www.target.com/orders?lnk=acct_nav_my_account',
    readyRe: /target\.com\/orders/i,
    hostRe: /target\.com/i,
    fixDetailUrl: (order) => order.detailUrl,
    followWait: {
      selectors: ['button[aria-label^="item details for "]', 'main h3'],
      minCount: 1,
      stableMs: 800,
      timeoutMs: 20000,
    },
  },
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function runAction(action, params = {}, timeoutMs = 60000) {
  const res = await fetch(`${BRIDGE}/actions/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params, timeoutMs }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${action} HTTP ${res.status}`)
  return data.result
}

async function getLatestSnapshot() {
  const res = await fetch(`${BRIDGE}/latest`)
  if (!res.ok) throw new Error('No snapshot on bridge')
  return (await res.json()).snapshot
}

async function main() {
  const source = arg('--source', 'bestbuy')
  const cfg = CONFIG[source]
  if (!cfg) throw new Error('unknown --source')
  if (process.env[cfg.allowEnv] !== '1') {
    console.warn(`Set ${cfg.allowEnv}=1`)
  }

  if (!fs.existsSync(cfg.exportPath)) {
    throw new Error(`Export not found: ${cfg.exportPath}`)
  }

  const raw = JSON.parse(fs.readFileSync(cfg.exportPath, 'utf8'))
  const orders = raw.orders ?? []
  const gaps = orders.filter((o) => !o.lineItems?.length && o.detailUrl)
  console.log(`[refollow-${source}] ${gaps.length} orders missing lineItems`)

  const tabs = await runAction('list_tabs', {}, 15000)
  let tabId = tabs.find((t) => cfg.readyRe.test(t.url || ''))?.id
  if (!tabId) {
    tabId = tabs.find((t) => cfg.hostRe.test(t.url || ''))?.id
  }
  if (!tabId) {
    const nav = await runAction('navigate', { url: cfg.listUrl }, 90000)
    tabId = nav.tabId
  }

  await ensureHarvestListPage(runAction, tabId, {
    targetUrl: cfg.listUrl,
    readyRe: cfg.readyRe,
    log: (m) => console.log(`[refollow-${source}]`, m),
  })

  let enriched = 0
  let failed = 0

  for (const order of gaps) {
    const detailUrl = cfg.fixDetailUrl(order)
    console.log(`[refollow-${source}] ${order.orderId} → ${detailUrl}`)
    try {
      await runAction('navigate', { url: detailUrl, tabId }, 90000)
      const landed = await waitForDetailPage(runAction, tabId, 45000)
      if (!/order-details\/[^/]+|target\.com\/orders\/\d{12}/i.test(landed)) {
        console.warn(`  skip — stayed on ${landed}`)
        failed++
        continue
      }
      await new Promise((r) => setTimeout(r, 2000))
      await runAction(
        'capture',
        { send: true, tabId, fast: false, wait: cfg.followWait },
        90000,
      )
    } catch (err) {
      console.warn(`  skip — ${err.message}`)
      failed++
      continue
    }
    const snap = await getLatestSnapshot()
    const detail = snap?.adapter?.items?.[0]
    if (detail?.lineItems?.length) {
      Object.assign(order, {
        ...detail,
        orderId: order.orderId || detail.orderId,
        detailUrl,
        lineItems: detail.lineItems,
        orderTotal: detail.orderTotal || order.orderTotal,
        orderDate: detail.orderDate || order.orderDate,
        status: detail.status || order.status,
      })
      enriched++
      console.log(`  ✓ ${detail.lineItems.length} items`)
    } else {
      failed++
      console.log(`  ✗ still no lineItems`)
    }
  }

  await ensureHarvestListPage(runAction, tabId, {
    targetUrl: cfg.listUrl,
    readyRe: cfg.readyRe,
    log: () => {},
  })

  const exportItems = orders.map((o) => redactForExport(o))
  raw.orders = orders
  raw.summary = {
    ...raw.summary,
    refollowedAt: new Date().toISOString(),
    refollowEnriched: enriched,
    refollowFailed: failed,
  }
  fs.writeFileSync(cfg.exportPath, JSON.stringify(raw, null, 2))
  const prettyPath = cfg.exportPath.replace('-raw.json', '.json')
  fs.writeFileSync(
    prettyPath,
    JSON.stringify({ summary: raw.summary, orders: exportItems }, null, 2),
  )

  console.log(
    `[refollow-${source}] done — enriched ${enriched}, still empty ${failed}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
