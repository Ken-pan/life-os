#!/usr/bin/env node
/**
 * Verify Best Buy adapter output against list-page headers + random detail checks.
 * Usage: WEB_STATE_ALLOW_BESTBUY=1 node scripts/verify-bestbuy-sample.mjs [--capture] [--sample=3]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dirname, '..', 'data')
const LATEST = path.join(DATA, 'latest-snapshot.json')
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'

const args = process.argv.slice(2)
const doCapture = args.includes('--capture')
const sampleN = Number(
  args.find((a) => a.startsWith('--sample='))?.split('=')[1] || 3,
)

const PRICE_RE = /\$[\d,]+\.\d{2}/

function log(msg) {
  console.log(`[verify-bestbuy] ${msg}`)
}

async function bridgePost(pathname, body = {}) {
  const res = await fetch(`${BRIDGE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `${pathname} HTTP ${res.status}`)
  }
  return json
}

function expectedFromSnapshot(snapshot) {
  /** @type {Map<string, {orderId:string, orderTotal?:string, orderDate?:string, status?:string}>} */
  const expected = new Map()

  for (const region of snapshot?.sensor?.regions || []) {
    for (const item of region.items || []) {
      const title = item.preview?.title || ''
      if (!/Order placed|Purchased|Total/i.test(title)) continue
      const headers = title.split(/\s+/).length > 3 ? title : title
      const orderId =
        title.match(/\b(BBY\d{2}-\d{10,14})\b/i)?.[1]?.toUpperCase() ||
        title.match(/\b(\d{3}-\d{2}-\d{4}-\d{6})\b/)?.[1]
      if (!orderId) continue
      const orderTotal = title.match(/Total\s(\$[\d,]+\.\d{2})/i)?.[1]
      const orderDate = title.match(
        /(?:Order placed|Purchased)\s+(.+?)\s+Total/i,
      )?.[1]
      expected.set(orderId, { orderId, orderTotal, orderDate })
    }
  }

  // Fallback: parse from export if list sensor is sparse
  if (expected.size === 0) {
    const exportPath = path.join(
      DATA,
      'bestbuy-export',
      'bestbuy-orders-past-year-raw.json',
    )
    if (fs.existsSync(exportPath)) {
      for (const o of JSON.parse(fs.readFileSync(exportPath, 'utf8')).orders ||
        []) {
        if (o.orderId) expected.set(o.orderId, o)
      }
      log(`Using export fallback for ground truth (${expected.size} orders)`)
    }
  }

  return expected
}

function pickRandom(keys, n) {
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, shuffled.length))
}

async function verifyDetail(order) {
  if (!order.detailUrl) return { ok: false, reason: 'no detailUrl' }

  await bridgePost('/actions/run', {
    action: 'navigate',
    params: { url: order.detailUrl },
    timeoutMs: 90000,
  })
  await new Promise((r) => setTimeout(r, 2500))
  await bridgePost('/actions/run', {
    action: 'capture',
    params: {
      send: true,
      fast: false,
      wait: {
        selectors: [
          'a[id^="line-item-header-"]',
          '.order-details-page',
          '[data-testid="OrderStatusTitle-None-TestID"]',
        ],
        minCount: 1,
        stableMs: 500,
        timeoutMs: 18000,
      },
    },
    timeoutMs: 60000,
  })

  const snap = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const detail = snap?.adapter?.items?.[0]
  if (!detail?.orderId) return { ok: false, reason: 'detail parse failed' }

  const mismatches = []
  if (detail.orderId !== order.orderId && !String(detail.orderId).includes(String(order.orderId).slice(0, 8))) {
    mismatches.push(`orderId ${detail.orderId} != ${order.orderId}`)
  }

  if (
    order.orderTotal &&
    detail.orderTotal &&
    String(detail.orderTotal).replace(/,/g, '') !==
      String(order.orderTotal).replace(/,/g, '')
  ) {
    log(
      `  Note: list total ${order.orderTotal} vs detail ${detail.orderTotal}`,
    )
  }

  if (!(detail.lineItems || []).length) {
    mismatches.push('detail has 0 lineItems')
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    detail: {
      orderId: detail.orderId,
      orderTotal: detail.orderTotal,
      status: detail.status,
      lineItemCount: detail.lineItems?.length || 0,
      titles: (detail.lineItems || []).map((li) => ({
        title: li.title?.slice(0, 70),
        price: li.price,
        hasImage: !!li.imageUrl,
      })),
    },
  }
}

