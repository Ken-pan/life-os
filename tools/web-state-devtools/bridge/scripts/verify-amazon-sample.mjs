#!/usr/bin/env node
/**
 * Verify Amazon adapter output against page-model ground truth + random detail checks.
 * Usage: WEB_STATE_ALLOW_AMAZON=1 node scripts/verify-amazon-sample.mjs [--capture] [--sample=5]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const LATEST = path.join(DATA, 'latest-snapshot.json')
const BRIDGE = 'http://127.0.0.1:17321'

const args = process.argv.slice(2)
const doCapture = args.includes('--capture')
const sampleN = Number(args.find((a) => a.startsWith('--sample='))?.split('=')[1] || 5)

const ORDER_ID_RE = /\b(\d{3}-\d{7}-\d{7})\b/
const PRICE_RE = /\$[\d,]+\.\d{2}/

function log(msg) {
  console.log(`[verify-amazon] ${msg}`)
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
  /** @type {Map<string, {orderId:string, orderTotal?:string, orderDate?:string, titles:string[]}>} */
  const expected = new Map()

  for (const region of snapshot?.sensor?.regions || []) {
    if (region.itemCount < 3) continue
    for (const item of region.items || []) {
      const title = item.preview?.title || ''
      if (!/Order placed/i.test(title)) continue
      const oid = title.match(ORDER_ID_RE)?.[1]
      if (!oid) continue
      const total = title.match(/Total (\$[\d,]+\.\d{2})/)?.[1]
      const date = title.match(/Order placed (.+?) Total/)?.[1]
      const titles = (item.actions || [])
        .filter(
          (a) =>
            /\/dp\//.test(a.href || '') &&
            /fed_asin_title/.test(a.href || ''),
        )
        .map((a) => a.label?.trim())
        .filter(Boolean)
      expected.set(oid, { orderId: oid, orderTotal: total, orderDate: date, titles })
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
    timeoutMs: 60000,
  })
  await new Promise((r) => setTimeout(r, 1500))
  await bridgePost('/actions/run', {
    action: 'capture_enhanced',
    params: { fast: true },
    timeoutMs: 45000,
  })
  const snap = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const detail = snap?.adapter?.items?.[0]
  if (!detail?.orderId) return { ok: false, reason: 'detail parse failed' }

  const mismatches = []
  if (detail.orderId !== order.orderId) {
    mismatches.push(`orderId ${detail.orderId} != ${order.orderId}`)
  }

  const listTitle = order.lineItems?.[0]?.title?.slice(0, 40) || ''
  const detailTitle = detail.lineItems?.[0]?.title?.slice(0, 40) || ''
  if (
    listTitle &&
    detailTitle &&
    !detailTitle.startsWith(listTitle.slice(0, 30)) &&
    !listTitle.startsWith(detailTitle.slice(0, 30))
  ) {
    mismatches.push('title mismatch between list and detail')
  }

  if (order.orderTotal && detail.orderTotal && detail.orderTotal !== order.orderTotal) {
    // List header Total often differs from detail Grand Total (coupons/tax timing)
    console.log(
      `  Note:     list total ${order.orderTotal} vs detail Grand Total ${detail.orderTotal}`,
    )
  }
  const qtySum = (detail.lineItems || []).reduce(
    (s, li) => s + (li.quantity || 1),
    0,
  )
  if (!(detail.lineItems || []).length) {
    if (
      (order.lineItems || []).length &&
      (order.status === 'Cancelled' || !order.orderTotal)
    ) {
      return {
        ok: true,
        note: 'detail empty — cancelled/no-total order; list data kept',
        detail: {
          orderId: detail.orderId,
          lineItemCount: 0,
          listFallback: order.lineItems?.length || 0,
        },
      }
    }
    mismatches.push('detail has 0 lineItems')
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    detail: {
      orderId: detail.orderId,
      orderTotal: detail.orderTotal,
      lineItemCount: detail.lineItems?.length || 0,
      qtySum,
      titles: (detail.lineItems || []).map((li) => ({
        title: li.title?.slice(0, 60),
        quantity: li.quantity ?? 1,
        price: li.price,
      })),
    },
  }
}

async function main() {
  const health = await fetch(`${BRIDGE}/health`).then((r) => r.json())
  if (!health.ok) throw new Error('Bridge not running')
  if (!health.agent?.extensionConnected) {
    throw new Error('Extension not connected — reload extension + Dev Agent Mode ON')
  }

  if (doCapture) {
    log('Re-capturing current Amazon tab…')
    await bridgePost('/actions/run', {
      action: 'capture_enhanced',
      params: { fast: true },
      timeoutMs: 45000,
    })
  }

  if (!fs.existsSync(LATEST)) throw new Error(`Missing ${LATEST}`)
  const snapshot = JSON.parse(fs.readFileSync(LATEST, 'utf8'))
  const url = snapshot?.page?.url || ''
  if (!/amazon\./i.test(url)) {
    throw new Error(`Latest snapshot is not Amazon: ${url}`)
  }

  const expected = expectedFromSnapshot(snapshot)
  const actual = snapshot?.adapter?.items || []
  log(`Page model orders: ${expected.size}, adapter items: ${actual.length}`)

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
    const actTitles = (act.lineItems || []).map((li) => li.title)
    if (exp.titles.length !== actTitles.length) {
      issues.push(`lineItems ${actTitles.length} != ${exp.titles.length}`)
    }
    for (let i = 0; i < exp.titles.length; i++) {
      const a = actTitles[i] || ''
      const e = exp.titles[i] || ''
      if (!a.startsWith(e.slice(0, 40)) && !e.startsWith(a.slice(0, 40))) {
        issues.push(`title[${i}] mismatch`)
      }
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

  const sampleIds = pickRandom([...expected.keys()], sampleN)
  console.log(`\n=== Random detail sample (${sampleIds.length}) ===`)

  for (const oid of sampleIds) {
    const act = actual.find((a) => a.orderId === oid)
    const exp = expected.get(oid)
    console.log(`\n--- ${oid} ---`)
    console.log(`  Expected: total=${exp?.orderTotal}, items=${exp?.titles?.length}`)
    console.log(`  List:     total=${act?.orderTotal}, items=${act?.lineItems?.length}`)
    if (exp?.titles?.[0]) console.log(`  Title:    ${exp.titles[0].slice(0, 70)}`)

    try {
      const result = await verifyDetail(act)
      if (result.ok) {
        console.log(
          `  Detail:   OK — ${result.detail.lineItemCount} items, qty sum ${result.detail.qtySum}${result.note ? ` (${result.note})` : ''}`,
        )
        for (const t of result.detail.titles || []) {
          console.log(`    · qty=${t.quantity} ${t.title}`)
        }
      } else {
        console.log(`  Detail:   FAIL — ${result.mismatches?.join('; ') || result.reason}`)
        if (result.detail) console.log(JSON.stringify(result.detail, null, 2))
      }
    } catch (err) {
      console.log(`  Detail:   ERROR — ${err.message}`)
    }
  }

  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
