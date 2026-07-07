#!/usr/bin/env node
/**
 * Verify Robinhood finance adapter via WSD bridge (list + optional detail).
 * Usage: WEB_STATE_ALLOW_ROBINHOOD=1 node scripts/verify-robinhood-sample.mjs [--detail=AAPL]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHarvestTabId, waitForDetailPage } from '../lib/harvest-tab.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LATEST = path.join(__dirname, '..', 'data', 'latest-snapshot.json')
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'

const args = process.argv.slice(2)
const detailTicker = args.find((a) => a.startsWith('--detail='))?.split('=')[1]

function log(msg) {
  console.log(`[verify-rh] ${msg}`)
}

async function bridgePost(pathname, body = {}) {
  const res = await fetch(`${BRIDGE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false)
    throw new Error(json.error || `${pathname} HTTP ${res.status}`)
  return json
}

async function runAction(action, params = {}, timeoutMs = 90000) {
  const res = await bridgePost('/actions/run', { action, params, timeoutMs })
  return res.result
}

async function main() {
  const health = await fetch(`${BRIDGE}/health`).then((r) => r.json())
  if (!health.ok) throw new Error('Bridge not running')
  if (!health.agent?.extensionConnected) {
    throw new Error('WSD extension not connected')
  }

  const tabId = await resolveHarvestTabId(runAction, {
    hostRe: /robinhood\.com/i,
    pathRe: /robinhood\.com\/?$/i,
    targetUrl: 'https://robinhood.com/',
    log,
  })

  log('capturing holdings list…')
  await runAction('navigate', { url: 'https://robinhood.com/', tabId }, 90000)
  await new Promise((r) => setTimeout(r, 2500))
  await runAction(
    'capture',
    {
      send: true,
      tabId,
      fast: false,
      wait: {
        selectors: [
          '[data-testid="PositionCell"]',
          '[data-testid="VirtualizedSidebar"]',
        ],
        minCount: 1,
        stableMs: 1000,
        timeoutMs: 25000,
      },
    },
    90000,
  )

  const snap = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const adapter = snap?.adapter
  const positions = adapter?.items ?? []
  const total = adapter?.totalValue

  console.log('\n=== Robinhood holdings ===')
  if (positions.length > 0) {
    console.log(
      `PASS list: ${positions.length} positions, portfolio=${total ?? '?'}`,
    )
    for (const p of positions.slice(0, 5)) {
      console.log(
        `  ${p.ticker} | ${p.shares} sh | $${p.price} | mv=${p.marketValue}`,
      )
    }
  } else {
    console.log(`FAIL list: 0 positions (url=${snap?.page?.url})`)
    process.exit(1)
  }

  const ticker = detailTicker || positions[0]?.ticker
  if (!ticker) return

  log(`capturing detail for ${ticker}…`)
  await runAction(
    'navigate',
    { url: `https://robinhood.com/stocks/${ticker}`, tabId },
    90000,
  )
  await waitForDetailPage(runAction, tabId, 45000)
  await new Promise((r) => setTimeout(r, 2000))
  await runAction(
    'capture',
    {
      send: true,
      tabId,
      fast: false,
      wait: {
        selectors: ['.caption-text', 'table.table'],
        minCount: 1,
        stableMs: 1000,
        timeoutMs: 25000,
      },
    },
    90000,
  )

  const detailSnap = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const detail = detailSnap?.adapter?.items?.[0]
  console.log('\n=== Stock detail ===')
  if (
    detail?.averageCostPerShare != null ||
    detail?.totalReturnAmount != null
  ) {
    console.log(`PASS detail ${ticker}:`, JSON.stringify(detail, null, 2))
  } else {
    console.log(`FAIL detail ${ticker}:`, detailSnap?.adapter)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