async function main() {
  const health = await fetch(`${BRIDGE}/health`).then((r) => r.json())
  if (!health.ok) throw new Error('Bridge not running')
  if (!health.agent?.extensionConnected) {
    throw new Error(
      'Extension not connected — reload extension + Dev Agent Mode ON',
    )
  }

  if (doCapture) {
    log('Navigating to Best Buy purchase history…')
    await bridgePost('/actions/run', {
      action: 'navigate',
      params: { url: 'https://www.bestbuy.com/purchasehistory/purchases' },
      timeoutMs: 90000,
    })
    await new Promise((r) => setTimeout(r, 3000))
    await bridgePost('/actions/run', {
      action: 'capture',
      params: {
        send: true,
        fast: false,
        wait: {
          selectors: ['[data-testid="order-item"]'],
          minCount: 1,
          stableMs: 500,
          timeoutMs: 15000,
        },
      },
      timeoutMs: 60000,
    })
  }

  if (!fs.existsSync(LATEST)) throw new Error(`Missing ${LATEST}`)
  const snapshot = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const url = snapshot?.page?.url || ''
  if (!/bestbuy\./i.test(url)) {
    throw new Error(`Latest snapshot is not Best Buy: ${url}`)
  }

  const expected = expectedFromSnapshot(snapshot)
  const actual = snapshot?.adapter?.items || []
  log(`Ground truth orders: ${expected.size}, adapter items: ${actual.length}`)

  let pass = 0
  let fail = 0
  const listIssues = []

  for (const [oid, exp] of expected) {
    const act = actual.find(
      (a) => a.orderId === oid || String(a.orderId).toUpperCase() === oid,
    )
    if (!act) {
      fail++
      listIssues.push(`${oid}: missing in adapter`)
      continue
    }
    const issues = []
    if (
      exp.orderTotal &&
      act.orderTotal &&
      String(act.orderTotal).replace(/,/g, '') !==
        String(exp.orderTotal).replace(/,/g, '')
    ) {
      issues.push(`total ${act.orderTotal} != ${exp.orderTotal}`)
    }
    if (!act.detailUrl) issues.push('missing detailUrl')
    if (!PRICE_RE.test(String(act.orderTotal || ''))) issues.push('missing orderTotal')
    if (issues.length) {
      fail++
      listIssues.push(`${oid}: ${issues.join('; ')}`)
    } else {
      pass++
    }
  }

  console.log('\n=== List page verification ===')
  console.log(`PASS ${pass} / FAIL ${fail}`)
  if (listIssues.length) {
    for (const issue of listIssues.slice(0, 10)) console.log(`  - ${issue}`)
  }

  const exportPath = path.join(
    DATA,
    'bestbuy-export',
    'bestbuy-orders-past-year-raw.json',
  )
  const exportOrders = fs.existsSync(exportPath)
    ? JSON.parse(fs.readFileSync(exportPath, 'utf8')).orders || []
    : actual

  const samplePool = exportOrders
    .filter((o) => o.detailUrl && o.orderId)
    .map((o) => o.orderId)
  const withItems = exportOrders.filter((o) => o.lineItems?.length)
  const withoutItems = exportOrders.filter((o) => !o.lineItems?.length)
  console.log(
    `\nExport: ${exportOrders.length} orders, ${withItems.length} with lineItems, ${withoutItems.length} missing lineItems`,
  )
  if (withoutItems.length) {
    console.log('Missing lineItems (need detail follow):')
    for (const o of withoutItems.slice(0, 8)) {
      console.log(`  - ${o.orderId} ${o.orderTotal || '?'} ${o.channel || ''}`)
    }
  }

  const sampleIds = pickRandom(
    [...new Set([...samplePool, ...actual.map((a) => a.orderId)])],
    sampleN,
  )
  console.log(`\n=== Random detail sample (${sampleIds.length}) ===`)

  let detailFail = 0
  for (const oid of sampleIds) {
    const order =
      exportOrders.find((o) => o.orderId === oid) ||
      actual.find((a) => a.orderId === oid)
    console.log(`\n--- ${oid} ---`)
    console.log(
      `  Export: total=${order?.orderTotal}, items=${order?.lineItems?.length || 0}, status=${order?.status || '?'}`,
    )

    try {
      const result = await verifyDetail(order)
      if (result.ok) {
        console.log(
          `  Detail:   OK — ${result.detail.lineItemCount} items, status=${result.detail.status || '?'}`,
        )
        for (const t of result.detail.titles || []) {
          console.log(
            `    · ${t.title}${t.price ? ` (${t.price})` : ''}${t.hasImage ? ' [img]' : ''}`,
          )
        }
      } else {
        detailFail++
        console.log(
          `  Detail:   FAIL — ${result.mismatches?.join('; ') || result.reason}`,
        )
      }
    } catch (err) {
      detailFail++
      console.log(`  Detail:   ERROR — ${err.message}`)
    }
  }

  process.exit(fail > 0 || detailFail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
