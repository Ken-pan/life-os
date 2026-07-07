#!/usr/bin/env node
/**
 * Verify Target adapter output against snapshot ground truth + random detail checks.
 * Usage: WEB_STATE_ALLOW_TARGET=1 node scripts/verify-target-sample.mjs [--capture] [--sample=3]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const LATEST = path.join(DATA, 'latest-snapshot.json')
const BRIDGE = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'

const args = process.argv.slice(2)
const doCapture = args.includes('--capture')
const sampleN = Number(
  args.find((a) => a.startsWith('--sample='))?.split('=')[1] || 3,
)

const ORDER_HREF_RE = /\/orders\/(\d{12,18})/
const VIEW_PURCHASE_ARIA_RE =
  /^View purchase made on (.+?) for (\$[\d,]+\.\d{2})$/i

function log(msg) {
  console.log(`[verify-target] ${msg}`)
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

function ariaFromLink(link) {
  const sel = link.bestSelector || link.selector || ''
  const m = sel.match(/aria-label="([^"]+)"/)
  return m?.[1] || ''
}

function expectedFromSnapshot(snapshot) {
  /** @type {Map<string, {orderId:string, orderTotal?:string, orderDate?:string}>} */
  const expected = new Map()

  for (const link of snapshot?.links || []) {
    if (!ORDER_HREF_RE.test(link.href || '')) continue
    if (link.text !== 'View purchase' && !/view purchase/i.test(link.text || ''))
      continue
    const orderId = link.href.match(ORDER_HREF_RE)?.[1]
    if (!orderId) continue
    const aria = ariaFromLink(link)
    const m = aria.match(VIEW_PURCHASE_ARIA_RE)
    expected.set(orderId, {
      orderId,
      orderTotal: m?.[2],
      orderDate: m?.[1],
    })
  }

  return expected
}

function pickRandom(keys, n) {
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, shuffled.length))
}

async function verifyDetail(order) {
  if (!order?.detailUrl) return { ok: false, reason: 'no detailUrl' }

  await bridgePost('/actions/run', {
    action: 'navigate',
    params: { url: order.detailUrl },
    timeoutMs: 90000,
  })
  await new Promise((r) => setTimeout(r, 2000))
  await bridgePost('/actions/run', {
    action: 'capture',
    params: {
      send: true,
      fast: false,
      wait: {
        selectors: ['button[aria-label^="item details for "]', 'main h2', 'main h3'],
        minCount: 1,
        stableMs: 500,
        timeoutMs: 15000,
      },
    },
    timeoutMs: 60000,
  })

  const snap = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const detail = snap?.adapter?.items?.[0]
  if (!detail?.orderId) return { ok: false, reason: 'detail parse failed' }

  const mismatches = []
  if (detail.orderId !== order.orderId) {
    mismatches.push(`orderId ${detail.orderId} != ${order.orderId}`)
  }

  if (
    order.orderTotal &&
    detail.orderTotal &&
    detail.orderTotal !== order.orderTotal
  ) {
    log(
      `  Note: list total ${order.orderTotal} vs detail ${detail.orderTotal} (may differ for partial shipments)`,
    )
  }

  if (!(detail.lineItems || []).length) {
    mismatches.push('detail has 0 lineItems')
  }

  for (const li of detail.lineItems || []) {
    if (!li.title || li.title.length < 4) {
      mismatches.push('line item missing title')
      break
    }
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
    log('Navigating to Target orders list…')
    await bridgePost('/actions/run', {
      action: 'navigate',
      params: {
        url: 'https://www.target.com/orders?lnk=acct_nav_my_account',
      },
      timeoutMs: 90000,
    })
    await new Promise((r) => setTimeout(r, 2500))
    await bridgePost('/actions/run', {
      action: 'capture',
      params: {
        send: true,
        fast: false,
        wait: {
          selectors: ['a[aria-label^="View purchase made on"]'],
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
  if (!/target\.com/i.test(url)) {
    throw new Error(`Latest snapshot is not Target: ${url}`)
  }

  const expected = expectedFromSnapshot(snapshot)
  const actual = snapshot?.adapter?.items || []
  log(`Ground truth orders: ${expected.size}, adapter items: ${actual.length}`)

  let pass = 0
  let fail = 0
  const listIssues = []

  for (const [oid, exp] of expected) {
    const act = actual.find((a) => a.orderId === oid)
    if (!act) {
      fail++
      listIssues.push(`${oid}: missing in adapter`)
      continue
    }
    const issues = []
    if (exp.orderTotal && act.orderTotal !== exp.orderTotal) {
      issues.push(`total ${act.orderTotal} != ${exp.orderTotal}`)
    }
    if (exp.orderDate && act.orderDate !== exp.orderDate) {
      issues.push(`date ${act.orderDate} != ${exp.orderDate}`)
    }
    if (!act.detailUrl?.includes(oid)) {
      issues.push('detailUrl missing order id')
    }
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
    console.log('Issues:')
    for (const issue of listIssues.slice(0, 10)) console.log(`  - ${issue}`)
  }

  if (actual.length) {
    console.log('\nSample adapter rows:')
    for (const row of actual.slice(0, 3)) {
      console.log(
        `  ${row.orderId} | ${row.orderDate || '?'} | ${row.orderTotal || '?'} | ${row.status || '?'} | items=${row.lineItems?.length || 0}`,
      )
    }
  }

  const samplePool = [...expected.keys()].filter((oid) =>
    actual.some((a) => a.orderId === oid),
  )
  const sampleIds = pickRandom(samplePool, sampleN)
  console.log(`\n=== Random detail sample (${sampleIds.length}) ===`)

  let detailFail = 0
  for (const oid of sampleIds) {
    const act = actual.find((a) => a.orderId === oid)
    const exp = expected.get(oid)
    console.log(`\n--- ${oid} ---`)
    console.log(
      `  List: date=${act?.orderDate}, total=${act?.orderTotal}, status=${act?.status || '?'}`,
    )
    if (exp?.orderDate) console.log(`  Expected date/total: ${exp.orderDate} / ${exp.orderTotal}`)

    try {
      const result = await verifyDetail(act)
      if (result.ok) {
        console.log(
          `  Detail:   OK — ${result.detail.lineItemCount} items, status=${result.detail.status || '?'}`,
        )
        for (const t of result.detail.titles || []) {
          console.log(`    · ${t.title}${t.price ? ` (${t.price})` : ''}`)
        }
      } else {
        detailFail++
        console.log(
          `  Detail:   FAIL — ${result.mismatches?.join('; ') || result.reason}`,
        )
        if (result.detail) console.log(JSON.stringify(result.detail, null, 2))
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
