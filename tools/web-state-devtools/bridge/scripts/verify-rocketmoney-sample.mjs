#!/usr/bin/env node
/**
 * Verify Rocket Money finance adapter via WSD bridge (live page).
 * Usage: WEB_STATE_ALLOW_ROCKETMONEY=1 node scripts/verify-rocketmoney-sample.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveHarvestTabId,
  waitForHarvestReady,
} from '../lib/harvest-tab.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dirname, '..', 'data')
const LATEST = path.join(DATA, 'latest-snapshot.json')
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'

const PAGES = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    entity: 'accounts',
    sidebar: 'sidebar-Dashboard',
  },
  {
    path: '/net-worth',
    label: 'Net Worth',
    entity: 'accounts',
    sidebar: 'sidebar-NetWorth',
  },
  {
    path: '/recurring',
    label: 'Recurring',
    entity: 'recurring',
    sidebar: 'sidebar-Recurring',
  },
  {
    path: '/transactions',
    label: 'Transactions',
    entity: 'transactions',
    sidebar: 'sidebar-Transactions',
  },
]

function log(msg) {
  console.log(`[verify-rm] ${msg}`)
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

async function captureTab(tabId, waitSelectors) {
  await runAction(
    'capture',
    {
      send: true,
      tabId,
      fast: false,
      wait: {
        selectors: waitSelectors,
        minCount: 1,
        stableMs: 600,
        timeoutMs: 20000,
      },
    },
    90000,
  )
  return JSON.parse(fs.readFileSync(LATEST, 'utf8'))
}

function readyReForPage(pagePath) {
  if (pagePath === '/dashboard') {
    return /rocketmoney\.com\/(?:dashboard)?\/?(?:\?|#|$)/i
  }
  const seg = pagePath.replace(/^\//, '').replace(/\//g, '\\/')
  return new RegExp(`rocketmoney\\.com\\/${seg}`, 'i')
}

async function main() {
  const health = await fetch(`${BRIDGE}/health`).then((r) => r.json())
  if (!health.ok) throw new Error('Bridge not running')
  if (!health.agent?.extensionConnected) {
    throw new Error('WSD extension not connected — reload + Dev Agent Mode ON')
  }

  const tabId = await resolveHarvestTabId(runAction, {
    hostRe: /rocketmoney\.com/i,
    pathRe: /rocketmoney\.com/i,
    targetUrl: 'https://app.rocketmoney.com/dashboard',
    log,
  })

  let pass = 0
  let fail = 0

  console.log('\n=== Rocket Money finance pages ===\n')

  for (const page of PAGES) {
    const url = `https://app.rocketmoney.com${page.path}`
    log(`→ ${page.label} (${url})`)
    await runAction('navigate', { url, tabId }, 90000)
    await waitForHarvestReady(
      runAction,
      tabId,
      {
        readyRe: readyReForPage(page.path),
        log,
      },
      30000,
    )
    await new Promise((r) => setTimeout(r, 1500))

    const snap = await captureTab(tabId, [
      '[data-testid="transaction-table-row"]',
      '[data-testid="subscription-section-card"]',
      '[role="row"]',
      'h6',
    ])
    const adapter = snap?.adapter
    const count = adapter?.items?.length ?? adapter?.count ?? 0
    const entity = adapter?.entity

    if (entity === page.entity && count > 0) {
      pass++
      console.log(`  PASS ${page.label}: ${count} ${entity} items`)
      const sample = adapter.items?.[0]
      if (sample)
        console.log(`    sample: ${JSON.stringify(sample).slice(0, 120)}`)
    } else if (page.path === '/dashboard' && count > 0) {
      pass++
      console.log(
        `  PASS ${page.label}: ${count} account rows (entity=${entity})`,
      )
    } else {
      fail++
      console.log(
        `  FAIL ${page.label}: entity=${entity} count=${count} url=${snap?.page?.url}`,
      )
    }
  }

  console.log(`\n=== Summary: PASS ${pass} / FAIL ${fail} ===\n`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
